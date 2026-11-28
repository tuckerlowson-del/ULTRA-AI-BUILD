package com.tuckerlowson.onebrain;

import android.content.Intent;
import android.net.Uri;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.FileProvider;
import java.io.*;
import java.net.*;
import java.util.Enumeration;
import java.util.HashSet;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private File downloadedApk;

    private static final String API_KEY_ALIAS = "onebrain_openrouter_api_key";
    private static final String SECURE_PREFS = "onebrain_secure_settings";

    private SecretKey getOrCreateApiKeySecret() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(API_KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(API_KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(API_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void saveApiKey(PluginCall call) {
        try {
            String value = call.getString("key", "").trim();
            if (value.isEmpty() || value.length() > 500) {
                call.reject("Enter a valid API key.");
                return;
            }
            SecretKey secret = getOrCreateApiKeySecret();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secret);
            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
            getContext().getSharedPreferences(SECURE_PREFS, 0).edit()
                .putString("openrouter_api_key", Base64.encodeToString(combined, Base64.NO_WRAP))
                .apply();
            JSObject result = new JSObject();
            result.put("saved", true);
            result.put("encrypted", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not securely save the API key: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getApiKey(PluginCall call) {
        try {
            SharedPreferences preferences = getContext().getSharedPreferences(SECURE_PREFS, 0);
            String stored = preferences.getString("openrouter_api_key", null);
            JSObject result = new JSObject();
            if (stored == null || stored.isEmpty()) {
                result.put("key", "");
                result.put("persisted", false);
                result.put("available", true);
                call.resolve(result);
                return;
            }
            byte[] combined = Base64.decode(stored, Base64.NO_WRAP);
            if (combined.length <= 12) throw new Exception("Stored API key data is invalid.");
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[combined.length - 12];
            System.arraycopy(combined, 0, iv, 0, 12);
            System.arraycopy(combined, 12, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateApiKeySecret(), new GCMParameterSpec(128, iv));
            String value = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            result.put("key", value);
            result.put("persisted", true);
            result.put("available", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read the encrypted API key: " + e.getMessage(), e);
        }
    }


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
            HashSet<String> seenIps = new HashSet<>();
            if (localAddress != null) {
                JSObject local = new JSObject();
                local.put("ip", localAddress);
                local.put("name", "This phone");
                local.put("kind", "Local device");
                local.put("local", true);
                devices.put(local);
                seenIps.add(localAddress);
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
                        if (!seenIps.add(ip)) continue;
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
