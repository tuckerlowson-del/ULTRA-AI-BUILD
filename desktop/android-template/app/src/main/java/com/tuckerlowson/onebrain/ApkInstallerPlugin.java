package com.tuckerlowson.onebrain;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import androidx.core.content.FileProvider;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private File downloadedApk;

    @PluginMethod
    public void download(PluginCall call) {
        String source = call.getString("url", "");
        if (source.isEmpty()) { call.reject("Missing update URL."); return; }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(source);
                if (!"https".equalsIgnoreCase(url.getProtocol()) || !url.getHost().equalsIgnoreCase("github.com")) {
                    throw new Exception("Update URL is not from the official GitHub release host.");
                }
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("User-Agent", "ONE-BRAIN-Android-Updater");
                int code = connection.getResponseCode();
                String finalHost = connection.getURL().getHost().toLowerCase();
                if (code != 200 || !(finalHost.endsWith("githubusercontent.com") || finalHost.equals("github.com"))) {
                    throw new Exception("GitHub APK download failed (HTTP " + code + ").");
                }
                int total = connection.getContentLength();
                File folder = new File(getContext().getCacheDir(), "updates");
                if (!folder.exists() && !folder.mkdirs()) throw new Exception("Could not create update cache.");
                File target = new File(folder, "one-brain-update.apk");
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buffer = new byte[65536]; int count; long received = 0; int last = -1;
                    while ((count = in.read(buffer)) != -1) {
                        received += count; out.write(buffer, 0, count);
                        if (total > 0) {
                            int percent = (int)Math.min(100, received * 100 / total);
                            if (percent != last) { JSObject progress = new JSObject(); progress.put("percent", percent); notifyListeners("downloadProgress", progress); last = percent; }
                        }
                    }
                }
                if (!target.isFile() || target.length() < 1000000) throw new Exception("Downloaded APK is incomplete.");
                downloadedApk = target;
                JSObject result = new JSObject(); result.put("ok", true); result.put("bytes", target.length());
                call.resolve(result);
            } catch (Exception e) { call.reject(e.getMessage(), e); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (downloadedApk == null || !downloadedApk.isFile()) { call.reject("Download the update first."); return; }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settings);
                JSObject result = new JSObject(); result.put("status", "permission_required"); call.resolve(result);
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", downloadedApk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject(); result.put("status", "approval_opened"); call.resolve(result);
        } catch (Exception e) { call.reject("Could not open Android installer: " + e.getMessage(), e); }
    }
}
