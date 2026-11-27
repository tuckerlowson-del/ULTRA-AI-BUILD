const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, shell, safeStorage, screen } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const os = require("node:os");
const execFileAsync = promisify(execFile);
let mainWindow;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => { if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
let workspace = app.getPath("documents");
let screenCaptureMetrics = { imageWidth: 1280, imageHeight: 720 };
const apiKeyFile = path.join(app.getPath("userData"), "openrouter-key.enc");
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
ipcMain.handle("settings:api-key:get", async () => {
  if (!safeStorage.isEncryptionAvailable()) return { key: "", persisted: false, available: false };
  try {
    const encrypted = await fs.readFile(apiKeyFile);
    return { key: safeStorage.decryptString(encrypted), persisted: true, available: true };
  } catch (error) {
    if (error && error.code === "ENOENT") return { key: "", persisted: false, available: true };
    throw error;
  }
});
ipcMain.handle("settings:api-key:set", async (_event, value) => {
  const key = String(value || "").trim();
  if (!key || key.length > 500) throw new Error("Enter a valid API key.");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage is unavailable. The API key was not saved.");
  await fs.mkdir(path.dirname(apiKeyFile), { recursive: true });
  await fs.writeFile(apiKeyFile, safeStorage.encryptString(key), { mode: 0o600 });
  return { saved: true, encrypted: true };
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
ipcMain.handle("system:overview", () => { const cpus=os.cpus()||[]; const network=Object.values(os.networkInterfaces()).flat().filter(item=>item&&item.family==="IPv4"&&!item.internal).map(item=>({address:item.address,netmask:item.netmask})); return {computer:os.hostname(),operatingSystem:os.type()+" "+os.release(),architecture:os.arch(),processor:cpus[0]?.model||"Unknown",logicalCores:cpus.length,memoryTotalMB:Math.round(os.totalmem()/1048576),memoryFreeMB:Math.round(os.freemem()/1048576),uptimeMinutes:Math.round(os.uptime()/60),network}; });
ipcMain.handle("mdt:network", async () => {
 if(mdtCache&&Date.now()-mdtCacheAt<10000)return {...mdtCache,cached:true};
 const interfaces=Object.values(os.networkInterfaces()).flat().filter(item=>item&&item.family==="IPv4"&&!item.internal&&(/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(item.address)));
 const local=interfaces[0]||null;if(!local)return {devices:[],interfaceName:"No active private IPv4 network",updatedAt:new Date().toISOString(),method:"No private LAN interface found"};
 const [arpResult,neighborResult,wifiResult]=await Promise.allSettled([
  execFileAsync("arp.exe",["-a"],{windowsHide:true,timeout:4000,maxBuffer:30000}),
  execFileAsync("powershell.exe",["-NoProfile","-NonInteractive","-Command","Get-NetNeighbor -AddressFamily IPv4 | Where-Object { $_.State -notin @('Unreachable','Incomplete') } | Select-Object IPAddress,LinkLayerAddress,State | ConvertTo-Json -Compress"],{windowsHide:true,timeout:5000,maxBuffer:30000}),
  execFileAsync("netsh.exe",["wlan","show","interfaces"],{windowsHide:true,timeout:3000,maxBuffer:10000})
 ]);
 const found=new Map(),arp=arpResult.status==="fulfilled"?(arpResult.value.stdout||""):"",row=/((?:\d{1,3}\.){3}\d{1,3})\s+([0-9a-f-]{11,17})/ig;
 for(const hit of arp.matchAll(row))found.set(hit[1],{ip:hit[1],mac:hit[2].replace(/-/g,":").toLowerCase(),source:"ARP cache"});
 if(neighborResult.status==="fulfilled"){try{const parsed=JSON.parse(neighborResult.value.stdout||"[]");for(const entry of (Array.isArray(parsed)?parsed:[parsed])){const ip=String(entry.IPAddress||""),mac=String(entry.LinkLayerAddress||"");if(ip&&mac&&mac!=="00-00-00-00-00-00")found.set(ip,{ip,mac:mac.replace(/-/g,":").toLowerCase(),source:"Windows neighbour cache",state:String(entry.State||"")});}}catch{}}
 const prefix=local.address.split(".").slice(0,3).join("."),devices=[{ip:local.address,name:os.hostname()||"This PC",kind:"Local device",local:true,source:"This PC"}];
 for(const entry of found.values())if(entry.ip.startsWith(prefix+".")&&entry.ip!==local.address&&!entry.ip.endsWith(".0")&&!entry.ip.endsWith(".255"))devices.push({...entry,name:"LAN device",kind:"Detected neighbour",local:false});
 const wifi=wifiResult.status==="fulfilled"?(wifiResult.value.stdout||""):"",signal=(wifi.match(/Signal\s*:\s*(\d+)%/i)||[])[1]||null,ssid=(wifi.match(/SSID\s*:\s*(.+)/i)||[])[1]?.trim()||null;
 mdtCache={devices,interfaceName:local.address,networkRange:prefix+".0/24",updatedAt:new Date().toISOString(),method:"ARP + Windows neighbour cache (no ping sweep)",wifi:{ssid,signalPercent:signal?Number(signal):null},scanNote:"Only devices visible to this PC in the active subnet are listed. This does not expose the router's full Wi-Fi client table, scan ports, or access other devices. Router APIs are needed for complete client lists; access-point telemetry is needed for movement estimates."};mdtCacheAt=Date.now();return mdtCache;
});

function withinWorkspace(candidate) {
  const resolved = path.resolve(workspace, candidate || ".");
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Access outside the selected workspace is blocked.");
  return resolved;
}
async function captureScreen(sendEvent = true) {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 720 } });
  if (!sources.length) throw new Error("No screen source is available.");
  const source = sources.find(item => item.display_id === String(display.id)) || sources[0];
  const size = source.thumbnail.getSize();
  screenCaptureMetrics = { imageWidth: size.width, imageHeight: size.height, screenWidth: display.size.width, screenHeight: display.size.height };
  const image = source.thumbnail.toDataURL();
  if (sendEvent) emit("screen", "Desktop screenshot captured for visual inspection.", { image, width: size.width, height: size.height });
  return { ok: true, width: size.width, height: size.height, displayWidth: display.size.width, displayHeight: display.size.height, image };
}
async function computerAction(kind, args) {
  const { mouse, keyboard, Button, Key, Point, straightTo } = require("@nut-tree-fork/nut-js");
  if (kind === "click") {
    const x = Number(args.x), y = Number(args.y);
    const imageWidth = screenCaptureMetrics.imageWidth || 1280;
    const imageHeight = screenCaptureMetrics.imageHeight || 720;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= imageWidth || y >= imageHeight) throw new Error("Click coordinates are outside the latest desktop screenshot.");
    const display = screen.getPrimaryDisplay().size;
    const screenX = Math.max(0, Math.min(display.width - 1, Math.round(x * display.width / imageWidth)));
    const screenY = Math.max(0, Math.min(display.height - 1, Math.round(y * display.height / imageHeight)));
    const xPercent = x / imageWidth * 100, yPercent = y / imageHeight * 100;
    await mouse.move(straightTo(new Point(screenX, screenY)));
    emit("cursor", "Custom pointer moved to the selected desktop target.", { xPercent, yPercent, clicked: false });
    await mouse.click(Button.LEFT);
    emit("cursor", "Desktop click completed.", { xPercent, yPercent, clicked: true });
    return { ok: true, action: "left_click", screenshotX: x, screenshotY: y, screenX, screenY, screenshotSize: { width: imageWidth, height: imageHeight }, screenSize: display };
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
const toolSpecs = [
  { type: "function", function: { name: "computer_screenshot", description: "Capture the current desktop and show it in the live preview.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "computer_click", description: "Click a pixel coordinate from the latest desktop screenshot. Inspect a fresh screenshot first. Coordinates are mapped to the real display resolution; routine clicks execute immediately.", parameters: { type: "object", properties: { x: { type: "integer", minimum: 0, maximum: 1279 }, y: { type: "integer", minimum: 0, maximum: 719 } }, required: ["x","y"], additionalProperties: false } } },
  { type: "function", function: { name: "computer_type", description: "Type text into the currently focused application immediately. Do not type passwords or payment details.", parameters: { type: "object", properties: { text: { type: "string", maxLength: 1000 } }, required: ["text"], additionalProperties: false } } },
  { type: "function", function: { name: "computer_press_key", description: "Press one permitted key immediately: ENTER, TAB, ESC, SPACE, BACKSPACE, UP, DOWN, LEFT, RIGHT.", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } } },
  { type: "function", function: { name: "open_url", description: "Open an HTTP or HTTPS web address in the default browser immediately.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } } },
  { type: "function", function: { name: "list_workspace", description: "List files and folders in the selected workspace or a relative subfolder.", parameters: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false } } },
  { type: "function", function: { name: "read_text_file", description: "Read a small text file inside the selected workspace.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "run_safe_command", description: "Run a read-only diagnostic command from the permitted list immediately.", parameters: { type: "object", properties: { command: { type: "string", enum: ["whoami","hostname","ipconfig","tasklist","systeminfo","ver","date","time"] } }, required: ["command"], additionalProperties: false } } },
  { type: "function", function: { name: "get_system_overview", description: "Read basic PC hardware, memory, uptime and local network summary.", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "list_running_apps", description: "List running Windows applications and processes (read-only).", parameters: { type: "object", properties: {}, additionalProperties: false } } },
  { type: "function", function: { name: "launch_approved_app", description: "Launch an approved built-in Windows app immediately.", parameters: { type: "object", properties: { app: { type: "string", enum: ["notepad","calculator","file_explorer","task_manager","paint","settings"] } }, required: ["app"], additionalProperties: false } } },
  { type: "function", function: { name: "open_workspace_folder", description: "Open the selected workspace or a subfolder in File Explorer immediately.", parameters: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false } } }
];
async function executeTool(name, args) {
  if (name === "computer_screenshot") return captureScreen();
  if (name === "computer_click" || name === "computer_type" || name === "computer_press_key") return computerAction(name === "computer_click" ? "click" : name === "computer_type" ? "type" : "key", args);
  if (name === "open_url") {
    const parsed = new URL(args.url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS links are allowed.");
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
  if (name === "get_system_overview") {
    const cpus = os.cpus() || [];
    const network = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === "IPv4" && !item.internal).map(item => ({ address: item.address, netmask: item.netmask }));
    return { computer: os.hostname(), operatingSystem: os.type() + " " + os.release(), architecture: os.arch(), processor: cpus[0]?.model || "Unknown", logicalCores: cpus.length, memoryTotalMB: Math.round(os.totalmem() / 1048576), memoryFreeMB: Math.round(os.freemem() / 1048576), uptimeMinutes: Math.round(os.uptime() / 60), network };
  }
  if (name === "list_running_apps") {
    const result = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"], { windowsHide: true, timeout: 10000, maxBuffer: 50000 });
    const rows = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 120);
    return rows.map(line => { const cols = line.match(/"([^"]*)"/g) || []; return { process: (cols[0] || "").replace(/"/g, ""), pid: (cols[1] || "").replace(/"/g, ""), memory: (cols[4] || "").replace(/"/g, "") }; });
  }
  if (name === "launch_approved_app") {
    const apps = { notepad: "notepad.exe", calculator: "calc.exe", file_explorer: "explorer.exe", task_manager: "taskmgr.exe", paint: "mspaint.exe", settings: "ms-settings:" };
    const target = apps[args.app];
    if (!target) throw new Error("This app is not on the approved launch list.");
    if (target.endsWith(":")) await shell.openExternal(target);
    else { const child = spawn(target, [], { detached: true, stdio: "ignore", windowsHide: false }); child.unref(); }
    return { ok: true, launched: args.app };
  }
  if (name === "open_workspace_folder") {
    const target = withinWorkspace(args.path || ".");
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target };
  }
  if (name === "run_safe_command") {
    const allowed = ["whoami","hostname","ipconfig","tasklist","systeminfo","ver","date","time"];
    if (!allowed.includes(args.command)) throw new Error("Command is not permitted.");
    const result = await execFileAsync("cmd.exe", ["/d", "/s", "/c", args.command], { windowsHide: true, timeout: 15000, maxBuffer: 50000 });
    return { stdout: result.stdout.slice(0, 12000), stderr: result.stderr.slice(0, 3000) };
  }
  throw new Error("Unknown tool: " + name);
}
ipcMain.handle("screen:capture", async () => captureScreen(false));
ipcMain.handle("agent:run", async (_event, { task, key, model, endpoint }) => {
  if (running) throw new Error("An agent task is already running.");
  if (!task || !String(task).trim()) throw new Error("Enter a task first.");
  if (!key) throw new Error("Add an API key or use AI Chat Local Assist.");
  running = true; stopRequested = false;
  const chosenModel = model || "openai/gpt-4o";
  const baseUrl=String(endpoint||"https://openrouter.ai/api/v1").trim().replace(/\/+$/,"");
  const apiUrl=baseUrl.endsWith("/chat/completions")?baseUrl:baseUrl+"/chat/completions";
  const authorization=/^Bearer\s/i.test(String(key).trim())?String(key).trim():"Bearer "+String(key).trim();
  const messages = [
    { role: "system", content: "You are ONE BRAIN, a careful desktop AI operator. You have desktop screenshots, accurately mapped mouse clicks, keyboard typing/keys, approved built-in app launching, running-app listing, workspace file listing/reading/folder opening, website opening, and read-only diagnostics. When the user's instruction is clear, execute it directly without asking a follow-up question or requesting approval for routine desktop actions. You may click, type, press permitted keys, open approved apps and URLs, and inspect the selected workspace whenever needed to complete the requested task. For multi-step tasks, plan briefly, carry out the steps in order, and verify results. Inspect a fresh screenshot before each click, use screenshot pixel coordinates, and verify important actions with another screenshot. Ask a question only if a genuinely essential detail is missing and guessing would cause a meaningful mistake. Never ask for or handle passwords, payment details, private keys, or sensitive personal data. Never delete files, install software, change security settings, or run arbitrary shell commands. Destructive or security-sensitive actions are unavailable. The selected workspace is the only file area you may inspect. Stop when asked." },
    { role: "user", content: String(task).slice(0, 6000) }
  ];
  try {
    emit("status", "Agent planning task…", { model: chosenModel });
    for (let step = 0; step < 20; step++) {
      if (stopRequested) { emit("status", "Agent stopped."); break; }
      const response = await fetch(apiUrl, {
        method: "POST", headers: { "Authorization": authorization, "Content-Type": "application/json", "HTTP-Referer": "https://one-brain-updater.tuckerlowson.workers.dev", "X-Title": "ONE BRAIN" },
        body: JSON.stringify({ model: chosenModel, messages, tools: toolSpecs, tool_choice: "auto", temperature: 0.2 })
      });
      if (!response.ok) throw new Error("API provider returned " + response.status + ": " + (await response.text()).slice(0, 600));
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
      if (step === 19) emit("final", "Stopped after the 20-step execution limit. Review the activity log and continue with a more specific task if needed.");
    }
  } catch (error) {
    emit("error", error.message || String(error));
    throw error;
  } finally { running = false; }
  return { ok: true };
});