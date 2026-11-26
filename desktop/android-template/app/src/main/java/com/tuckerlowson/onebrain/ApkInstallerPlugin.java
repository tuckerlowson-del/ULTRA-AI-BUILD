package com.tuckerlowson.onebrain;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.FileProvider;
import java.io.*;
import java.net.*;
import java.util.Enumeration;
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
    public void getNetworkDevices(PluginCall call) {
        try {
            String localAddress = null;
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback()) continue;
                Enumeration<InetAddress> addresses = network.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        localAddress = address.getHostAddress();
                        break;
                    }
                }
                if (localAddress != null) break;
            }
            JSArray devices = new JSArray();
            if (localAddress != null) {
                JSObject local = new JSObject();
                local.put("ip", localAddress);
                local.put("name", "This phone");
                local.put("kind", "Local device");
                local.put("local", true);
                devices.put(local);
            }
            File arp = new File("/proc/net/arp");
            if (arp.isFile()) {
                try (BufferedReader reader = new BufferedReader(new FileReader(arp))) {
                    String line;
                    reader.readLine();
                    while ((line = reader.readLine()) != null) {
                        String[] fields = line.trim().split("\\s+");
                        if (fields.length < 4) continue;
                        String ip = fields[0];
                        String mac = fields[3].toLowerCase();
                        String[] octets = ip.split("\\.");
                        if (octets.length != 4 || mac.equals("00:00:00:00:00:00")) continue;
                        boolean privateIp = octets[0].equals("10") ||
                            (octets[0].equals("172") && Integer.parseInt(octets[1]) >= 16 && Integer.parseInt(octets[1]) <= 31) ||
                            (octets[0].equals("192") && octets[1].equals("168"));
                        if (!privateIp || ip.equals(localAddress)) continue;
                        boolean duplicate = false;
                        for (int i = 0; i < devices.length(); i++) {
                            JSObject existing = devices.getJSONObject(i);
                            if (ip.equals(existing.optString("ip"))) { duplicate = true; break; }
                        }
                        if (duplicate) continue;
                        JSObject device = new JSObject();
                        device.put("ip", ip);
                        device.put("mac", mac);
                        device.put("name", "Detected device");
                        device.put("kind", "LAN device");
                        device.put("local", false);
                        devices.put(device);
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("devices", devices);
            result.put("interfaceName", localAddress == null ? "No active IPv4 interface" : localAddress);
            result.put("updatedAt", java.time.Instant.now().toString());
            result.put("method", "Passive local ARP neighbour table");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Local network information is unavailable: " + e.getMessage(), e);
        }
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
