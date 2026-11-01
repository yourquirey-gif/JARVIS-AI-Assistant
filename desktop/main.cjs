const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const http = require("http");

const DEFAULT_SITE = "https://jarvis-ai-assistant-zeta-six.vercel.app";
const SITE_URL = process.env.ULTRON_SITE_URL || DEFAULT_SITE;
const PORT = 8765;

let mainWindow = null;
let pcService = null;
let pcAllowed = false;
let micAllowed = false;
let quitting = false;
let accessPromptShown = false;
let micPromptShown = false;

function safeSiteUrl() {
  const parsed = new URL(SITE_URL);
  if (parsed.protocol !== "https:") {
    throw new Error("ULTRON desktop app must load the trusted HTTPS website.");
  }
  return parsed;
}

function serviceExecutable() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, "..", "build", "ULTRON-PC-Service.exe");
  }
  return path.join(process.resourcesPath, "ULTRON-PC-Service.exe");
}

function checkLocalService() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:" + PORT + "/api/health", (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForService(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await checkLocalService()) return true;
    if (!pcService || pcService.killed) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function stopPcService() {
  pcAllowed = false;
  if (pcService && !pcService.killed) {
    try { pcService.kill(); } catch (_) {}
  }
  pcService = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ultron:pc-status", { allowed: false });
  }
}

async function startPcService() {
  if (pcService && !pcService.killed && await checkLocalService()) {
    pcAllowed = true;
    return true;
  }

  const executable = serviceExecutable();
  const fs = require("fs");
  if (!fs.existsSync(executable)) {
    dialog.showErrorBox(
      "ULTRON PC service missing",
      "The local PC service is missing. Reinstall ULTRON using the official desktop installer."
    );
    return false;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const trustedOrigin = safeSiteUrl().origin;
  const child = spawn(executable, [], {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ULTRON_TOKEN: token,
      ALLOWED_ORIGINS: trustedOrigin,
      ENABLE_AUTOMATION: "true",
      ULTRON_PORT: String(PORT)
    }
  });
  pcService = child;

  child.on("error", (error) => {
    pcAllowed = false;
    pcService = null;
    if (!quitting) {
      dialog.showErrorBox("ULTRON PC connection failed", error.message || "Could not start the local service.");
    }
  });
  child.on("exit", () => {
    pcAllowed = false;
    pcService = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ultron:pc-status", { allowed: false });
    }
  });

  const ready = await waitForService(10000);
  if (!ready) {
    try { child.kill(); } catch (_) {}
    pcService = null;
    pcAllowed = false;
    dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "ULTRON could not connect",
      message: "ULTRON could not start its private PC service.",
      detail: "Restart ULTRON. Check whether another local companion is already using port 8765.",
      buttons: ["OK"]
    });
    return false;
  }

  pcAllowed = true;
  mainWindow?.webContents.send("ultron:pc-status", { allowed: true });
  return true;
}

async function askPcAccess(force) {
  if (pcAllowed && await checkLocalService()) return true;
  if (accessPromptShown && !force) return false;
  accessPromptShown = true;

  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    title: "Allow ULTRON to connect to this PC?",
    message: "ULTRON wants permission to control approved actions on this Windows computer.",
    detail: "When allowed, ULTRON can open selected apps and websites and read basic system information. Each PC action still requires an in-app confirmation. Denying this request leaves PC access switched off. You can change this later in Permissions.",
    buttons: ["Allow PC connection", "Deny"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (result.response !== 0) {
    pcAllowed = false;
    mainWindow?.webContents.send("ultron:pc-status", { allowed: false });
    return false;
  }
  return startPcService();
}

async function askMicrophoneAccess(force) {
  if (micAllowed && !force) return true;
  if (micPromptShown && !force) return false;
  micPromptShown = true;
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    title: "Allow ULTRON microphone access?",
    message: "ULTRON wants to use your microphone for voice commands.",
    detail: "The microphone is used only after you start voice listening. Typing and AI chat work without microphone access.",
    buttons: ["Allow microphone", "Deny"],
    defaultId: 0,
    cancelId: 1
  });
  micAllowed = result.response === 0;
  return micAllowed;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 900,
    minHeight: 580,
    backgroundColor: "#030914",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== safeSiteUrl().origin) event.preventDefault();
    } catch (_) {
      event.preventDefault();
    }
  });

  win.on("closed", () => {
    mainWindow = null;
    app.quit();
  });

  win.loadURL(safeSiteUrl().toString()).then(async () => {
    await askPcAccess(false);
    await askMicrophoneAccess(false);
  }).catch((error) => {
    dialog.showErrorBox("Cannot open ULTRON", error.message || "Check your internet connection.");
    app.quit();
  });

  return win;
}

app.setAppUserModelId("com.dsacademy.ultron");

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "media") return micAllowed;
    return false;
  });
  ses.setPermissionRequestHandler(async (_webContents, permission, callback, details) => {
    if (permission === "media" && (!details.mediaTypes || details.mediaTypes.includes("audio"))) {
      callback(await askMicrophoneAccess(false));
      return;
    }
    callback(false);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("ultron:pc-status", async () => ({
  allowed: pcAllowed && await checkLocalService()
}));
ipcMain.handle("ultron:request-pc-access", async () => ({
  allowed: await askPcAccess(true)
}));
ipcMain.handle("ultron:revoke-pc-access", async () => {
  stopPcService();
  return { allowed: false };
});
ipcMain.handle("ultron:mic-status", async () => ({ allowed: micAllowed }));
ipcMain.handle("ultron:request-microphone", async () => ({
  allowed: await askMicrophoneAccess(true)
}));
ipcMain.handle("ultron:version", async () => app.getVersion());
ipcMain.handle("ultron:revoke-all", async () => {
  stopPcService();
  micAllowed = false;
  micPromptShown = false;
  return { allowed: false, microphoneAllowed: false };
});

app.on("before-quit", () => {
  quitting = true;
  stopPcService();
  micAllowed = false;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
