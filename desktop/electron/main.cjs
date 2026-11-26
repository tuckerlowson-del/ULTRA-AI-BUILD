const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const os = require("node:os");
const execFileAsync = promisify(execFile);
let mainWindow;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => { if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
let workspace = app.getPath("documents");
let stopRequested = false;
let running = false;
let updateState = { status: "idle", message: "Updates have not been checked yet.", version: null, percent: 0 };
function emitUpdate(status, message, extra = {}) {
  updateState = { ...updateState, status, message, ...extra };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:status", updateState);
}
function configureAutoUpdates() {
  if (!app.isPackaged || process.platform !== "win32") { emitUpdate("unsupported", "Automatic updates are available in the installed Windows version."); return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => emitUpdate("checking", "Checking GitHub Releases for updates…"));
  autoUpdater.on("update-available", info => emitUpdate("available", "Version " + info.version + " is available.", { version: info.version, percent: 0 }));
  autoUpdater.on("update-not-available", info => emitUpdate("current", "You are using the latest version (" + info.version + ").", { version: info.version, percent: 0 }));
  autoUpdater.on("download-progress", progress => emitUpdate("downloading", "Downloading update… " + Math.round(progress.percent) + "%", { percent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", info => emitUpdate("downloaded", "Version " + info.version + " is ready to install.", { version: info.version, percent: 100 }));
  autoUpdater.on("error", error => emitUpdate("error", "Update failed: " + (error && error.message ? error.message : String(error))));
  setTimeout(() => { autoUpdater.checkForUpdates().catch(error => emitUpdate("error", "Update check failed: " + error.message)); }, 8000);
}

function emit(type, message, extra = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("agent:event", { type, message, ...extra, at: new Date().toISOString() });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1080, minHeight: 700,
    backgroundColor: "#080d17", title: "ONE BRAIN",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (!app.isPackaged) mainWindow.loadURL("http://127.0.0.1:5173");
  else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}
app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  createWindow();
  configureAutoUpdates();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
ipcMain.handle("updates:get", () => updateState);
ipcMain.handle("updates:check", async () => {
  if (!app.isPackaged || process.platform !== "win32") return { ...updateState, status: "unsupported", message: "Install the Windows desktop version to use automatic updates." };
  emitUpdate("checking", "Checking GitHub Releases for updates…");
  try { await autoUpdater.checkForUpdates(); } catch (error) { emitUpdate("error", "Update check failed: " + error.message); }
  return updateState;
});
ipcMain.handle("updates:download", async () => {
  if (updateState.status !== "available") throw new Error("There is no available update to download.");
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (error) { emitUpdate("error", "Download failed: " + error.message); throw error; }
});
ipcMain.handle("updates:install", () => {
  if (updateState.status !== "downloaded") throw new Error("Download the update before installing it.");
  setImmediate(() => autoUpdater.quitAndInstall(false, true)); return { ok: true };
});
ipcMain.handle("workspace:get", () => workspace);
ipcMain.handle("workspace:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
  if (!result.canceled && result.filePaths[0]) workspace = result.filePaths[0];
  return workspace;
});
ipcMain.on("agent:stop", () => { stopRequested = true; emit("status", "Stop requested. Finishing the current safe operation…"); });
let mdtCache = null;
let mdtCacheAt = 0;
ipcMain.handle("mdt:network", async () => {
  if (mdtCache && Date.now() - mdtCacheAt < 15000) return { ...mdtCache, cached: true };
  const interfaces = Object.values(os.networkInterfaces()).flat().filter(item =>
    item && item.family === "IPv4" && !item.internal &&
    (/^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)/.test(item.address))
  );
  const local = interfaces[0] || null;
  if (!local) return { devices: [], interfaceName: "No active private IPv4 network", updatedAt: new Date().toISOString(), method: "No private LAN interface found" };
  const ipParts = local.address.split(".").map(Number);
  const base = ipParts.slice(0, 3).join(".");
  const candidates = Array.from({ length: 254 }, (_, i) => base + "." + (i + 1)).filter(ip => ip !== local.address);
  let cursor = 0;
  const responders = new Set();
  const worker = async () => {
    while (cursor < candidates.length) {
      const ip = candidates[cursor++];
      try {
        await execFileAsync("ping", ["-n", "1", "-w", "350", ip], { windowsHide: true, timeout: 1000, maxBuffer: 2000 });
        responders.add(ip);
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: 24 }, worker));
  let arpText = "";
  try {
    const result = await execFileAsync("arp", ["-a"], { windowsHide: true, timeout: 5000, maxBuffer: 30000 });
    arpText = result.stdout || "";
  } catch {}
  const macs = new Map();
  const rowPattern = /((?:\\d{1,3}\\.){3}\\d{1,3})\\s+([0-9a-f-]{11,17})/ig;
  for (const match of arpText.matchAll(rowPattern)) macs.set(match[1], match[2].replace(/-/g, ":").toLowerCase());
  const devices = [{ ip: local.address, name: os.hostname() || "This PC", kind: "Local device", local: true }];
  for (const ip of candidates) {
    const mac = macs.get(ip);
    if (!responders.has(ip) && !mac) continue;
    devices.push({ ip, mac: mac || null, name: "LAN device", kind: "Detected device", local: false });
  }
  mdtCache = { devices, interfaceName: local.address, networkRange: base + ".0/24", updatedAt: new Date().toISOString(), method: "Private LAN ICMP discovery + ARP neighbour table", scanNote: "Only the local /24 was checked. No ports were scanned and no devices were accessed." };
  mdtCacheAt = Date.now();
  return mdtCache;
});


function withinWorkspace(candidate) {
  const resolved = path.resolve(workspace, candidate || ".");
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Access outside the selected workspace is blocked.");
  return resolved;
}
async function captureScreen() {
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 720 } });
  if (!sources.length) throw new Error("No screen source is available.");
  const image = sources[0].thumbnail.toDataURL();
  emit("screen", "Desktop preview refreshed.", { image });
  return { ok: true, width: sources[0].thumbnail.getSize().width, height: sources[0].thumbnail.getSize().height, image };
}
async function computerAction(kind, args) {
  const { mouse, keyboard, Button, Key, Point, straightTo } = require("@nut-tree-fork/nut-js");
  if (kind === "click") {
    const x = Math.max(0, Math.min(10000, Number(args.x)));
    const y = Math.max(0, Math.min(10000, Number(args.y)));
    await mouse.move(straightTo(new Point(x, y))); await mouse.click(Button.LEFT);
    return { ok: true, action: "left_click", x, y };
  }
  if (kind === "type") {
    const value = String(args.text || "").slice(0, 1000);
    await keyboard.type(value);
    return { ok: true, characters: value.length };
  }
  if (kind === "key") {
    const allowed = { ENTER: Key.Enter, TAB: Key.Tab, ESC: Key.Escape, SPACE: Key.Space, BACKSPACE: Key.Backspace, UP: Key.Up, DOWN: Key.Down, LEFT: Key.Left, RIGHT: Key.Right };
    const key = allowed[String(args.key || "").toUpperCase()];
    if (!key) throw new Error("That key is not in the permitted key list.");
    await keyboard.pressKey(key);
    return { ok: true, key: String(args.key).toUpperCase() };
  }
}
async function approveAction(description) {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question", buttons: ["Allow once", "Deny"], defaultId: 1, cancelId: 1,
    title: "ONE BRAIN permission request", message: description,
    detail: "This action will be performed on your computer. Approve only if you understand what it will do."
  });
  return result.response === 0;
}
const toolSpecs = [
  { type: "function", function: { name: "computer_screenshot", description: "Capture the current desktop and show it in the live preview.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "computer_click", description: "Click a screen coordinate. Requires user approval.", parameters: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x","y"], additionalProperties: false } } },
  { type: "function", function: { name: "computer_type", description: "Type text into the currently focused application. Requires user approval.", parameters: { type: "object", properties: { text: { type: "string", maxLength: 1000 } }, required: ["text"], additionalProperties: false } } },
  { type: "function", function: { name: "computer_press_key", description: "Press one permitted key: ENTER, TAB, ESC, SPACE, BACKSPACE, UP, DOWN, LEFT, RIGHT. Requires approval.", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } } },
  { type: "function", function: { name: "open_url", description: "Open a web address in the default browser. Requires approval.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } } },
  { type: "function", function: { name: "list_workspace", description: "List files and folders in the selected workspace or a relative subfolder.", parameters: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false } } },
  { type: "function", function: { name: "read_text_file", description: "Read a small text file inside the selected workspace.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "run_safe_command", description: "Run a read-only diagnostic command from the permitted list. Requires approval.", parameters: { type: "object", properties: { command: { type: "string", enum: ["whoami","hostname","ipconfig","tasklist","systeminfo","ver","date","time"] } }, required: ["command"], additionalProperties: false } } },
  { type: "function", function: { name: "list_running_apps", description: "List running Windows applications and processes (read-only).", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "launch_approved_app", description: "Launch an approved built-in Windows app. Requires user approval.", parameters: { type: "object", properties: { app: { type: "string", enum: ["notepad","calculator","file_explorer","task_manager","paint","settings"] } }, required: ["app"], additionalProperties: false } } },
  { type: "function", function: { name: "open_workspace_folder", description: "Open the selected workspace or a subfolder in File Explorer. Requires user approval.", parameters: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false } } }
];
async function executeTool(name, args) {
  if (name === "computer_screenshot") return captureScreen();
  if (name === "computer_click" || name === "computer_type" || name === "computer_press_key") {
    const description = name === "computer_click" ? "ONE BRAIN wants to click screen position " + args.x + ", " + args.y + "." :
      name === "computer_type" ? "ONE BRAIN wants to type: " + String(args.text || "").slice(0, 180) :
      "ONE BRAIN wants to press " + args.key + ".";
    if (!await approveAction(description)) return { ok: false, denied: true, message: "User denied this action." };
    return computerAction(name === "computer_click" ? "click" : name === "computer_type" ? "type" : "key", args);
  }
  if (name === "open_url") {
    const parsed = new URL(args.url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS links are allowed.");
    if (!await approveAction("Open this website in your default browser?\n" + parsed.href)) return { ok: false, denied: true };
    await shell.openExternal(parsed.href); return { ok: true, url: parsed.href };
  }
  if (name === "list_workspace") {
    const target = withinWorkspace(args.path || ".");
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries.slice(0, 100).map(entry => ({ name: entry.name, type: entry.isDirectory() ? "folder" : "file" }));
  }
  if (name === "read_text_file") {
    const target = withinWorkspace(args.path);
    const stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > 200000) throw new Error("Only text files up to 200 KB can be read.");
    return (await fs.readFile(target, "utf8")).slice(0, 200000);
  }
  if (name === "list_running_apps") {
    const result = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true, timeout: 10000, maxBuffer: 50000 });
    const rows = result.stdout.split(/\\r?\\n/).filter(Boolean).slice(0, 120);
    return rows.map(line => { const cols = line.match(/"([^"]*)"/g) || []; return { process: (cols[0] || "").replace(/"/g, ""), pid: (cols[1] || "").replace(/"/g, ""), memory: (cols[4] || "").replace(/"/g, "") }; });
  }
  if (name === "launch_approved_app") {
    const apps = { notepad: "notepad.exe", calculator: "calc.exe", file_explorer: "explorer.exe", task_manager: "taskmgr.exe", paint: "mspaint.exe", settings: "ms-settings:" };
    const target = apps[args.app];
    if (!target) throw new Error("This app is not on the approved launch list.");
    if (!await approveAction("ONE BRAIN wants to open " + args.app.replace(/_/g, " ") + ".")) return { ok: false, denied: true };
    if (target.endsWith(":")) await shell.openExternal(target);
    else await execFileAsync(target, [], { windowsHide: false, timeout: 5000 });
    return { ok: true, launched: args.app };
  }
  if (name === "open_workspace_folder") {
    const target = withinWorkspace(args.path || ".");
    if (!await approveAction("Open this folder in File Explorer?\\n" + target)) return { ok: false, denied: true };
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target };
  }
  if (name === "run_safe_command") {
    const allowed = ["whoami","hostname","ipconfig","tasklist","systeminfo","ver","date","time"];
    if (!allowed.includes(args.command)) throw new Error("Command is not permitted.");
    if (!await approveAction("Run this read-only Windows diagnostic command?\n" + args.command)) return { ok: false, denied: true };
    const result = await execFileAsync("cmd.exe", ["/d", "/s", "/c", args.command], { windowsHide: true, timeout: 15000, maxBuffer: 50000 });
    return { stdout: result.stdout.slice(0, 12000), stderr: result.stderr.slice(0, 3000) };
  }
  throw new Error("Unknown tool: " + name);
}
ipcMain.handle("agent:run", async (_event, { task, key, model }) => {
  if (running) throw new Error("An agent task is already running.");
  if (!task || !String(task).trim()) throw new Error("Enter a task first.");
  if (!key) throw new Error("Add your OpenRouter API key in the app first.");
  running = true; stopRequested = false;
  const chosenModel = model || "openai/gpt-4o";
  const messages = [
    { role: "system", content: "You are ONE BRAIN, a careful desktop AI operator. You have desktop screenshot, mouse click, keyboard typing/key, approved app launching, running-app listing, workspace file listing/reading/folder opening, approved website opening, and read-only diagnostics tools. Inspect before acting, use the appropriate tool, verify outcomes, and report clearly. Never ask for or handle passwords, payment details, private keys, or sensitive personal data. Never delete files, install software, change security settings, or run arbitrary shell commands. Ask before every click, keystroke, URL open, or diagnostic command. The selected workspace is the only file area you may inspect. If a tool is denied, do not retry it. Stop when asked." },
    { role: "user", content: String(task).slice(0, 6000) }
  ];
  try {
    emit("status", "Agent planning task…", { model: chosenModel });
    for (let step = 0; step < 10; step++) {
      if (stopRequested) { emit("status", "Agent stopped."); break; }
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json", "HTTP-Referer": "https://one-brain-updater.tuckerlowson.workers.dev", "X-Title": "ONE BRAIN" },
        body: JSON.stringify({ model: chosenModel, messages, tools: toolSpecs, tool_choice: "auto", temperature: 0.2 })
      });
      if (!response.ok) throw new Error("OpenRouter returned " + response.status + ": " + (await response.text()).slice(0, 600));
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("The model returned an empty response.");
      messages.push(message);
      if (!message.tool_calls?.length) {
        emit("final", message.content || "Task finished, but the model returned no final text.");
        break;
      }
      for (const call of message.tool_calls) {
        if (stopRequested) break;
        let args = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
        emit("tool", "Using " + call.function.name, { tool: call.function.name, args });
        let result;
        try { result = await executeTool(call.function.name, args); }
        catch (error) { result = { error: error.message || String(error) }; }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 16000) });
        const safeResult = call.function.name === "computer_screenshot" && result && result.image ? { ok: true, width: result.width, height: result.height, previewSentToUI: true } : result;
        messages[messages.length - 1].content = JSON.stringify(safeResult).slice(0, 16000);
        if (call.function.name === "computer_screenshot" && result && result.image) {
          messages.push({ role: "user", content: [{ type: "text", text: "Current desktop screenshot for visual inspection." }, { type: "image_url", image_url: { url: result.image } }] });
        }
        emit("tool_result", call.function.name + " finished", { result: safeResult });
      }
      if (step === 9) emit("final", "Stopped after the 10-step safety limit. Review the activity log and continue with a more specific task if needed.");
    }
  } catch (error) {
    emit("error", error.message || String(error));
    throw error;
  } finally { running = false; }
  return { ok: true };
});