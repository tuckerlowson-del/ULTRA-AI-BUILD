import { registerPlugin, Capacitor } from "@capacitor/core";

// Electron supplies its own secure preload bridge. Android gets a native APK updater
// plus the existing chat-only capabilities.
if (!window.onebrain) {
  const listeners = new Set();
  let activeController = null;
  let workspace = "Android device";
  let updateState = { status: "idle", message: "Updates have not been checked yet.", version: null, percent: 0 };
  const ApkInstaller = Capacitor.isNativePlatform() ? registerPlugin("ApkInstaller") : null;
  const emit = (event) => listeners.forEach((listener) => {
    try { listener({ ...event, at: event.at || new Date().toISOString() }); } catch {}
  });
  const setUpdate = (status, message, extra = {}) => {
    updateState = { ...updateState, status, message, ...extra };
    emit({ type: "update", update: updateState });
  };
  const versionTuple = (value) => String(value || "0").replace(/^v/, "").split(/[.+-]/).map(x => Number.parseInt(x, 10) || 0);
  const isNewer = (a, b) => {
    const aa=versionTuple(a), bb=versionTuple(b);
    for(let i=0;i<Math.max(aa.length,bb.length);i++){if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0);}
    return false;
  };
  if (ApkInstaller) {
    ApkInstaller.addListener("downloadProgress", event => {
      const percent = Math.max(0, Math.min(100, Math.round(event.percent || 0)));
      setUpdate("downloading", "Downloading update… " + percent + "%", { percent });
    });
  }
  window.onebrain = {
    isMobile: true,
    async getApiKey() {
      if (!ApkInstaller) return { key: "", persisted: false, available: false };
      return await ApkInstaller.getApiKey();
    },
    async saveApiKey(key) {
      if (!ApkInstaller) throw new Error("Secure API key storage is only available in the installed Android app.");
      return await ApkInstaller.saveApiKey({ key: String(key || "").trim() });
    },
    getUpdateStatus: async () => updateState,
    onUpdateStatus(callback) {
      const handler = event => { if(event.type==="update") callback(event.update); };
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    async checkForUpdates() {
      if (!ApkInstaller) {
        setUpdate("unsupported", "Android app installation updates are available only in the installed Android app.");
        return updateState;
      }
      setUpdate("checking", "Checking official ONE BRAIN Android releases…");
      try {
        const response = await fetch("https://api.github.com/repos/tuckerlowson-del/ULTRA-AI-BUILD/releases?per_page=30", {
          headers: { "Accept": "application/vnd.github+json" }, cache: "no-store"
        });
        if (!response.ok) throw new Error("GitHub update check failed (HTTP " + response.status + ").");
        const releases = await response.json();
        const release = releases.find(item => !item.draft && item.assets?.some(asset =>
          asset.name.toLowerCase().endsWith(".apk") && /one[-_]brain.*android/i.test(asset.name)
        ));
        if (!release) {
          setUpdate("current", "No signed Android update release is published yet.", { version: null, percent: 0 });
          return updateState;
        }
        const asset = release.assets.find(item => item.name.toLowerCase().endsWith(".apk") && /one[-_]brain.*android/i.test(item.name));
        const latestVersion = release.tag_name.replace(/^android-v/, "").replace(/^v/, "");
        const currentVersion = import.meta.env.VITE_APP_VERSION || "0.4.2";
        if (!isNewer(latestVersion, currentVersion)) {
          setUpdate("current", "ONE BRAIN is up to date (v" + currentVersion + ").", { version: currentVersion, percent: 0 });
        } else {
          window.__oneBrainAndroidUpdate = { url: asset.browser_download_url, version: latestVersion };
          setUpdate("available", "Version " + latestVersion + " is available. Downloading automatically…", { version: latestVersion, percent: 0 });
          await window.onebrain.downloadUpdate();
        }
      } catch (error) {
        setUpdate("error", error.message || "Could not check for Android updates.");
      }
      return updateState;
    },
    async downloadUpdate() {
      const update = window.__oneBrainAndroidUpdate;
      if (!update?.url || !ApkInstaller) throw new Error("There is no available Android update to download.");
      setUpdate("downloading", "Preparing secure download…", { percent: 0 });
      try {
        await ApkInstaller.download({ url: update.url });
        setUpdate("downloaded", "Update downloaded. Tap Install update to continue.", { version: update.version, percent: 100 });
      } catch (error) {
        setUpdate("error", error.message || "APK download failed.");
        throw error;
      }
      return updateState;
    },
    async installUpdate() {
      if (!ApkInstaller) throw new Error("Android installer is unavailable.");
      const result = await ApkInstaller.install();
      if (result?.status === "permission_required") {
        setUpdate("downloaded", "Allow ONE BRAIN to install updates in Android settings, return here, then tap Install update again.");
      } else {
        setUpdate("installing", "Android is opening its update approval screen…");
      }
      return result;
    },
    async getWorkspace() { return workspace; },
    async chooseWorkspace() {
      emit({ type: "status", message: "Folder selection is not available in the Android edition." });
      return workspace;
    },
    async getNetworkDevices() {
      if (ApkInstaller) {
        try { return await ApkInstaller.getNetworkDevices(); }
        catch (error) { return { devices: [], interfaceName: error.message || "Local network details unavailable", updatedAt: new Date().toISOString() }; }
      }
      return { devices: [], interfaceName: "Android network details unavailable", updatedAt: new Date().toISOString() };
    },
    onAgentEvent(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    stopAgent() {
      if (activeController) activeController.abort();
      emit({ type: "status", message: "Request stopped." });
    },
    async runAgent(task, apiKey, model, endpoint) {
      if (!apiKey || !apiKey.trim()) throw new Error("Add your OpenRouter API key in Settings first.");
      activeController = new AbortController();
      emit({ type: "status", message: "Connecting to OpenRouter…" });
      try {
        const response = await fetch((String(endpoint||"https://openrouter.ai/api/v1").replace(/\\/+$/,"").endsWith("/chat/completions")?String(endpoint).replace(/\\/+$/,""):String(endpoint||"https://openrouter.ai/api/v1").replace(/\\/+$/,"")+"/chat/completions"), {
          method: "POST", signal: activeController.signal,
          headers: { "Authorization": /^Bearer\\s/i.test(apiKey.trim()) ? apiKey.trim() : `Bearer ${apiKey.trim()}`, "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/tuckerlowson-del/ULTRA-AI-BUILD", "X-Title": "ONE BRAIN Android" },
          body: JSON.stringify({ model: model.trim() || "openai/gpt-4o",
            messages: [{ role: "system", content: "You are ONE BRAIN, a helpful AI assistant. You are running in Android. You cannot control the phone, a Windows PC, access local files, or perform background actions. Be clear about these limits." },
              { role: "user", content: task }] })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error?.message || `API provider request failed (HTTP ${response.status}).`);
        const answer = data?.choices?.[0]?.message?.content;
        const result = Array.isArray(answer) ? answer.map(part => part.text || "").join("\\n") : answer;
        if (!result) throw new Error("The selected model returned an empty response.");
        emit({ type: "final", message: String(result) });
        return result;
      } catch (error) {
        if (error.name === "AbortError") { emit({ type: "status", message: "Request stopped." }); return; }
        emit({ type: "error", message: error.message || "AI request failed." }); throw error;
      } finally { activeController = null; }
    }
  };
}
