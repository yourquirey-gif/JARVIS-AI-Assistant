const { app, BrowserWindow, dialog, globalShortcut, ipcMain, session, shell } = require("electron");
const path = require("path");
const crypto = require("crypto");
const { createPcService } = require("./pc-service.cjs");

const DEFAULT_SITE = "https://jarvis-ai-assistant-zeta-six.vercel.app";
const SITE_URL = process.env.ULTRON_SITE_URL || DEFAULT_SITE;
const PORT = 8765;
const PORT_RANGE_SIZE = 30;

let mainWindow = null;
let pcService = null;
let pcServiceStartPromise = null;
let pcServiceError = "";
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



function stopPcService() {
  pcAllowed = false;
  const service = pcService;
  pcService = null;
  if (service) {
    service.close().catch(() => {});
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ultron:pc-status", { allowed: false, port: null });
  }
}

function serviceStartupHelp() {
  const details = [
    "ULTRON tries localhost ports 8765 through " + (PORT + PORT_RANGE_SIZE - 1) + ".",
    "If an older ULTRON companion or another app is still using port 8765, ULTRON will safely use the next free port. It will not terminate unrelated processes."
  ];
  if (pcServiceError) details.push("Service startup details: " + pcServiceError);
  return details.join("\n\n");
}

async function startPcService() {
  if (pcServiceStartPromise) return pcServiceStartPromise;
  pcServiceStartPromise = startPcServiceInternal();
  try { return await pcServiceStartPromise; }
  finally { pcServiceStartPromise = null; }
}

async function startPcServiceInternal() {
  if (pcService && pcService.listening) {
    pcAllowed = true;
    return true;
  }

  pcServiceError = "";
  const token = crypto.randomBytes(32).toString("hex");
  let trustedOrigin;
  try {
    trustedOrigin = safeSiteUrl().origin;
  } catch (error) {
    pcServiceError = error.message;
    dialog.showErrorBox("ULTRON PC connection failed", error.message);
    return false;
  }

  let lastPortError = null;
  for (let port = PORT; port < PORT + PORT_RANGE_SIZE; port += 1) {
    const service = createPcService({
      app,
      shell,
      token,
      trustedOrigin,
      automationEnabled: true,
      port
    });
    try {
      await service.start();
      pcService = service;
      pcAllowed = true;
      mainWindow?.webContents.send("ultron:pc-status", { allowed: true, port: service.port });
      return true;
    } catch (error) {
      lastPortError = error;
      await service.close().catch(() => {});
      if (error && error.code === "EADDRINUSE") continue;
      pcServiceError = error && error.message ? error.message : String(error);
      break;
    }
  }

  if (!pcServiceError) {
    pcServiceError = "All localhost ports " + PORT + "–" + (PORT + PORT_RANGE_SIZE - 1) + " are already in use.";
    if (lastPortError && lastPortError.message) pcServiceError += " Last error: " + lastPortError.message;
  }
  pcAllowed = false;
  await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "ULTRON PC service could not start",
    message: "ULTRON could not find a free local PC-service port.",
    detail: serviceStartupHelp(),
    buttons: ["OK"]
  });
  return false;
}

async function askPcAccess(force) {
  if (pcAllowed && pcService && pcService.listening) return true;
  if (accessPromptShown && !force) return false;
  accessPromptShown = true;

  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    title: "Allow ULTRON to connect to this PC?",
    message: "ULTRON wants permission to control approved actions on this Windows computer.",
    detail: "When allowed, ULTRON can open installed apps, close supported apps, type dictated text into the currently focused app or website, and read basic system information. Apps with unsaved work will not be force-closed. Dictation sends short microphone clips to ULTRON Whisper for transcription. Denying this request leaves PC access switched off. You can change this later in Permissions.",
    buttons: ["Allow PC connection", "Deny"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (result.response !== 0) {
    pcAllowed = false;
    mainWindow?.webContents.send("ultron:pc-status", { allowed: false, port: null });
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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

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

    const shortcutReady = globalShortcut.register("Control+Alt+D", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ultron:dictation-toggle");
      }
    });
    if (!shortcutReady) console.warn("ULTRON could not register Ctrl+Alt+D; use the Dictate Anywhere button.");
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

ipcMain.handle("ultron:pc-status", async () => ({
  allowed: Boolean(pcAllowed && pcService && pcService.listening),
  port: pcAllowed && pcService && pcService.listening ? pcService.port : null
}));
ipcMain.handle("ultron:request-pc-access", async () => {
  const allowed = await askPcAccess(true);
  return { allowed, port: allowed && pcService ? pcService.port : null };
});
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
  globalShortcut.unregisterAll();
  stopPcService();
  micAllowed = false;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
