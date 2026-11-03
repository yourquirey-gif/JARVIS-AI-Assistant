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
    const rawValue = String(input || "").trim();
    const value = rawValue.toLowerCase().replace(/\s+/g, " ");
    const typeMatch = rawValue.match(/^(?:(?:please\s+)?(?:type|write|enter)(?:\s+(?:it|this))?|type\s+(?:karo|kar\s+do)|लिखो|लिख\s+दो|लिखिए|टाइप\s+करो)\s+([\s\S]{1,1000})$/i);
    if (typeMatch) {
      return { name: "type_text", args: { text: typeMatch[1] }, description: "Type the requested text into the active app" };
    }
    const directUrlMatch = rawValue.match(/^(?:please\s+)?(?:open|visit|go to)\s+(https?:\/\/[^\s]+|www\.[^\s]+)\s*$/i);
    if (directUrlMatch) {
      const url = directUrlMatch[1].startsWith("www.") ? "https://" + directUrlMatch[1] : directUrlMatch[1];
      return { name: "open_url", args: { url }, description: "Open the requested website address" };
    }
    const deleteMatch = rawValue.match(/^(?:please\s+)?(?:delete|remove|trash|erase)\s+(?:the\s+)?(?:file\s+)?(.+?)\s+(?:from|in)\s+(desktop|documents|downloads|pictures|music|videos)\s*$/i);
    if (deleteMatch) {
      const name = deleteMatch[1].trim().replace(/^["']|["']$/g, "");
      const folder = deleteMatch[2].toLowerCase();
      if (name && !/[\\/]/.test(name)) {
        return { name: "delete_item", args: { folder, name }, description: "Move " + name + " from " + folder + " to the Recycle Bin after confirmation" };
      }
    }
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
    const closeMatch = value.match(/^(?:please\s+)?(?:close|quit|exit|terminate)\s+(.+?)\s*$/i)
      || value.match(/^(.+?)\s+(?:बंद करो|बंद कर दो|band karo)$/i);
    if (closeMatch) {
      const target = (closeMatch[1] || closeMatch[2] || "").replace(/\s+(?:app|application)$/i, "").trim();
      if (target && !/^(?:this|all)\s+(?:window|windows|tab|tabs)$/i.test(target)) {
        return { name: "close_app", args: { name: target }, description: "Close " + target };
      }
    }
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
      const genericOpen = value.match(/^(?:please\s+)?(?:open|launch|start|run|खोलो|खोल|चालू करो|चलाओ)\s+(.+?)\s*$/i);
      if (genericOpen) {
        const target = genericOpen[1].replace(/^the\s+/i, "").replace(/\s+(?:app|application)$/i, "").replace(/^["']|["']$/g, "").trim();
        if (target.length > 0 && target.length <= 80 && /^[\p{L}\p{N} .&()+_-]+$/u.test(target)) {
          return { name: "launch_app", args: { name: target }, description: "Launch installed app " + target };
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

  function runPowerShell(script, timeout = 12000) {
    if (process.platform !== "win32") throw error(400, "This Windows app action is only available on Windows.");
    const encoded = Buffer.from(String(script || ""), "utf16le").toString("base64");
    try {
      return execFileSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout,
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"]
      }).trim();
    } catch (err) {
      const output = String(err && (err.stderr || err.stdout || err.message) || "").trim();
      const message = output.split(/\r?\n/).filter(Boolean).slice(-1)[0] || "Windows could not complete the requested app action.";
      const status = err && err.code === "ETIMEDOUT" ? 504 : 500;
      throw error(status, message.slice(0, 240));
    }
  }

  function psQuote(value) {
    return "'" + String(value || "").replace(/'/g, "''") + "'";
  }

  function amplifySpeechWave(wav) {
    if (!Buffer.isBuffer(wav) || wav.length < 44 ||
        wav.toString("ascii", 0, 4) !== "RIFF" ||
        wav.toString("ascii", 8, 12) !== "WAVE") {
      throw error(500, "Windows speech engine returned an invalid WAV audio file.");
    }
    let offset = 12;
    let format = 0;
    let bitsPerSample = 0;
    let dataOffset = -1;
    let dataLength = 0;
    while (offset + 8 <= wav.length) {
      const chunkName = wav.toString("ascii", offset, offset + 4);
      const chunkLength = wav.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      if (chunkStart + chunkLength > wav.length) break;
      if (chunkName === "fmt " && chunkLength >= 16) {
        format = wav.readUInt16LE(chunkStart);
        bitsPerSample = wav.readUInt16LE(chunkStart + 14);
      } else if (chunkName === "data") {
        dataOffset = chunkStart;
        dataLength = chunkLength;
        break;
      }
      offset = chunkStart + chunkLength + (chunkLength & 1);
    }
    if (format !== 1 || bitsPerSample !== 16 || dataOffset < 0) {
      throw error(500, "Windows speech audio format is not supported for voice amplification.");
    }
    let peak = 0;
    const end = dataOffset + dataLength;
    for (let index = dataOffset; index + 1 < end; index += 2) {
      const sample = Math.abs(wav.readInt16LE(index) / 32768);
      if (sample > peak) peak = sample;
    }
    if (peak < 0.00001) throw error(500, "Windows speech engine produced silent audio.");
    const targetPeak = 0.96;
    const gain = targetPeak / peak;
    const limiter = Math.tanh(targetPeak);
    for (let index = dataOffset; index + 1 < end; index += 2) {
      const sample = wav.readInt16LE(index) / 32768;
      const normalized = Math.tanh(sample * gain) / limiter * targetPeak;
      const clipped = Math.max(-0.98, Math.min(0.98, normalized));
      wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clipped * 32767))), index);
    }
    return wav;
  }

  function synthesizeWindowsSpeech(text, language) {
    if (process.platform !== "win32") {
      throw error(501, "Amplified native voice output is available in the ULTRON Windows app.");
    }
    const outputFile = path.join(os.tmpdir(), "ultron-speech-" + require("crypto").randomBytes(8).toString("hex") + ".wav");
    const encodedText = Buffer.from(text, "utf8").toString("base64");
    const encodedLanguage = Buffer.from(language || "en-IN", "utf8").toString("base64");
    const encodedPath = Buffer.from(outputFile, "utf8").toString("base64");
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type -AssemblyName System.Speech",
      "$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encodedText + "'))",
      "$language = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encodedLanguage + "'))",
      "$outputPath = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encodedPath + "'))",
      "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "try {",
      "  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })",
      "  $selected = @($voices | Where-Object { $_.VoiceInfo.Culture.Name -ieq $language })",
      "  if ($selected.Count -eq 0 -and $language.Length -ge 2) {",
      "    $prefix = $language.Substring(0, 2)",
      "    $selected = @($voices | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -ieq $prefix })",
      "  }",
      "  if ($selected.Count -eq 0 -and $language.StartsWith('en')) { $selected = @($voices | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'en' }) }",
      "  if ($selected.Count -eq 0) { throw \"No installed Windows speech voice is available for $language. Install the matching Windows voice in Speech settings.\" }",
      "  $synth.SelectVoice($selected[0].VoiceInfo.Name)",
      "  $synth.Volume = 100",
      "  $synth.Rate = 0",
      "  $synth.SetOutputToWaveFile($outputPath)",
      "  $synth.Speak($text)",
      "  $synth.SetOutputToNull()",
      "} finally { $synth.Dispose() }",
      "if (!(Test-Path -LiteralPath $outputPath)) { throw 'The Windows speech engine did not create audio.' }",
      "[Console]::WriteLine('SPEECH_AUDIO_READY')"
    ].join("\n");
    try {
      runPowerShell(script, 45000);
      const wav = fs.readFileSync(outputFile);
      return amplifySpeechWave(wav);
    } finally {
      try { fs.unlinkSync(outputFile); } catch {}
    }
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
    let diskTotalGb = 0;
    let diskFreeGb = 0;
    let networkSentMb = 0;
    let networkRecvMb = 0;
    let battery = null;
    let processCount = 0;
    let topProcesses = [];

    if (process.platform === "win32") {
      const drive = String(process.env.SystemDrive || "C:").replace(/\x27/g, "");
      const diskText = runWmic(["logicaldisk", "where", "DeviceID=\x27" + drive + "\x27", "get", "FreeSpace,Size", "/value"]);
      const freeMatch = diskText.match(/FreeSpace\s*=\s*(\d+)/i);
      const sizeMatch = diskText.match(/Size\s*=\s*(\d+)/i);
      if (freeMatch && sizeMatch && Number(sizeMatch[1]) > 0) {
        const freeBytes = Number(freeMatch[1]);
        const sizeBytes = Number(sizeMatch[1]);
        diskFreeGb = Math.round(freeBytes / 1073741824 * 10) / 10;
        diskTotalGb = Math.round(sizeBytes / 1073741824 * 10) / 10;
        diskPercent = Math.round((1 - freeBytes / sizeBytes) * 1000) / 10;
      }

      try {
        const networkText = execFileSync("netstat.exe", ["-e"], { encoding: "utf8", windowsHide: true, timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
        const bytesMatch = networkText.match(/Bytes\s+([\d,]+)\s+([\d,]+)/i);
        if (bytesMatch) {
          networkRecvMb = Math.round(Number(bytesMatch[1].replace(/,/g, "")) / 1048576 * 10) / 10;
          networkSentMb = Math.round(Number(bytesMatch[2].replace(/,/g, "")) / 1048576 * 10) / 10;
        }
      } catch {}

      const batteryText = runWmic(["path", "Win32_Battery", "get", "EstimatedChargeRemaining", "/value"]);
      const batteryMatch = batteryText.match(/EstimatedChargeRemaining\s*=\s*(\d+)/i);
      if (batteryMatch) battery = { percent: Number(batteryMatch[1]), plugged_in: false };

      try {
        const taskText = execFileSync("tasklist.exe", ["/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
        const rows = taskText.split(/\r?\n/).filter(Boolean);
        const parsed = rows.map((row) => {
          const columns = row.match(/"(?:[^"]|"")*"|[^,]+/g) || [];
          const values = columns.map((value) => value.replace(/^"/, "").replace(/"$/, "").replace(/""/g, "\x22"));
          const memoryKb = Number(String(values[4] || "").replace(/[^\d]/g, "")) || 0;
          return { name: String(values[0] || "Unknown").slice(0, 40), pid: Number(values[1]) || 0, memory_mb: Math.round(memoryKb / 1024 * 10) / 10 };
        }).filter((item) => item.pid > 0);
        processCount = parsed.length;
        topProcesses = parsed.sort((x, y) => y.memory_mb - x.memory_mb).slice(0, 6);
      } catch {}
    }

    const usedMemory = Math.max(0, totalMemory - freeMemory);
    return {
      platform: process.platform === "win32" ? "Windows " + os.release() : os.type() + " " + os.release(),
      cpu_percent: cpuUsage(),
      memory_percent: totalMemory ? Math.round((usedMemory / totalMemory) * 1000) / 10 : 0,
      memory_total_gb: Math.round(totalMemory / 1073741824 * 10) / 10,
      memory_used_gb: Math.round(usedMemory / 1073741824 * 10) / 10,
      memory_free_gb: Math.round(freeMemory / 1073741824 * 10) / 10,
      disk_percent: diskPercent,
      disk_total_gb: diskTotalGb,
      disk_free_gb: diskFreeGb,
      disk_used_gb: Math.max(0, Math.round((diskTotalGb - diskFreeGb) * 10) / 10),
      network_sent_mb: networkSentMb,
      network_recv_mb: networkRecvMb,
      process_count: processCount,
      top_processes: topProcesses,
      uptime_seconds: Math.round(os.uptime()),
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
    if (process.platform !== "win32") throw error(400, "Installed-app launching is supported on Windows desktop.");
    if (Object.prototype.hasOwnProperty.call(WINDOWS_APPS, key)) {
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
    const target = String(name || "").trim();
    if (!target || target.length > 80 || !/^[\p{L}\p{N} .&()+_-]+$/u.test(target)) {
      throw error(400, "Please say the installed app's name, without a file path or command.");
    }
    const script = `
$ErrorActionPreference = 'Stop'
$name = ${psQuote(target)}
$match = $null
try {
  $apps = @(Get-StartApps -ErrorAction Stop)
  $match = $apps | Where-Object { $_.Name -ieq $name } | Select-Object -First 1
  if (-not $match) { $match = $apps | Where-Object { $_.Name -like ('*' + $name + '*') } | Select-Object -First 1 }
} catch {}
if ($match -and $match.AppID) {
  Start-Process -FilePath 'explorer.exe' -ArgumentList @('shell:AppsFolder\\' + $match.AppID)
  [Console]::WriteLine('LAUNCHED:' + $match.Name)
  exit 0
}
$roots = @(
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs')
) | Where-Object { Test-Path $_ }
$shortcuts = @()
if ($roots.Count -gt 0) {
  $shortcuts = @(Get-ChildItem -Path $roots -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue)
}
$shortcut = $shortcuts | Where-Object { $_.BaseName -ieq $name } | Select-Object -First 1
if (-not $shortcut) { $shortcut = $shortcuts | Where-Object { $_.BaseName -like ('*' + $name + '*') } | Select-Object -First 1 }
if ($shortcut) {
  Start-Process -FilePath $shortcut.FullName
  [Console]::WriteLine('LAUNCHED:' + $shortcut.BaseName)
  exit 0
}
$command = Get-Command -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
if ($command -and $command.Source) {
  Start-Process -FilePath $command.Source
  [Console]::WriteLine('LAUNCHED:' + $command.Name)
  exit 0
}
throw ('Could not find an installed app or Start Menu shortcut named "' + $name + '".')
`;
    const result = runPowerShell(script, 18000);
    const label = result.split(/\r?\n/).find((line) => line.startsWith("LAUNCHED:"));
    return label ? "Launched " + label.slice(9) + "." : "Launched " + target + ".";
  }

  function closeApp(name) {
    if (process.platform !== "win32") throw error(400, "App closing is supported on Windows desktop.");
    const original = String(name || "").trim();
    if (!original || original.length > 80) throw error(400, "Please provide the app name you want to close.");
    const aliases = {
      "google chrome": "chrome", chrome: "chrome",
      "microsoft edge": "msedge", edge: "msedge",
      "visual studio code": "code", "vs code": "code", code: "code",
      "microsoft word": "WINWORD", word: "WINWORD",
      "microsoft excel": "EXCEL", excel: "EXCEL",
      "microsoft powerpoint": "POWERPNT", powerpoint: "POWERPNT",
      firefox: "firefox", notepad: "notepad", paint: "mspaint",
      calculator: "CalculatorApp", calc: "CalculatorApp",
      "task manager": "Taskmgr", "command prompt": "cmd",
      powershell: "powershell", wordpad: "wordpad",
      spotify: "Spotify", discord: "Discord", zoom: "Zoom"
    };
    const normalized = original.toLowerCase();
    const processName = aliases[normalized] || original.replace(/\.exe$/i, "").replace(/[^A-Za-z0-9_.-]/g, "");
    if (!processName || processName.length > 64 || !/^[A-Za-z0-9_.-]+$/.test(processName)) {
      throw error(400, "I could not safely identify that app's process name.");
    }
    const script = `
$ErrorActionPreference = 'Stop'
$name = ${psQuote(processName)}
$blocked = @('System','Idle','Registry','smss','csrss','wininit','services','lsass','svchost','winlogon','dwm','explorer','node','electron')
if ($blocked -contains $name) { throw 'That is a protected Windows or ULTRON process and cannot be closed by voice command.' }
$items = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if ($items.Count -eq 0) { throw ('No visible app window named "' + $name + '" was found.') }
$closed = 0
foreach ($item in $items) {
  try { if ($item.CloseMainWindow()) { $closed++ } } catch {}
}
if ($closed -eq 0) { throw 'Windows could not request a normal close. The app may have unsaved work.' }
Start-Sleep -Milliseconds 1200
$remaining = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if ($remaining.Count -gt 0) { throw 'The app window is still open. It may have unsaved work or a confirmation dialog; ULTRON will not force-close it.' }
[Console]::WriteLine(('CLOSED:' + $closed))
`;
    const result = runPowerShell(script, 12000);
    const count = Number((result.match(/CLOSED:(\d+)/) || [])[1] || 0);
    return "Closed " + count + " running " + original + (count === 1 ? " process." : " processes.");
  }

  function typeText(value) {
    if (process.platform !== "win32") throw error(400, "Typing into other apps is supported on Windows desktop.");
    const text = String(value || "");
    if (!text.trim() || text.length > 1000) throw error(422, "Dictation text must contain 1 to 1000 characters.");
    const encodedText = Buffer.from(text, "utf8").toString("base64");
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$code = @'",
      "using System;",
      "using System.ComponentModel;",
      "using System.Runtime.InteropServices;",
      "using System.Collections.Generic;",
      "public static class UltronUnicodeInput {",
      "  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }",
      "  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }",
      "  [StructLayout(LayoutKind.Sequential)] public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }",
      "  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }",
      "  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION U; }",
      "  [DllImport(\"user32.dll\", SetLastError=true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);",
      "  static void AddKey(List<INPUT> events, ushort key, uint flags) {",
      "    INPUT down = new INPUT(); down.type = 1; down.U.ki = new KEYBDINPUT() { wVk = key, wScan = 0, dwFlags = flags, time = 0, dwExtraInfo = IntPtr.Zero }; events.Add(down);",
      "    INPUT up = new INPUT(); up.type = 1; up.U.ki = new KEYBDINPUT() { wVk = key, wScan = 0, dwFlags = flags | 0x0002, time = 0, dwExtraInfo = IntPtr.Zero }; events.Add(up);",
      "  }",
      "  static void AddUnicode(List<INPUT> events, ushort unit) {",
      "    INPUT down = new INPUT(); down.type = 1; down.U.ki = new KEYBDINPUT() { wVk = 0, wScan = unit, dwFlags = 0x0004, time = 0, dwExtraInfo = IntPtr.Zero }; events.Add(down);",
      "    INPUT up = new INPUT(); up.type = 1; up.U.ki = new KEYBDINPUT() { wVk = 0, wScan = unit, dwFlags = 0x0004 | 0x0002, time = 0, dwExtraInfo = IntPtr.Zero }; events.Add(up);",
      "  }",
      "  public static int Type(string text) {",
      "    var events = new List<INPUT>();",
      "    foreach (char ch in text) {",
      "      if (ch == '\\r') continue;",
      "      if (ch == '\\n') AddKey(events, 0x0D, 0);",
      "      else if (ch == '\\t') AddKey(events, 0x09, 0);",
      "      else AddUnicode(events, ch);",
      "    }",
      "    if (events.Count == 0) throw new ArgumentException(\"No text characters were available to type.\");",
      "    int sentTotal = 0;",
      "    for (int offset = 0; offset < events.Count; offset += 256) {",
      "      int count = Math.Min(256, events.Count - offset);",
      "      INPUT[] batch = events.GetRange(offset, count).ToArray();",
      "      uint sent = SendInput((uint)batch.Length, batch, Marshal.SizeOf(typeof(INPUT)));",
      "      sentTotal += (int)sent;",
      "      if (sent != batch.Length) {",
      "        int code = Marshal.GetLastWin32Error();",
      "        if (code == 5) throw new Win32Exception(code, \"Windows blocked typing into the focused app. Make sure the target app is not running as Administrator and is in the foreground.\");",
      "        throw new Win32Exception(code, \"Windows accepted only \" + sentTotal + \" of \" + events.Count + \" keyboard events. Click the target text field and try again.\");",
      "      }",
      "    }",
      "    return text.Length;",
      "  }",
      "}",
      "'@",
      "Add-Type -TypeDefinition $code -Language CSharp",
      "$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + encodedText + "'))",
      "$count = [UltronUnicodeInput]::Type($text)",
      "[Console]::WriteLine(('TYPED:' + $count))"
    ].join("\n");
    runPowerShell(script, 20000);
    return "Typed the requested text into the currently focused app or website.";
  }

  async function deleteUserFile(folder, name) {
    if (process.platform !== "win32") throw error(400, "File deletion is available in the Windows desktop app.");
    const key = String(folder || "").trim().toLowerCase();
    const directoryKey = FOLDER_PATHS[key];
    const filename = String(name || "").trim();
    if (!directoryKey) throw error(422, "Choose Desktop, Documents, Downloads, Pictures, Music, or Videos.");
    if (!filename || filename.length > 180 || filename === "." || filename === ".." ||
        path.basename(filename) !== filename || /[\\/<>:"|?*\u0000-\u001f]/.test(filename)) {
      throw error(422, "Provide one exact file name without a folder path.");
    }
    const root = path.resolve(app.getPath(directoryKey));
    const target = path.resolve(root, filename);
    if (path.dirname(target).toLowerCase() !== root.toLowerCase()) {
      throw error(403, "The requested item is outside the selected user folder.");
    }
    let stat;
    try { stat = await fs.promises.lstat(target); }
    catch (err) {
      if (err && err.code === "ENOENT") throw error(404, "I could not find " + filename + " in " + key + ".");
      throw err;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw error(403, "For safety, ULTRON can move one regular file to the Recycle Bin, not a folder or link.");
    }
    await shell.trashItem(target);
    return "Moved " + filename + " from " + key + " to the Windows Recycle Bin. You can restore it from there.";
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
      case "close_app":
        return { reply: closeApp(args.name) };
      case "type_text":
        return { reply: typeText(args.text) };
      case "delete_item":
        return { reply: await deleteUserFile(args.folder, args.name) };
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
          version: "1.3.0",
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

      if (request.method === "POST" && url.pathname === "/api/speech") {
        const data = await readJson(request);
        authorize(request, request.headers["x-ultron-token"] || request.headers["x-jarvis-token"]);
        if (!automationEnabled) throw error(403, "PC actions are disabled. Enable the ULTRON PC Companion first.");
        if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 3000) {
          throw error(422, "Speech text must contain 1 to 3000 characters.");
        }
        const language = typeof data.language === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/i.test(data.language)
          ? data.language
          : "en-IN";
        const audio = synthesizeWindowsSpeech(data.text.trim(), language);
        response.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Length": audio.length,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(audio);
        return;
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
    },
    get port() {
      const address = server && server.address();
      return address && typeof address === "object" ? address.port : null;
    }
  };
}

module.exports = { createPcService };
