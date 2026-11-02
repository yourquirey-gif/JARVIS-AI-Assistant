"use strict";

const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const WEBSITES = {
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  github: "https://github.com",
  instagram: "https://www.instagram.com",
  facebook: "https://www.facebook.com",
  gmail: "https://mail.google.com",
  wikipedia: "https://www.wikipedia.org",
  whatsapp: "https://web.whatsapp.com"
};

const WINDOWS_APPS = {
  notepad: "notepad.exe",
  calculator: "calc.exe",
  paint: "mspaint.exe",
  "command prompt": "cmd.exe",
  "file explorer": "explorer.exe",
  "task manager": "taskmgr.exe",
  "control panel": "control.exe",
  wordpad: "write.exe"
};

const FOLDER_PATHS = {
  desktop: "desktop",
  documents: "documents",
  downloads: "downloads",
  pictures: "pictures",
  music: "music",
  videos: "videos"
};

function createPcService(options) {
  const app = options.app;
  const shell = options.shell;
  const token = String(options.token || "");
  const trustedOrigin = String(options.trustedOrigin || "").replace(/\/$/, "");
  const automationEnabled = Boolean(options.automationEnabled);
  const port = Number(options.port || process.env.ULTRON_PORT || 8765);
  let server = null;
  let previousCpu = null;

  function json(response, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  }

  function error(status, message) {
    const result = new Error(message);
    result.status = status;
    return result;
  }

  function applyCors(request, response) {
    const origin = String(request.headers.origin || "").replace(/\/$/, "");
    if (origin && origin === trustedOrigin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    return origin;
  }

  function checkOrigin(origin) {
    if (origin && origin !== trustedOrigin) {
      throw error(403, "This website origin is not approved by ULTRON PC Companion.");
    }
  }

  function authorize(request, suppliedToken) {
    const origin = String(request.headers.origin || "").replace(/\/$/, "");
    checkOrigin(origin);
    if (!token) throw error(503, "ULTRON PC Companion has not created a pairing key.");
    const supplied = String(suppliedToken || "");
    const expectedBuffer = Buffer.from(token);
    const suppliedBuffer = Buffer.from(supplied);
    if (expectedBuffer.length !== suppliedBuffer.length ||
        !require("crypto").timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      throw error(401, "Pairing key is incorrect. Reconnect the ULTRON PC Companion.");
    }
  }

  function readJson(request) {
    return new Promise((resolve, reject) => {
      let body = "";
      let tooLarge = false;
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 16384) tooLarge = true;
      });
      request.on("end", () => {
        if (tooLarge) return reject(error(413, "Request body is too large."));
        if (!body) return resolve({});
        try {
          const parsed = JSON.parse(body);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return reject(error(400, "A JSON object is required."));
          }
          resolve(parsed);
        } catch (_) {
          reject(error(400, "Request body contains invalid JSON."));
        }
      });
      request.on("error", () => reject(error(400, "Could not read the request body.")));
    });
  }

  function detectAction(input) {
    const value = String(input || "").toLowerCase().trim().replace(/\s+/g, " ");
    const sites = {
      youtube: ["youtube", "यूट्यूब"],
      google: ["google", "गूगल"],
      github: ["github", "गिटहब"],
      instagram: ["instagram", "इंस्टाग्राम"],
      facebook: ["facebook", "फेसबुक"],
      gmail: ["gmail", "जीमेल"],
      wikipedia: ["wikipedia", "विकिपीडिया"],
      whatsapp: ["whatsapp", "व्हाट्सएप"]
    };
    const apps = {
      notepad: ["notepad", "नोटपैड"],
      calculator: ["calculator", "calc", "कैलकुलेटर"],
      paint: ["paint", "पेंट"],
      "command prompt": ["command prompt", "cmd"],
      "file explorer": ["file explorer", "explorer", "files", "फाइल एक्सप्लोरर"],
      "task manager": ["task manager", "टास्क मैनेजर"],
      "control panel": ["control panel", "कंट्रोल पैनल"],
      wordpad: ["wordpad", "वर्डपैड"]
    };
    const openWords = ["open", "launch", "start", "visit", "खोलो", "खोल", "चालू करो", "चलाओ"];
    if (openWords.some((word) => value.includes(word))) {
      for (const name of Object.keys(sites)) {
        if (sites[name].some((alias) => value.includes(alias))) {
          return { name: "open_website", args: { name }, description: "Open " + name + " in your browser" };
        }
      }
      for (const name of Object.keys(apps)) {
        if (apps[name].some((alias) => value.includes(alias))) {
          return { name: "launch_app", args: { name }, description: "Launch " + name };
        }
      }
      const hindiFolders = { desktop: "डेस्कटॉप", documents: "दस्तावेज", downloads: "डाउनलोड" };
      for (const name of Object.keys(FOLDER_PATHS)) {
        if (value.includes(name) ||
            (name === "downloads" && value.includes("download")) ||
            (hindiFolders[name] && value.includes(hindiFolders[name]))) {
          return { name: "open_folder", args: { name }, description: "Open your " + name + " folder" };
        }
      }
    }
    if ([
      "battery", "बैटरी", "system info", "pc status", "computer status",
      "system status", "system information", "cpu usage", "ram usage",
      "पीसी की जानकारी", "कंप्यूटर की जानकारी"
    ].some((word) => value.includes(word))) {
      return { name: "get_system_info", args: {}, description: "Read basic PC and battery status" };
    }
    if ([
      "desktop folders", "डेस्कटॉप के फोल्डर", "show folders", "फोल्डर दिखाओ"
    ].some((word) => value.includes(word))) {
      return { name: "list_desktop_folders", args: {}, description: "List folder names on your Desktop" };
    }
    return null;
  }

  function cpuUsage() {
    const cpus = os.cpus() || [];
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      const times = cpu.times || {};
      idle += Number(times.idle || 0);
      total += Object.keys(times).reduce((sum, key) => sum + Number(times[key] || 0), 0);
    }
    const current = { idle, total };
    if (!previousCpu) {
      previousCpu = current;
      return 0;
    }
    const idleDelta = Math.max(0, current.idle - previousCpu.idle);
    const totalDelta = Math.max(0, current.total - previousCpu.total);
    previousCpu = current;
    if (!totalDelta) return 0;
    return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
  }

  function runWmic(args) {
    try {
      return execFileSync("wmic.exe", args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch (_) {
      return "";
    }
  }

  function getSystemInfo() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    let diskPercent = 0;
    let networkSentMb = 0;
    let networkRecvMb = 0;
    let battery = null;

    if (process.platform === "win32") {
      const drive = String(process.env.SystemDrive || "C:").replace(/'/g, "");
      const diskText = runWmic([
        "logicaldisk", "where", "DeviceID='" + drive + "'",
        "get", "FreeSpace,Size", "/value"
      ]);
      const freeMatch = diskText.match(/FreeSpace\s*=\s*(\d+)/i);
      const sizeMatch = diskText.match(/Size\s*=\s*(\d+)/i);
      if (freeMatch && sizeMatch && Number(sizeMatch[1]) > 0) {
        diskPercent = Math.round((1 - Number(freeMatch[1]) / Number(sizeMatch[1])) * 1000) / 10;
      }

      const networkText = runWmic(["nic", "get", "BytesReceivedPerSec,BytesSentPerSec"]);
      const netstatText = (() => {
        try {
          return execFileSync("netstat.exe", ["-e"], {
            encoding: "utf8", windowsHide: true, timeout: 2500,
            stdio: ["ignore", "pipe", "ignore"]
          });
        } catch (_) {
          return networkText;
        }
      })();
      const bytesMatch = netstatText.match(/Bytes\s+([\d,]+)\s+([\d,]+)/i);
      if (bytesMatch) {
        networkRecvMb = Math.round(Number(bytesMatch[1].replace(/,/g, "")) / 1048576 * 10) / 10;
        networkSentMb = Math.round(Number(bytesMatch[2].replace(/,/g, "")) / 1048576 * 10) / 10;
      }

      const batteryText = runWmic([
        "path", "Win32_Battery", "get", "EstimatedChargeRemaining", "/value"
      ]);
      const batteryMatch = batteryText.match(/EstimatedChargeRemaining\s*=\s*(\d+)/i);
      if (batteryMatch) {
        battery = { percent: Number(batteryMatch[1]), plugged_in: false };
      }
    }

    return {
      platform: process.platform === "win32" ? "Windows " + os.release() : os.type() + " " + os.release(),
      cpu_percent: cpuUsage(),
      memory_percent: totalMemory ? Math.round((1 - freeMemory / totalMemory) * 1000) / 10 : 0,
      memory_total_gb: Math.round(totalMemory / 1073741824 * 10) / 10,
      disk_percent: diskPercent,
      network_sent_mb: networkSentMb,
      network_recv_mb: networkRecvMb,
      battery
    };
  }

  async function openWebsite(name) {
    const key = String(name || "").trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(WEBSITES, key)) {
      throw error(400, "Website is not in the approved list.");
    }
    await shell.openExternal(WEBSITES[key]);
    return "Opened " + key.charAt(0).toUpperCase() + key.slice(1) + " in your default browser.";
  }

  async function openUrl(value) {
    const raw = String(value || "").trim();
    let parsed;
    try { parsed = new URL(raw); } catch (_) { throw error(400, "Only valid HTTP or HTTPS website addresses can be opened."); }
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname ||
        parsed.username || parsed.password || raw.length > 2048) {
      throw error(400, "Only valid HTTP or HTTPS website addresses can be opened.");
    }
    await shell.openExternal(parsed.toString());
    return "Opened the requested website.";
  }

  function launchApp(name) {
    const key = String(name || "").trim().toLowerCase();
    if (process.platform !== "win32" || !Object.prototype.hasOwnProperty.call(WINDOWS_APPS, key)) {
      throw error(400, "Application is not in the approved app list or is unsupported.");
    }
    return new Promise((resolve, reject) => {
      const child = spawn(WINDOWS_APPS[key], [], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        shell: false
      });
      child.once("error", (err) => reject(error(400, err.message || "Could not launch the selected application.")));
      child.once("spawn", () => {
        child.unref();
        resolve("Launched " + key.charAt(0).toUpperCase() + key.slice(1) + ".");
      });
    });
  }

  async function openFolder(name) {
    const key = String(name || "").trim().toLowerCase();
    const known = FOLDER_PATHS[key];
    if (!known || process.platform !== "win32") {
      throw error(400, "Only standard Windows user folders are supported.");
    }
    const target = app.getPath(known);
    await fs.promises.mkdir(target, { recursive: true });
    const openError = await shell.openPath(target);
    if (openError) throw error(400, openError);
    return "Opened your " + key + " folder.";
  }

  function listDesktopFolders() {
    const desktop = app.getPath("desktop");
    let folders = [];
    try {
      folders = fs.readdirSync(desktop, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    } catch (_) {}
    return { path: desktop, folders, count: folders.length };
  }

  async function executeAction(action, args) {
    if (!automationEnabled) {
      throw error(403, "PC actions are disabled. Allow PC connection in ULTRON Permissions and restart the companion.");
    }
    switch (action) {
      case "open_website":
        return { reply: await openWebsite(args.name) };
      case "open_url":
        return { reply: await openUrl(args.url) };
      case "launch_app":
        return { reply: await launchApp(args.name) };
      case "open_folder":
        return { reply: await openFolder(args.name) };
      case "list_desktop_folders": {
        const result = listDesktopFolders();
        return { reply: "Desktop has " + result.count + " folders: " + (result.folders.join(", ") || "none") };
      }
      case "get_system_info": {
        const result = getSystemInfo();
        const battery = result.battery;
        const reply = result.platform + ". CPU " + result.cpu_percent +
          "%, RAM " + result.memory_percent + "% of " + result.memory_total_gb +
          " GB, disk " + result.disk_percent + "%, network sent " +
          result.network_sent_mb + " MB / received " + result.network_recv_mb +
          " MB, battery " + (battery ? battery.percent + "%" : "not available") + ".";
        return { reply, system: result };
      }
      default:
        throw error(400, "This action is not in ULTRON's approved local action list.");
    }
  }

  async function handle(request, response) {
    const origin = applyCors(request, response);
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "OPTIONS") {
      if (origin && origin !== trustedOrigin) {
        return json(response, 403, { detail: "This website origin is not approved by ULTRON PC Companion." });
      }
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Ultron-Token, X-Jarvis-Token, Access-Control-Request-Private-Network");
      response.setHeader("Access-Control-Max-Age", "600");
      if (String(request.headers["access-control-request-private-network"] || "").toLowerCase() === "true") {
        response.setHeader("Access-Control-Allow-Private-Network", "true");
      }
      response.writeHead(204);
      return response.end();
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json(response, 200, {
          ok: true,
          service: "ULTRON Local PC Companion",
          automation_enabled: automationEnabled,
          paired: Boolean(token),
          version: "1.0.8",
          engine: "electron-node"
        });
      }

      if (request.method === "GET" && url.pathname === "/api/auto-pair") {
        checkOrigin(origin);
        if (!origin || origin !== trustedOrigin) {
          throw error(403, "This ULTRON website is not in the PC companion's trusted website list.");
        }
        if (!token) throw error(503, "ULTRON PC Companion has not created a pairing key.");
        return json(response, 200, {
          paired: true,
          token,
          automation_enabled: automationEnabled,
          message: "Trusted ULTRON website paired automatically."
        });
      }

      if (request.method === "POST" && url.pathname === "/api/pair") {
        const data = await readJson(request);
        checkOrigin(origin);
        if (!token) throw error(503, "ULTRON PC Companion has not created a pairing key.");
        if (typeof data.token !== "string" || data.token.length < 12 || data.token.length > 200) {
          throw error(422, "A valid pairing key is required.");
        }
        authorize(request, data.token);
        return json(response, 200, {
          paired: true,
          automation_enabled: automationEnabled,
          message: "ULTRON local companion paired."
        });
      }

      if (request.method === "POST" && url.pathname === "/api/command") {
        const data = await readJson(request);
        authorize(request, request.headers["x-ultron-token"] || request.headers["x-jarvis-token"]);
        if (typeof data.message !== "string" || !data.message.trim() || data.message.length > 2000) {
          throw error(422, "Command message must contain 1 to 2000 characters.");
        }
        const action = detectAction(data.message);
        return json(response, 200, { proposed_action: action, needs_ai: !action });
      }

      if (request.method === "POST" && url.pathname === "/api/action/execute") {
        const data = await readJson(request);
        authorize(request, request.headers["x-ultron-token"] || request.headers["x-jarvis-token"]);
        if (typeof data.action !== "string" || !data.action.trim() || data.action.length > 60) {
          throw error(422, "A valid approved action is required.");
        }
        const args = data.args && typeof data.args === "object" && !Array.isArray(data.args) ? data.args : {};
        const result = await executeAction(data.action, args);
        return json(response, 200, { ok: true, reply: result.reply, ...(result.system ? { system: result.system } : {}) });
      }

      return json(response, 404, { detail: "ULTRON local companion endpoint not found." });
    } catch (err) {
      return json(response, Number(err.status) || 500, {
        detail: err.message || "ULTRON local PC companion request failed."
      });
    }
  }

  return {
    start() {
      if (server && server.listening) return Promise.resolve();
      server = http.createServer((request, response) => {
        handle(request, response).catch((err) => {
          if (!response.headersSent) json(response, 500, { detail: err.message || "Unexpected local service error." });
          else response.destroy();
        });
      });
      server.on("clientError", (_err, socket) => {
        if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      });
      return new Promise((resolve, reject) => {
        const onError = (err) => {
          server.removeListener("listening", onListening);
          reject(err);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
    },
    close() {
      if (!server || !server.listening) {
        server = null;
        return Promise.resolve();
      }
      const current = server;
      server = null;
      return new Promise((resolve) => current.close(() => resolve()));
    },
    get listening() {
      return Boolean(server && server.listening);
    }
  };
}

module.exports = { createPcService };
