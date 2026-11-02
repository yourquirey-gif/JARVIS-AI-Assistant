import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { AppLauncher } from "@capacitor/app-launcher";
import UltronStage from "./UltronStage.jsx";
import AndroidAppLauncher, { matchAndroidAppCommand, openAndroidApp } from "./platform/AndroidAppLauncher.jsx";
import {
  Activity, AudioLines, Bot, Bell, ExternalLink, MapPin, Mic, MicOff,
  Monitor, RefreshCw, Send, ShieldCheck, Terminal, Volume2, VolumeX, X,
  Download, Copy, Power, CheckCircle2, AlertTriangle, Smartphone, Globe
} from "lucide-react";

const DEFAULT_AGENT = "http://127.0.0.1:8765";
const CLOUD_API = (import.meta.env.VITE_JARVIS_CLOUD_API_URL || "").replace(/\/$/, "");
// Same-origin download: custom domains automatically use their own host.
const WINDOWS_DOWNLOAD = "/downloads/ULTRON-Windows-Setup.exe";
const ANDROID_DOWNLOAD = "/downloads/ULTRON-Android.apk";
const UPDATE_ORIGIN = "https://jarvis-ai-assistant-zeta-six.vercel.app";
const APP_VERSION = __ULTRON_VERSION__;
const IS_NATIVE_ANDROID = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
const IS_MOBILE_DEVICE = IS_NATIVE_ANDROID || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const IS_NATIVE_DESKTOP = typeof window !== "undefined" && Boolean(window.ultronDesktop?.isNativeDesktop);
const ACKNOWLEDGEMENTS = [
  "Your order is complete, sir.",
  "Done exactly as requested, sir.",
  "Your command has been completed, sir.",
  "At your service, sir. The task is complete.",
  "Certainly, sir. Consider it done.",
  "Executed successfully, sir.",
  "Your instruction has been carried out, sir.",
  "Completed as you asked, sir."
];

function chooseAcknowledgement(previous) {
  const choices = ACKNOWLEDGEMENTS.filter((line) => line !== previous);
  return choices[Math.floor(Math.random() * choices.length)] || ACKNOWLEDGEMENTS[0];
}

function compareVersions(left, right) {
  const a = String(left || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right || "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export default function App() {
  const [agentUrl, setAgentUrl] = useState(DEFAULT_AGENT);
  const [token, setToken] = useState("");
  // Pairing token is memory-only and is cleared whenever the app is closed.
  const [pairedToken, setPairedToken] = useState("");
  const [agent, setAgent] = useState("offline");
  const [permissions, setPermissions] = useState({ microphone: false, location: false, notifications: false });
  const [showPerms, setShowPerms] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [downloadPlatform, setDownloadPlatform] = useState("");
  const [downloadWindowsVersion, setDownloadWindowsVersion] = useState("");
  const [listening, setListening] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechBeat, setSpeechBeat] = useState(0);
  const [visualQuality, setVisualQuality] = useState("auto");
  const [status, setStatus] = useState("STANDBY");
  const [messages, setMessages] = useState([{ role: "assistant", text: "ULTRON online. Tap the microphone and speak a command. “Hello Ultron” is optional." }]);
  const [input, setInput] = useState("");
  const [transcript, setTranscript] = useState("");
  const [lang, setLang] = useState("en-IN");
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [location, setLocation] = useState("Not shared");
  const [system, setSystem] = useState(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [appUpdate, setAppUpdate] = useState(null);
  const [installedNativeVersion, setInstalledNativeVersion] = useState("");
  const [androidRelease, setAndroidRelease] = useState(null);
  const [windowsRelease, setWindowsRelease] = useState(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const rec = useRef(null);
  const logEnd = useRef(null);
  const listeningRef = useRef(false);
  const armedRef = useRef(false);
  const speechHandlerRef = useRef(null);
  const ackRef = useRef("");
  const restartTimer = useRef(null);
  const nativeRecognitionRunning = useRef(false);
  const whisperRecognitionRunning = useRef(false);
  const desktopMediaStreamRef = useRef(null);
  const desktopMediaRecorderRef = useRef(null);
  const desktopAudioContextRef = useRef(null);
  const dictatingRef = useRef(false);
  const dictationToggleRef = useRef(null);

  const setArmState = (value) => {
    armedRef.current = value;
    setArmed(value);
  };
  const setPerm = (key, value) => setPermissions((p) => ({ ...p, [key]: value }));
  const add = (role, text) => setMessages((m) => [...m, { role, text, time: new Date().toLocaleTimeString() }]);

  // Android speech-recognition 7.0.1 can stop listening but leave its stop()
  // promise pending. Never await it on the command path.
  const stopAndroidRecognition = () => {
    try {
      const pendingStop = SpeechRecognition.stop();
      if (pendingStop && typeof pendingStop.catch === "function") pendingStop.catch(() => {});
    } catch {}
  };

  const checkAppUpdate = async () => {
    setCheckingUpdate(true);
    const platform = IS_NATIVE_ANDROID ? "android" : IS_NATIVE_DESKTOP ? "windows" : "web";
    const base = IS_NATIVE_ANDROID ? UPDATE_ORIGIN : window.location.origin;
    try {
      const response = await fetch(`${base}/app-updates/${platform}.json?check=${Date.now()}`, {
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) throw new Error("Update information is not available.");
      const release = await response.json();
      let installedVersion = APP_VERSION;
      if (platform === "android" && IS_NATIVE_ANDROID) {
        const appInfo = await CapacitorApp.getInfo();
        installedVersion = appInfo.version || APP_VERSION;
        setInstalledNativeVersion(installedVersion);
      } else if (platform === "windows" && window.ultronDesktop?.getVersion) {
        installedVersion = await window.ultronDesktop.getVersion();
        setInstalledNativeVersion(installedVersion);
      } else if (platform === "web") {
        try {
          const savedWebVersion = window.localStorage.getItem("ultron-web-installed-version");
          if (savedWebVersion) {
            installedVersion = savedWebVersion;
          } else {
            window.localStorage.setItem("ultron-web-installed-version", APP_VERSION);
          }
        } catch {
          installedVersion = APP_VERSION;
        }
      }
      if (platform === "android") setAndroidRelease(release);
      if (platform === "windows") setWindowsRelease(release);
      const cleanInstallRequired = platform === "android" && release?.installMode === "clean_install";
      if (!cleanInstallRequired && release?.version && compareVersions(release.version, installedVersion) > 0 && release.version !== dismissedUpdateVersion) {
        setAppUpdate({ ...release, platform, installedVersion });
      } else {
        setAppUpdate(null);
      }
    } catch {
      // An offline update service must never block the assistant.
    } finally {
      setCheckingUpdate(false);
    }
  };

  const applyAppUpdate = async () => {
    if (!appUpdate) return;
    if (appUpdate.platform === "web") {
      try { window.localStorage.setItem("ultron-web-installed-version", appUpdate.version); } catch {}
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => {});
      }
      window.location.reload();
      return;
    }
    const base = appUpdate.platform === "android" ? UPDATE_ORIGIN : window.location.origin;
    const url = new URL(appUpdate.download || (appUpdate.platform === "android" ? ANDROID_DOWNLOAD : WINDOWS_DOWNLOAD), base);
    try {
      if (appUpdate.platform === "android" && IS_NATIVE_ANDROID) {
        await AppLauncher.openUrl({ url: url.toString() });
        return;
      }
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message || "Could not open the update download.");
    }
  };

  const revokeAllPermissions = async () => {
    listeningRef.current = false;
    armedRef.current = false;
    dictatingRef.current = false;
    setDictating(false);
    if (restartTimer.current) window.clearTimeout(restartTimer.current);
    try { rec.current?.stop(); } catch {}
    if (IS_NATIVE_ANDROID) stopAndroidRecognition();
    try { window.speechSynthesis?.cancel(); } catch {}
    if (IS_NATIVE_ANDROID) { try { await TextToSpeech.stop(); } catch {} }
    setListening(false);
    setArmState(false);
    setSpeaking(false);
    setPairedToken("");
    setToken("");
    setPending(null);
    setAgent("offline");
    setStatus("ACCESS REVOKED");
    setAutomationEnabled(false);
    setPermissions({ microphone: false, location: false, notifications: false });
    setLocation("Not shared");
    if (IS_NATIVE_DESKTOP && window.ultronDesktop?.revokeAllPermissions) {
      try { await window.ultronDesktop.revokeAllPermissions(); } catch {}
    }
    setError("");
    add("system", "ULTRON access revoked: active listening stopped, app permissions cleared, and local PC pairing disconnected.");
  };

  const speak = async (text) => {
    const spokenText = String(text || "").trim();
    if (!spokenText || muted) { setSpeaking(false); return; }

    if (IS_NATIVE_ANDROID) {
      try {
        try { await TextToSpeech.stop(); } catch {}
        setSpeaking(true);
        await TextToSpeech.speak({ text: spokenText, lang, rate: 0.86, pitch: 0.62, volume: 1, queueStrategy: 0 });
        setSpeechBeat((value) => value + 1);
        setSpeaking(false);
        return;
      } catch (nativeError) {
        setSpeaking(false);
        console.warn("ULTRON native TTS failed; trying browser TTS.", nativeError);
      }
    }

    if (IS_NATIVE_DESKTOP && pairedToken) {
      try {
        await localFetch("/api/action/execute", {
          method: "POST",
          body: JSON.stringify({ action: "boost_speech_volume", args: {} })
        });
      } catch (volumeError) {
        console.warn("ULTRON could not raise Windows speaker volume.", volumeError);
      }
    }

    if (!("speechSynthesis" in window)) {
      setError("Voice output is unavailable on this device. Text replies are still shown on screen.");
      setSpeaking(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      let voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length) {
        await new Promise((resolve) => {
          let finished = false;
          const done = () => {
            if (finished) return;
            finished = true;
            window.speechSynthesis.removeEventListener?.("voiceschanged", done);
            resolve();
          };
          window.speechSynthesis.addEventListener?.("voiceschanged", done, { once: true });
          window.setTimeout(done, 700);
        });
        voices = window.speechSynthesis.getVoices() || [];
      }
      const base = lang.toLowerCase().split("-")[0];
      const matching = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith(base));
      const maleVoice = /(male|david|mark|guy|alex|daniel|ravi|hemant|mohan|prabhat|george|james|tom|aaron|arthur|fred)/i;
      const selected = matching.find((voice) => maleVoice.test(voice.name))
        || matching.find((voice) => voice.localService)
        || matching[0]
        || voices.find((voice) => maleVoice.test(voice.name))
        || voices[0];
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = lang;
      utterance.rate = 0.92;
      utterance.pitch = 0.76;
      utterance.volume = 1;
      if (selected) utterance.voice = selected;
      setSpeaking(true);
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          setSpeaking(false);
          resolve();
        };
        utterance.onstart = () => setSpeaking(true);
        utterance.onboundary = () => setSpeechBeat((value) => value + 1);
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      });
    } catch (error) {
      setSpeaking(false);
      setError(error?.message || "ULTRON could not speak this reply.");
    }
  };
  const localFetch = async (path, options = {}) => {
    if (!pairedToken) throw new Error("Connect the ULTRON PC Companion first.");
    return fetch(agentUrl.replace(/\/$/, "") + path, {
      mode: "cors",
      targetAddressSpace: "loopback",
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Ultron-Token": pairedToken,
        ...(options.headers || {})
      }
    });
  };

  const checkAgent = async () => {
    if (IS_MOBILE_DEVICE) {
      setAgent("offline");
      setAutomationEnabled(false);
      return;
    }
    let serviceBase = agentUrl.replace(/\/$/, "");
    if (IS_NATIVE_DESKTOP) {
      try {
        const access = await window.ultronDesktop.getPcAccessStatus();
        if (!access?.allowed) {
          setPairedToken("");
          setAgent("offline");
          setAutomationEnabled(false);
          return;
        }
        if (Number.isInteger(access.port) && access.port > 0) {
          serviceBase = "http://127.0.0.1:" + access.port;
          if (agentUrl !== serviceBase) setAgentUrl(serviceBase);
        }
      } catch {
        setAgent("offline");
        setAutomationEnabled(false);
        return;
      }
    }
    try {
      const base = serviceBase;
      const response = await fetch(base + "/api/health", {
        mode: "cors",
        targetAddressSpace: "loopback"
      });
      if (!response.ok) throw new Error("Companion unavailable");
      const health = await response.json();

      // The companion returns a private pairing token only to exact trusted origins.
      // The browser still enforces its local-network permission and the companion
      // remains bound to 127.0.0.1.
      let activeToken = pairedToken;
      if (!activeToken) {
        const pairingResponse = await fetch(base + "/api/auto-pair", {
          mode: "cors",
          targetAddressSpace: "loopback",
          headers: { "Accept": "application/json" }
        });
        if (pairingResponse.ok) {
          const pairing = await pairingResponse.json();
          if (pairing.paired && pairing.token) {
            activeToken = pairing.token;
            setPairedToken(activeToken);
            add("system", "ULTRON connected to the Windows PC companion automatically.");
          }
        }
      }
      setAgent(activeToken ? (health.automation_enabled ? "paired" : "disabled") : "available");
      setAutomationEnabled(Boolean(health.automation_enabled));
    } catch {
      setAgent("offline");
      setAutomationEnabled(false);
    }
  };

  const connect = async () => {
    setError("");
    try {
      const response = await fetch(agentUrl.replace(/\/$/, "") + "/api/pair", {
        method: "POST",
        mode: "cors",
        targetAddressSpace: "loopback",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Pairing failed");
      setPairedToken(token);
      setToken("");
      setAgent(data.automation_enabled ? "paired" : "disabled");
      setAutomationEnabled(Boolean(data.automation_enabled));
      add("system", "ULTRON PC Companion paired successfully.");
    } catch (e) {
      setError(e.message || "Could not connect to the PC companion.");
      setAgent("offline");
    }
  };

  const executeLocalCommand = async (action) => {
    if (!pairedToken) throw new Error("Allow the ULTRON PC connection first.");
    const response = await localFetch("/api/action/execute", { method: "POST", body: JSON.stringify({ action: action.name, args: action.args || {} }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "ULTRON could not complete that PC action.");
    if (result.system) setSystem(result.system);
    const completion = chooseAcknowledgement(ackRef.current);
    ackRef.current = completion;
    const reply = completion + (result.reply ? " " + result.reply : "");
    add("assistant", reply); await speak(reply); setStatus("READY"); checkAgent();
  };

  const sendCommand = async (message) => {
    const text = (message || "").trim();
    if (!text || busy) return;
    setInput(""); setTranscript(""); add("user", text);
    const androidApp = IS_NATIVE_ANDROID ? matchAndroidAppCommand(text) : null;
    if (androidApp) {
      setBusy(true); setStatus("OPENING APP");
      try {
        await openAndroidApp(androidApp.packageName);
        const completion = chooseAcknowledgement(ackRef.current); ackRef.current = completion;
        const openedReply = completion + (lang.startsWith("hi") ? " " + androidApp.name + " खोल दिया है।" : " " + androidApp.name + " is open.");
        add("assistant", openedReply); await speak(openedReply); setStatus("READY");
      } catch (e) {
        const detail = e.message || "Could not open " + androidApp.name + ".";
        add("system", detail); await speak(lang.startsWith("hi") ? androidApp.name + " नहीं खुल पाया। " + detail : detail);
        setStatus("APP OPEN FAILED");
      } finally { setBusy(false); }
      return;
    }
    setBusy(true); setStatus("THINKING");
    try {
      let data;
      if (pairedToken) {
        const localResponse = await localFetch("/api/command", { method: "POST", body: JSON.stringify({ message: text, language: lang }) });
        const localData = await localResponse.json();
        if (!localResponse.ok) throw new Error(localData.detail || "Local companion request failed");
        if (localData.proposed_action) { await executeLocalCommand(localData.proposed_action); return; }
        if (localData.needs_ai) {
          if (!CLOUD_API) throw new Error("Cloud AI API is not configured.");
          const plannerResponse = await fetch(CLOUD_API + "/api/plan", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, language: lang, history: messages.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })) })
          });
          data = await plannerResponse.json();
          if (!plannerResponse.ok) throw new Error(data.detail || "ULTRON could not interpret the command.");
          if (data.kind === "action" && data.proposed_action) { await executeLocalCommand(data.proposed_action); return; }
        } else { data = localData; }
      } else {
        if (!CLOUD_API) throw new Error("Cloud AI API is not configured.");
        const plannerResponse = await fetch(CLOUD_API + "/api/plan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, language: lang, history: messages.slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })) })
        });
        data = await plannerResponse.json();
        if (!plannerResponse.ok) throw new Error(data.detail || "Cloud AI request failed");
        if (data.kind === "action" && data.proposed_action) {
          const note = "I understood the PC command, sir. Start and pair the ULTRON PC Companion to run it on this computer.";
          add("assistant", note); await speak(note); setStatus("PC COMPANION REQUIRED"); return;
        }
      }
      const reply = data.reply || "I am ready, sir.";
      add("assistant", reply); await speak(reply); setStatus("READY");
    } catch (e) {
      const detail = e.message || "Request failed.";
      add("system", detail);
      const voiceError = lang.startsWith("hi") ? "माफ़ कीजिए, आपका command पूरा नहीं हो पाया। " + detail : "Sorry, I could not complete that command. " + detail;
      await speak(voiceError); setStatus("REQUEST FAILED");
    } finally { setBusy(false); }
  };
  const approveAction = async () => {
    if (!pending || !pairedToken) return;
    setBusy(true);
    setStatus("EXECUTING");
    const acknowledgement = chooseAcknowledgement(ackRef.current);
    ackRef.current = acknowledgement;
    add("assistant", acknowledgement);
    speak(acknowledgement);
    try {
      const response = await localFetch("/api/action/execute", {
        method: "POST",
        body: JSON.stringify({ action: pending.name, args: pending.args || {} })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Action was not completed.");
      if (data.system) setSystem(data.system);
      add("assistant", data.reply || "Command completed, sir.");
      speak(data.reply || "Command completed, sir.");
      setPending(null);
      setStatus("READY");
      checkAgent();
    } catch (e) {
      const detail = e.message || "Action failed.";
      add("system", detail);
      speak(lang.startsWith("hi") ? "Action पूरा नहीं हो पाया। " + detail : "The action failed. " + detail);
      setStatus("ACTION FAILED");
    } finally {
      setBusy(false);
    }
  };

  const denyAction = () => {
    add("system", "Permission denied. No PC action was executed.");
    setPending(null);
    speak(lang.startsWith("hi") ? "ठीक है। आपकी अनुमति के बिना कोई action नहीं किया गया।" : "Understood. I did not run the action.");
    setStatus("READY");
  };

  const onRecognizedSpeech = async (spoken) => {
    const phrase = String(spoken || "").trim();
    if (!phrase) return;

    const wake = phrase.match(/(?:hello|hey|hyy|hi|हेलो|हाय|नमस्ते)\s*(?:ultron|ultra|alteron|अल्ट्रॉन|अल्ट्रोन)/i);
    if (wake) {
      const remaining = phrase.slice(wake.index + wake[0].length).replace(/^[\s,!.:-]+/, "").trim();
      if (remaining) {
        if (!IS_NATIVE_DESKTOP) {
          listeningRef.current = false;
          setListening(false);
          if (IS_NATIVE_ANDROID) { stopAndroidRecognition(); await new Promise((resolve) => window.setTimeout(resolve, 300)); }
          else { try { rec.current?.stop(); } catch {} }
        }
        setArmState(false);
        setStatus("THINKING");
        await sendCommand(remaining);
      } else {
        setArmState(true);
        setStatus("WAKE WORD HEARD · SAY COMMAND");
        if (IS_NATIVE_ANDROID) {
          stopAndroidRecognition();
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        const greeting = lang.startsWith("hi")
          ? "जी, मैं सुन रहा हूँ। बताइए क्या करना है?"
          : "I'm listening. What would you like me to do?";
        add("assistant", greeting);
        await speak(greeting);
      }
      return;
    }

    // The microphone button is an explicit tap-to-talk action. A wake phrase is
    // optional: a direct command is processed immediately while listening.
    if (armedRef.current || listeningRef.current) {
      if (!IS_NATIVE_DESKTOP) {
        listeningRef.current = false;
        setListening(false);
        if (IS_NATIVE_ANDROID) { stopAndroidRecognition(); await new Promise((resolve) => window.setTimeout(resolve, 300)); }
        else { try { rec.current?.stop(); } catch {} }
      }
      setArmState(false);
      setStatus("THINKING");
      await sendCommand(phrase);
    }
  };
  speechHandlerRef.current = onRecognizedSpeech;

  useEffect(() => {
    if (!IS_NATIVE_ANDROID) return undefined;
    let active = true;
    (async () => {
      try {
        const available = await SpeechRecognition.available();
        if (!available?.available) {
          if (active) setError("Android speech recognition is not available on this device. Text chat remains available.");
          return;
        }
        const permission = await SpeechRecognition.checkPermissions();
        if (active && permission?.speechRecognition !== "granted") {
          await grantMic();
        } else if (active) {
          setPerm("microphone", true);
        }
      } catch (e) {
        if (active) setError(e.message || "Could not request microphone permission.");
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!IS_NATIVE_DESKTOP || !window.ultronDesktop?.onPcStatus) return undefined;
    const unsubscribe = window.ultronDesktop.onPcStatus((value) => {
      if (value?.allowed) {
        if (Number.isInteger(value.port) && value.port > 0) setAgentUrl("http://127.0.0.1:" + value.port);
        checkAgent();
      } else {
        setPairedToken("");
        setAgent("offline");
        setAutomationEnabled(false);
      }
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!IS_NATIVE_DESKTOP || !window.ultronDesktop?.getMicrophoneStatus) return undefined;
    window.ultronDesktop.getMicrophoneStatus().then((value) => {
      if (value?.allowed) setPerm("microphone", true);
    }).catch(() => {});
  }, []);

  const requestDesktopPcAccess = async () => {
    if (!IS_NATIVE_DESKTOP) return;
    try {
      const result = await window.ultronDesktop.requestPcAccess();
      if (result?.allowed) {
        if (Number.isInteger(result.port) && result.port > 0) setAgentUrl("http://127.0.0.1:" + result.port);
        add("system", "PC connection allowed. ULTRON is connecting to this computer.");
        await checkAgent();
      } else {
        setPairedToken("");
        setAgent("offline");
        setAutomationEnabled(false);
        add("system", "PC connection denied. No local PC service was started.");
      }
    } catch (e) {
      setError(e.message || "Could not request PC connection permission.");
    }
  };

  useEffect(() => {
    checkAgent();
    const interval = window.setInterval(checkAgent, 15000);
    return () => window.clearInterval(interval);
  }, [agentUrl, pairedToken]);

  useEffect(() => {
    if (!IS_NATIVE_DESKTOP || agent !== "paired" || !pairedToken) return undefined;
    let active = true;
    const refreshSystemMonitor = async () => {
      try {
        const response = await localFetch("/api/action/execute", { method: "POST", body: JSON.stringify({ action: "get_system_info", args: {} }) });
        const result = await response.json();
        if (active && response.ok && result.system) setSystem(result.system);
      } catch { /* Keep the last successful metrics visible during a short local interruption. */ }
    };
    refreshSystemMonitor();
    const interval = window.setInterval(refreshSystemMonitor, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [agent, pairedToken, agentUrl]);


  useEffect(() => {
    const resetOnClose = () => {
      listeningRef.current = false;
      armedRef.current = false;
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
      try { rec.current?.stop(); } catch {}
      if (IS_NATIVE_ANDROID) SpeechRecognition.stop().catch(() => {});
      try { window.speechSynthesis?.cancel(); } catch {}
      try { sessionStorage.removeItem("ultron-pairing-key"); } catch {}
      setListening(false);
      setArmState(false);
      setSpeaking(false);
      setPairedToken("");
      setPermissions({ microphone: false, location: false, notifications: false });
      setLocation("Not shared");
      setSystem(null);
      setStatus("STANDBY");
    };
    window.addEventListener("pagehide", resetOnClose);
    window.addEventListener("beforeunload", resetOnClose);
    return () => {
      window.removeEventListener("pagehide", resetOnClose);
      window.removeEventListener("beforeunload", resetOnClose);
    };
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    const loadPlatformReleases = async () => {
      try {
        const [androidResponse, windowsResponse] = await Promise.all([
          fetch("/app-updates/android.json?check=" + Date.now(), { cache: "no-store" }),
          fetch("/app-updates/windows.json?check=" + Date.now(), { cache: "no-store" })
        ]);
        if (androidResponse.ok) setAndroidRelease(await androidResponse.json());
        if (windowsResponse.ok) setWindowsRelease(await windowsResponse.json());
      } catch {
        // Release labels are informational; an offline app still opens normally.
      }
    };
    loadPlatformReleases();
    checkAppUpdate();
    const interval = window.setInterval(checkAppUpdate, 5 * 60 * 1000);
    window.addEventListener("focus", checkAppUpdate);
    let installTimer = null;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        registration.update().catch(() => {});
      }).catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (!standalone) {
      installTimer = window.setTimeout(() => {
        try {
          if (sessionStorage.getItem("ultron-install-dismissed") !== "1") setShowInstall(true);
        } catch {
          setShowInstall(true);
        }
      }, 1800);
    }
    return () => {
      window.clearInterval(interval);
      if (installTimer) window.clearTimeout(installTimer);
      window.removeEventListener("focus", checkAppUpdate);
    };
  }, []);

  useEffect(() => {
    const beforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setShowInstall(true);
    };
    const installed = () => {
      setInstallPrompt(null);
      setShowInstall(false);
      setInstallHelp(false);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    if (IS_NATIVE_ANDROID || IS_NATIVE_DESKTOP) { rec.current = null; return undefined; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return undefined;
    const recognition = new Recognition();
    let recognitionActive = false;
    let retryCount = 0;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.onstart = () => { recognitionActive = true; retryCount = 0; };
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const value = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += value;
        else interim += value;
      }
      if (interim) setTranscript(interim);
      if (finalText.trim()) { setTranscript(finalText.trim()); speechHandlerRef.current?.(finalText.trim()); }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        listeningRef.current = false; setListening(false); setArmState(false);
        setError("Microphone access was denied. Allow microphone access in Windows and ULTRON Permissions.");
      } else if (event.error === "network") {
        retryCount += 1;
        setError("Speech service network interrupted. Reconnecting automatically…");
      } else if (event.error === "audio-capture") {
        setError("Microphone is busy or unavailable. Check the microphone selected in Windows.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("Speech recognition: " + event.error);
      }
    };
    recognition.onend = () => {
      recognitionActive = false;
      if (listeningRef.current) {
        if (restartTimer.current) window.clearTimeout(restartTimer.current);
        const delay = Math.min(650 * Math.pow(1.7, Math.min(retryCount, 5)), 7000);
        restartTimer.current = window.setTimeout(() => {
          if (listeningRef.current && !recognitionActive) { try { recognition.start(); } catch { retryCount += 1; } }
        }, delay);
      }
    };
    rec.current = recognition;
    return () => {
      listeningRef.current = false;
      if (restartTimer.current) window.clearTimeout(restartTimer.current);
      recognition.onend = null;
      try { recognition.stop(); } catch {}
      rec.current = null;
    };
  }, [lang]);
  const grantMic = async () => {
    try {
      if (IS_NATIVE_ANDROID) {
        const available = await SpeechRecognition.available();
        if (!available?.available) throw new Error("Speech recognition is not available on this Android device.");
        const permission = await SpeechRecognition.requestPermissions();
        const granted = permission?.speechRecognition === "granted";
        setPerm("microphone", granted);
        if (!granted) throw new Error("Microphone permission was denied. You can allow it later in Android settings.");
        setError("");
        return;
      }
      if (IS_NATIVE_DESKTOP && window.ultronDesktop?.requestMicrophone) {
        const permission = await window.ultronDesktop.requestMicrophone();
        setPerm("microphone", Boolean(permission?.allowed));
        if (!permission?.allowed) throw new Error("Microphone permission was denied.");
        setError("");
        return;
      }
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach((track) => track.stop());
      setPerm("microphone", true);
      setError("");
    } catch (e) {
      setError(e.message || "Microphone permission was not granted.");
    }
  };
  const grantLocation = () => {
    if (!navigator.geolocation) {
      setError("Location API is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation(position.coords.latitude.toFixed(3) + ", " + position.coords.longitude.toFixed(3));
        setPerm("location", true);
      },
      () => setError("Location permission denied."),
      { timeout: 10000 }
    );
  };
  const grantNotifications = async () => {
    if (!("Notification" in window)) {
      setError("Notifications are not supported.");
      return;
    }
    const permission = await Notification.requestPermission();
    setPerm("notifications", permission === "granted");
    if (permission === "granted") new Notification("ULTRON", { body: "Notifications enabled, sir." });
  };

  const testAndroidVoiceOutput = async () => {
    if (!IS_NATIVE_ANDROID) return;
    try {
      const support = await TextToSpeech.isLanguageSupported({ lang });
      if (!support?.supported) {
        await TextToSpeech.openInstall();
        const langs = await TextToSpeech.getSupportedLanguages();
        setError("Android TTS does not support " + lang + " yet. Check installed voice data in Android Text-to-speech settings.");
        return;
      }
      setError("");
      await speak(lang.startsWith("hi") ? "अल्ट्रॉन की आवाज़ तैयार है।" : "ULTRON voice output is ready.");
    } catch (error) {
      setSpeaking(false);
      setError(error?.message || "Android text-to-speech engine is unavailable. Check Android Text-to-speech settings.");
    }
  };

  const startAndroidRecognition = async () => {
    if (nativeRecognitionRunning.current) return;
    nativeRecognitionRunning.current = true;
    try {
      while (listeningRef.current) {
        const result = await SpeechRecognition.start({
          language: lang,
          maxResults: 1,
          partialResults: false,
          popup: false
        });
        const phrase = result?.matches?.[0]?.trim();
        if (phrase && listeningRef.current) {
          setTranscript(phrase);
          await speechHandlerRef.current?.(phrase);
        }
        if (listeningRef.current) await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    } catch (e) {
      if (listeningRef.current) {
        listeningRef.current = false;
        setListening(false);
        setArmState(false);
        setStatus("VOICE INPUT ERROR");
        setError(e?.message || "Android speech recognition stopped. Tap the microphone to try again.");
      }
    } finally {
      nativeRecognitionRunning.current = false;
      // Recognition resolves with a final result before this loop exits.
    }
  };

  const startDesktopWhisperRecognition = async () => {
    if (whisperRecognitionRunning.current) return;
    if (!CLOUD_API) { setError("ULTRON voice transcription service is not configured."); listeningRef.current = false; setListening(false); return; }
    whisperRecognitionRunning.current = true;
    let stream = null;
    let audioContext = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      desktopMediaStreamRef.current = stream;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("This Windows audio engine does not support microphone capture.");
      audioContext = new AudioContextClass();
      desktopAudioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      setError("");
      setStatus("LISTENING · ULTRON WHISPER");

      while (listeningRef.current) {
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
        let recorder;
        try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
        catch { recorder = new MediaRecorder(stream); }
        desktopMediaRecorderRef.current = recorder;
        const chunks = [];
        const preRoll = [];
        let heardSpeech = false;
        let lastVoiceAt = 0;
        let speechStartedAt = 0;
        let frameId = 0;
        const captureStartedAt = Date.now();
        const stopped = new Promise((resolve, reject) => {
          recorder.ondataavailable = (event) => {
            if (!event.data || !event.data.size) return;
            if (heardSpeech) chunks.push(event.data);
            else { preRoll.push(event.data); if (preRoll.length > 2) preRoll.shift(); }
          };
          recorder.onerror = () => reject(new Error("ULTRON could not record microphone audio. Check your microphone connection."));
          recorder.onstop = () => resolve();
          recorder.start(250);
          const monitor = () => {
            if (!listeningRef.current) { if (recorder.state !== "inactive") recorder.stop(); return; }
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i += 1) { const v = (samples[i] - 128) / 128; sum += v * v; }
            const rms = Math.sqrt(sum / samples.length);
            const now = Date.now();
            if (rms >= 0.010) {
              if (!heardSpeech) { heardSpeech = true; speechStartedAt = now; chunks.push(...preRoll); preRoll.length = 0; }
              lastVoiceAt = now;
            }
            if ((heardSpeech && (now - lastVoiceAt >= 1050 || now - speechStartedAt >= 14000)) || (!heardSpeech && now - captureStartedAt >= 12000)) {
              if (recorder.state !== "inactive") recorder.stop();
              return;
            }
            frameId = window.requestAnimationFrame(monitor);
          };
          frameId = window.requestAnimationFrame(monitor);
        });
        try { await stopped; } finally { if (frameId) window.cancelAnimationFrame(frameId); desktopMediaRecorderRef.current = null; }
        if (!listeningRef.current) break;
        if (!heardSpeech || !chunks.length) continue;
        const clip = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (clip.size < 1200) continue;
        try {
          setStatus("TRANSCRIBING VOICE");
          const form = new FormData();
          form.append("file", clip, "ultron-command.webm");
          form.append("language", "auto");
          const response = await fetch(CLOUD_API + "/api/transcribe", { method: "POST", body: form });
          const result = await response.json();
          if (!response.ok) throw new Error(result.detail || "ULTRON could not transcribe that command.");
          const phrase = String(result.text || "").trim();
          if (phrase && listeningRef.current) {
            setTranscript(phrase);
            setError("");
            if (dictatingRef.current) {
              if (/^(?:stop|end|finish) dictation$|^(?:लिखना बंद करो|डिक्टेशन बंद करो)$/i.test(phrase.trim())) {
                dictatingRef.current = false;
                setDictating(false);
                listeningRef.current = false;
                setListening(false);
                setStatus("DICTATION STOPPED");
                add("system", "Dictation stopped. Your text has been entered in the active app.");
              } else {
                const typedText = phrase.trim() + " ";
                const typedResponse = await localFetch("/api/action/execute", {
                  method: "POST",
                  body: JSON.stringify({ action: "type_text", args: { text: typedText } })
                });
                const typedResult = await typedResponse.json();
                if (!typedResponse.ok) throw new Error(typedResult.detail || "ULTRON could not type into the active app.");
                setStatus("DICTATION · WRITING IN ACTIVE APP");
              }
            } else {
              await speechHandlerRef.current?.(phrase);
            }
          }
        } catch (transcriptionError) {
          setError(transcriptionError?.message || "Voice transcription interrupted. ULTRON will keep listening.");
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
        if (listeningRef.current) setStatus("LISTENING · ULTRON WHISPER");
      }
    } catch (e) {
      if (listeningRef.current) {
        setStatus("VOICE INPUT RETRY");
        setError(e?.message || "ULTRON could not process microphone audio. Check your internet connection.");
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
      }
    } finally {
      if (desktopMediaRecorderRef.current && desktopMediaRecorderRef.current.state !== "inactive") { try { desktopMediaRecorderRef.current.stop(); } catch {} }
      if (stream) stream.getTracks().forEach((track) => track.stop());
      desktopMediaStreamRef.current = null;
      if (audioContext && audioContext.state !== "closed") { try { await audioContext.close(); } catch {} }
      desktopAudioContextRef.current = null;
      desktopMediaRecorderRef.current = null;
      whisperRecognitionRunning.current = false;
      if (listeningRef.current) setStatus("LISTENING FOR COMMAND");
    }
  };
  const stopDictation = () => {
    dictatingRef.current = false;
    setDictating(false);
    listeningRef.current = false;
    setListening(false);
    setArmState(false);
    if (desktopMediaRecorderRef.current && desktopMediaRecorderRef.current.state !== "inactive") {
      try { desktopMediaRecorderRef.current.stop(); } catch {}
    }
    if (desktopMediaStreamRef.current) desktopMediaStreamRef.current.getTracks().forEach((track) => track.stop());
    setStatus("DICTATION STOPPED");
  };

  const toggleDictation = async () => {
    if (dictatingRef.current) {
      stopDictation();
      return;
    }
    if (!IS_NATIVE_DESKTOP) {
      setError("Dictate Anywhere is available in the Windows ULTRON desktop app.");
      return;
    }
    if (!pairedToken || agent !== "paired") {
      setError("Connect the ULTRON PC Companion before using Dictate Anywhere.");
      setShowPerms(true);
      return;
    }
    if (!permissions.microphone) {
      setError("Allow microphone permission before starting Dictate Anywhere.");
      setShowPerms(true);
      return;
    }
    dictatingRef.current = true;
    setDictating(true);
    setError("");
    setTranscript("Dictation is on. Text will be typed into the currently focused app or website.");
    if (!listeningRef.current) {
      listeningRef.current = true;
      setListening(true);
      setArmState(false);
      setStatus("DICTATION ACTIVE · CTRL+ALT+D TO STOP");
      startDesktopWhisperRecognition();
    } else {
      setStatus("DICTATION ACTIVE · CTRL+ALT+D TO STOP");
    }
  };

  const toggleMic = async () => {
    if (!permissions.microphone) {
      setError("First allow microphone permission in Permissions.");
      setShowPerms(true);
      return;
    }
    if (listening) {
      if (dictatingRef.current) { dictatingRef.current = false; setDictating(false); }
      listeningRef.current = false;
      setListening(false);
      setArmState(false);
      setStatus("STANDBY");
      if (IS_NATIVE_ANDROID) {
        stopAndroidRecognition();
      } else if (IS_NATIVE_DESKTOP) {
        if (desktopMediaRecorderRef.current && desktopMediaRecorderRef.current.state !== "inactive") { try { desktopMediaRecorderRef.current.stop(); } catch {} }
        if (desktopMediaStreamRef.current) desktopMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } else {
        try { rec.current?.stop(); } catch {}
      }
      return;
    }
    setError("");
    listeningRef.current = true;
    setListening(true);
    setArmState(false);
    setStatus("LISTENING FOR COMMAND");
    if (IS_NATIVE_ANDROID) {
      startAndroidRecognition();
      return;
    }
    if (IS_NATIVE_DESKTOP) {
      startDesktopWhisperRecognition();
      return;
    }
    if (!rec.current) {
      setError("Speech recognition is not supported in this browser. Use a supported Chrome or Edge version.");
      listeningRef.current = false;
      setListening(false);
      return;
    }
    try { rec.current.start(); } catch {
      setError("Could not start microphone. Close another app using it and try again.");
      listeningRef.current = false;
      setListening(false);
    }
  };

  dictationToggleRef.current = toggleDictation;
  useEffect(() => {
    if (!IS_NATIVE_DESKTOP || !window.ultronDesktop?.onDictationToggle) return undefined;
    return window.ultronDesktop.onDictationToggle(() => dictationToggleRef.current?.());
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallHelp(true);
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setShowInstall(false);
  };
  const dismissInstall = () => {
    setShowInstall(false);
    setInstallHelp(false);
    try { sessionStorage.setItem("ultron-install-dismissed", "1"); } catch {}
  };

  const statusAgent = agent === "paired" ? "PAIRED" : agent === "disabled" ? "ACTIONS DISABLED" : agent === "available" ? "COMPANION FOUND" : "COMPANION OFFLINE";

  return (
    <main className="shell">
      <header className="top">
        <div className="brand">
          <span className="brandIcon"><AudioLines /></span>
          <div><b>ULTRON</b><small>PERSONAL INTELLIGENCE SYSTEM</small></div>
        </div>
        <div className="state"><i className={agent === "paired" ? "online" : ""} />{IS_NATIVE_ANDROID ? "ANDROID APP" : IS_MOBILE_DEVICE ? "MOBILE WEB / PWA" : statusAgent}</div>
        <div className="actions">
          <button onClick={() => setShowDownloads(true)} title="Download ULTRON for your device"><Download /></button>
          {!IS_MOBILE_DEVICE && <button onClick={checkAgent} title="Check companion"><RefreshCw /></button>}
          <button onClick={() => setShowPerms(true)} title="Permissions"><ShieldCheck /></button>
        </div>
      </header>

      {appUpdate && (
        <div className="veil updateVeil" role="dialog" aria-modal="true" aria-label="ULTRON update available">
          <section className="modal panel updateModal" onClick={(event) => event.stopPropagation()}>
            <h3><span><Download /> NEW UPDATE AVAILABLE</span></h3>
            <p className="updateVersion">ULTRON {appUpdate.installedVersion} → {appUpdate.version}</p>
            <p className="modalLead">{appUpdate.releaseNotes || "A new ULTRON update is ready for this device."}</p>
            {appUpdate.platform === "android" && <p className="updateNote">Android will ask you to confirm the APK installation. ULTRON cannot silently replace an installed app.</p>}
            {appUpdate.platform === "windows" && <p className="updateNote">Download the new installer, close ULTRON, then run the installer to update the desktop app.</p>}
            <div className="modalActions">
              <button className="primaryButton" onClick={applyAppUpdate}>{appUpdate.platform === "web" ? "REFRESH APP" : "DOWNLOAD UPDATE"}</button>
              <button className="secondaryButton" onClick={() => { setDismissedUpdateVersion(appUpdate.version); setAppUpdate(null); }}>LATER</button>
            </div>
          </section>
        </div>
      )}

      {showInstall && (
        <section className="installBanner">
          <div className="installIcon"><Download /></div>
          <div className="installCopy">
            <b>{IS_MOBILE_DEVICE ? "Install ULTRON on your phone" : "Install ULTRON on your Windows PC"}</b>
            <span>{IS_MOBILE_DEVICE ? "Add ULTRON to your home screen for quick voice and AI access." : "Install ULTRON as a desktop app. PC control connects to the local companion."}</span>
          </div>
          <button className="primaryButton" onClick={installApp}>{installPrompt ? "INSTALL APP" : "HOW TO INSTALL"}</button>
          {!IS_MOBILE_DEVICE && <a href={WINDOWS_DOWNLOAD} className="subtleLink">PC companion</a>}
          <button className="iconButton" onClick={dismissInstall} aria-label="Dismiss install prompt"><X /></button>
        </section>
      )}
      {installHelp && (
        <div className="veil" onClick={() => setInstallHelp(false)}>
          <section className="modal panel installHelp" onClick={(event) => event.stopPropagation()}>
            <h3>INSTALL ULTRON <button onClick={() => setInstallHelp(false)}><X /></button></h3>
            <p>{IS_MOBILE_DEVICE ? "On Android, open the browser menu and choose “Install app” or “Add to Home screen”. On iPhone, use Share → Add to Home Screen. The installed ULTRON app gives you the mobile-friendly voice and AI interface." : "In Chrome or Edge, open the browser menu and choose “Install ULTRON” or “Apps → Install this site as an app”."}</p>
            {!IS_MOBILE_DEVICE && <p>For Windows PC controls, install the companion below and keep it running. ULTRON will detect and pair with it automatically when this trusted website opens.</p>}
            {!IS_MOBILE_DEVICE && <a className="primaryButton linkButton" href={WINDOWS_DOWNLOAD}><Download /> DOWNLOAD WINDOWS COMPANION</a>}
            <button className="secondaryButton" onClick={() => setInstallHelp(false)}>CLOSE</button>
          </section>
        </div>
      )}

      {showDownloads && (
        <div className="veil" onClick={() => setShowDownloads(false)}>
          <section className="modal panel deviceDownloadModal" onClick={(event) => event.stopPropagation()}>
            <h3>DOWNLOAD ULTRON <button onClick={() => setShowDownloads(false)}><X /></button></h3>
            {!downloadPlatform && (
              <>
                <p className="modalLead">Choose your device. ULTRON has the same assistant experience, with controls tuned to each platform.</p>
                <div className="deviceChoices">
                  <button onClick={() => setDownloadPlatform("windows")}><Monitor /><b>Windows PC</b><small>Windows 7 · 8.1 · 10 · 11</small><span>DESKTOP INSTALLER</span></button>
                  <button onClick={() => setDownloadPlatform("android")}><Smartphone /><b>Android phone</b><small>Separate native Android app</small><span>APK DOWNLOAD</span></button>
                  <button onClick={() => setDownloadPlatform("iphone")}><Smartphone /><b>Apple iPhone</b><small>Safari home-screen app</small><span>ADD TO HOME SCREEN</span></button>
                </div>
              </>
            )}
            {downloadPlatform === "windows" && (
              <div className="downloadChoiceDetail">
                <button className="backLink" onClick={() => { setDownloadPlatform(""); setDownloadWindowsVersion(""); }}>← ALL DEVICES</button>
                <h4>SELECT YOUR WINDOWS VERSION</h4>
                <div className="windowsVersions">
                  {["Windows 7", "Windows 8 / 8.1", "Windows 10", "Windows 11"].map((version) => (
                    <button className={downloadWindowsVersion === version ? "selected" : ""} key={version} onClick={() => setDownloadWindowsVersion(version)}>
                      <Monitor /><span>{version}</span><i>{downloadWindowsVersion === version ? "SELECTED" : "SELECT"}</i>
                    </button>
                  ))}
                </div>
                {downloadWindowsVersion && (
                  <div className="selectedDownload">
                    <b>{downloadWindowsVersion} · ULTRON Desktop App</b>
                    <small>{downloadWindowsVersion === "Windows 7" || downloadWindowsVersion === "Windows 8 / 8.1" ? "Legacy Windows build uses Electron 22 / Chromium 108. Older Windows releases are no longer security-supported; use at your own risk." : "64-bit Windows desktop installer. PC access is requested with an Allow / Deny prompt when the app opens."}</small>
                    <a className="primaryButton downloadBig" href={WINDOWS_DOWNLOAD}><Download /> DOWNLOAD WINDOWS INSTALLER</a>
                  </div>
                )}
                <p className="versionNote">There was no Windows 9 release. Windows 8.1 was the version between Windows 7 and Windows 10.</p>
              </div>
            )}
            {downloadPlatform === "android" && (
              <div className="downloadChoiceDetail">
                <button className="backLink" onClick={() => setDownloadPlatform("")}>← ALL DEVICES</button>
                <h4>ULTRON FOR ANDROID</h4>
                <p className="modalLead">A separate native Android app with the same AI, ULTRON hologram and Hindi/English voice interface. Android will ask for microphone permission on first launch.</p>
                <div className="apkInfo"><Smartphone /><div><b>ULTRON Android APK · v{androidRelease?.publishedVersion || androidRelease?.version || APP_VERSION}</b><small>Latest APK published on this website · Direct install.</small></div></div>
                {androidRelease?.installMode === "clean_install" && <p className="updateNote">This is the newest APK currently published. Because its signing key differs from the older installation, uninstall the old ULTRON once, then install this file. The app will use in-place updates after the permanent signing key is configured.</p>}
                <a className="primaryButton downloadBig" href={ANDROID_DOWNLOAD}><Download /> DOWNLOAD LATEST APK · v{androidRelease?.publishedVersion || androidRelease?.version || APP_VERSION}</a>
              </div>
            )}
            {downloadPlatform === "iphone" && (
              <div className="downloadChoiceDetail">
                <button className="backLink" onClick={() => setDownloadPlatform("")}>← ALL DEVICES</button>
                <h4>ULTRON FOR IPHONE</h4>
                <p className="modalLead">Install ULTRON as a home-screen web app. A signed iOS App Store application is not published yet.</p>
                <ol className="iosSteps">
                  <li>Open this website in Safari.</li>
                  <li>Tap the Share icon.</li>
                  <li>Choose “Add to Home Screen”.</li>
                  <li>Open ULTRON and allow the microphone when starting voice commands.</li>
                </ol>
                <button className="primaryButton downloadBig" onClick={() => { setShowDownloads(false); setShowInstall(true); setInstallHelp(true); }}><Smartphone /> IPHONE INSTALL GUIDE</button>
              </div>
            )}
            <p className="privacy"><ShieldCheck /> Microphone is requested separately. Only the Windows app can request local PC connection permission. No permission is granted silently.</p>
          </section>
        </div>
      )}

      <section className="ultronLayout">
        <aside className="hudColumn hudLeft">
          <section className="hudPanel overviewPanel">
            <h3><span>SYSTEM OVERVIEW</span><Activity /></h3>
            <div className="overviewMetrics">
              {[
                ["CPU", system ? system.cpu_percent + "%" : "--", system ? system.cpu_percent : 0],
                ["RAM", system ? system.memory_percent + "%" : "--", system ? system.memory_percent : 0],
                ["DISK", system ? system.disk_percent + "%" : "--", system ? system.disk_percent : 0],
                ["NET", system ? (system.network_sent_mb || 0) + " MB" : "--", system ? 100 : 0]
              ].map((metric) => (
                <div className="overviewMetric" key={metric[0]}>
                  <div className="metricRing" style={{ "--metric-fill": metric[2] + "%" }}>
                    <span>{metric[1]}</span>
                  </div>
                  <small>{metric[0]}</small>
                </div>
              ))}
            </div>
            <div className="systemFacts">
              <span><i className={agent === "paired" ? "active" : ""} /> PC LINK <b>{agent === "paired" ? "CONNECTED" : "OFFLINE"}</b></span>
              <span><i className={listening ? "active" : ""} /> MICROPHONE <b>{listening ? "LISTENING" : "STANDBY"}</b></span>
            </div>
          </section>

          <section className="hudPanel terminalPanel">
            <h3><span>ULTRON TERMINAL</span><Terminal /></h3>
            <div className="terminalScreen">
              <p><b>ULTRON://CORE</b> — boot sequence</p>
              <p><em>[ OK ]</em> Neural interface initialized</p>
              <p><em>[ OK ]</em> Canvas renderer active</p>
              <p><em>[ {agent === "paired" ? "OK" : "--"} ]</em> Local PC companion {agent === "paired" ? "linked" : "not linked"}</p>
              <p><em>[ {listening ? "LIVE" : "IDLE"} ]</em> Voice input {listening ? "listening" : "standby"}</p>
              <p><em>[ {speaking ? "TALK" : "WAIT"} ]</em> Voice output {speaking ? "active" : "ready"}</p>
              <div className="terminalPrompt"><span>ULTRON@LOCAL</span> <b>›</b> <i>system ready</i><u /></div>
            </div>
          </section>

          <section className="hudPanel logsPanel">
            <h3><span>REAL-TIME LOGS</span><Activity /></h3>
            <div className="miniLogs">
              {messages.slice(-5).map((message, index) => (
                <p className={message.role} key={index}><time>{message.time || "NOW"}</time><b>[{message.role.toUpperCase()}]</b> {message.text}</p>
              ))}
              {messages.length === 0 && <p><time>--:--</time><b>[BOOT]</b> ULTRON standing by.</p>}
            </div>
          </section>
          <div className="sideFoot"><ShieldCheck /> LOCAL PC ACCESS IS PERMISSION-BASED</div>
        </aside>

        <section className="heroPanel">
          <div className="heroTopline">
            <span>MARK VII · HOLOGRAPHIC NEURAL CORE</span>
            <b><i className={speaking ? "talking" : listening ? "listeningDot" : ""} />{speaking ? "SPEAKING" : listening ? "LISTENING" : busy ? "PROCESSING" : "AWAITING COMMAND"}</b>
          </div>
          <div className="heroStage">
            <UltronStage
              speaking={speaking}
              listening={listening}
              thinking={busy}
              speechTick={speechBeat}
              quality={visualQuality}
              onQualityChange={setVisualQuality}
              onMicClick={toggleMic}
            />
          </div>
          <div className="codepenVoiceDock">
            <button className={"codepenMic " + (listening ? "active" : "")} onClick={toggleMic} aria-label={listening ? "Stop listening" : "Start voice listening"}>
              {listening ? <MicOff /> : <Mic />}
            </button>
            <div className="codepenVoiceText">
              <b>{listening ? (armed ? "WAKE WORD HEARD · SAY COMMAND" : "SPEAK YOUR COMMAND") : speaking ? "ULTRON IS SPEAKING" : "TAP MIC · THEN SPEAK"}</b>
              <span>{transcript || (listening ? "Tap-to-talk is active. Wake phrase is optional." : "Tap the microphone, then speak in Hindi or English")}</span>
            </div>
            <button className="voiceIconButton" onClick={() => {
              const next = !muted;
              setMuted(next);
              if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
              if (next && IS_NATIVE_ANDROID) TextToSpeech.stop().catch(() => {});
              if (next) setSpeaking(false);
            }} title={muted ? "Unmute voice" : "Mute voice"}>{muted ? <VolumeX /> : <Volume2 />}</button>
            <button className="voiceIconButton" onClick={() => setShowPerms(true)} title="Permissions"><ShieldCheck /></button>
          </div>
          {IS_NATIVE_DESKTOP && agent === "paired" && (
            <div className="dictationDock">
              <button className={"dictationButton " + (dictating ? "active" : "")} onClick={toggleDictation}>
                {dictating ? "STOP DICTATION" : "DICTATE ANYWHERE"}
              </button>
              <span>{dictating ? "Typing in the focused app/site · say “Stop dictation” or press Ctrl + Alt + D" : "Shortcut: focus a text field, then press Ctrl + Alt + D. Or start here, then switch to the app/site."}</span>
            </div>
          )}
          <div className="heroFooter">
            <span>ULTRON VOICE INTERFACE · {IS_NATIVE_ANDROID ? "ANDROID APP" : IS_NATIVE_DESKTOP ? "WINDOWS DESKTOP APP" : IS_MOBILE_DEVICE ? "MOBILE WEB APP" : "DESKTOP WEB"}</span>
            <label>VOICE
              <select value={lang} onChange={(event) => setLang(event.target.value)}>
                <option value="en-IN">EN-IN</option>
                <option value="hi-IN">HINDI</option>
                <option value="en-US">EN-US</option>
              </select>
            </label>
            <label>QUALITY
              <select value={visualQuality} onChange={(event) => setVisualQuality(event.target.value)}>
                <option value="auto">AUTO</option>
                <option value="low">LOW PC</option>
                <option value="high">HIGH</option>
              </select>
            </label>
          </div>
          {error && <p className="heroError"><AlertTriangle /> {error}</p>}
        </section>

        <aside className="hudColumn hudRight">
          <section className="hudPanel aiPanel">
            <h3><span>AI CHAT INTERFACE</span><Bot /></h3>
            <div className="chatGreeting">
              <b>Hello. I am ULTRON.</b>
              <span>Your personal intelligent system assistant. How may I assist you?</span>
            </div>
            <div className="chatSuggestions">
              <span>You can ask me to:</span>
              <i>› Monitor your system</i>
              <i>› Open apps and websites</i>
              <i>› Automate approved tasks</i>
              <i>› Answer questions in Hindi or English</i>
            </div>
            <div className="chatFeed">
              {messages.slice(-3).map((message, index) => (
                <div className={"chatBubble " + message.role} key={index}>
                  <b>{message.role === "user" ? "YOU" : message.role === "system" ? "SYSTEM" : "ULTRON"}</b>
                  <span>{message.text}</span>
                </div>
              ))}
              <div ref={logEnd} />
            </div>
            <form className="chatComposer" onSubmit={(event) => { event.preventDefault(); sendCommand(input); }}>
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask ULTRON anything..." />
              <button disabled={!input.trim() || busy} aria-label="Send message"><Send /></button>
            </form>
          </section>

          <section className="hudPanel monitorPanel">
            <h3><span>SYSTEM MONITOR</span><Activity /></h3>
            <div className="monitorStat">
              <div><span>CPU USAGE</span><b>{system ? system.cpu_percent + "%" : "—"}</b></div>
              <div className="monitorTrace cpuTrace" />
            </div>
            <div className="monitorStat">
              <div><span>RAM USAGE</span><b>{system ? system.memory_percent + "%" : "—"}</b><small>{system ? (system.memory_used_gb || 0) + " / " + (system.memory_total_gb || 0) + " GB used" : "Waiting for PC metrics"}</small></div>
              <div className="monitorTrace ramTrace" />
            </div>
            <div className="monitorStat">
              <div><span>ROM / STORAGE USAGE</span><b>{system ? system.disk_percent + "%" : "—"}</b><small>{system ? (system.disk_used_gb || 0) + " / " + (system.disk_total_gb || 0) + " GB used" : "Waiting for PC metrics"}</small></div>
              <div className="monitorTrace diskTrace" />
            </div>
            <div className="monitorStat">
              <div><span>NETWORK SENT / RECEIVED</span><b>{system ? (system.network_sent_mb || 0) + " / " + (system.network_recv_mb || 0) + " MB" : "—"}</b><small>{system ? "Since Windows network counters started" : "Network counters unavailable"}</small></div>
              <div className="monitorTrace netTrace" />
            </div>
            <div className="monitorProcesses">
              <span>LIVE PROCESSES / STATUS</span>
              <p>{system ? system.platform + " · " + (system.process_count || 0) + " processes · Uptime " + Math.round((system.uptime_seconds || 0) / 3600) + "h" : "PC companion " + (agent === "paired" ? "connected · loading metrics" : "not connected")}</p>
              <p>Voice engine · {listening ? (IS_NATIVE_DESKTOP ? "ULTRON Whisper · active" : "active") : "idle"}</p>
              {system?.top_processes?.length ? system.top_processes.slice(0, 5).map((process) => <p key={process.pid}>{process.name} · {process.memory_mb} MB</p>) : <p>Process details will appear when the PC monitor connects.</p>}
              <p>Renderer · Canvas 2D / {visualQuality.toUpperCase()}</p>
            </div>
          </section>


        </aside>
      </section>
      <footer className="ultronFooter">
        <span>ULTRON · PERSONAL INTELLIGENCE SYSTEM</span>
        <span>LOCAL MACHINE CONTROL · PC ACCESS CONSENTED</span>
      </footer>

      {showPerms && (
        <div className="veil" onClick={() => setShowPerms(false)}>
          <section className="modal panel" onClick={(event) => event.stopPropagation()}>
            <h3>PERMISSION CENTER <button onClick={() => setShowPerms(false)}><X /></button></h3>
            <p className="modalLead">{IS_NATIVE_ANDROID ? "ULTRON needs microphone permission for voice commands. You can deny it and still use text chat." : IS_NATIVE_DESKTOP ? "ULTRON asks separately for PC connection and microphone permission. Denying either keeps that feature off." : "Grant only the browser permissions you choose. PC access is available in the native Windows app."}</p>
            <div className="permission"><Mic /><div><b>Microphone</b><small>Voice commands while listening is active. Windows voice clips are sent to ULTRON Whisper for transcription.</small></div><button onClick={grantMic}>{permissions.microphone ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><MapPin /><div><b>Location</b><small>Only used when you request a location feature</small></div><button onClick={grantLocation}>{permissions.location ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Bell /><div><b>Notifications</b><small>Optional ULTRON alerts</small></div><button onClick={grantNotifications}>{permissions.notifications ? "GRANTED" : "ALLOW"}</button></div>
            {!IS_MOBILE_DEVICE && !IS_NATIVE_DESKTOP && <div className="permission"><Monitor /><div><b>Windows desktop app</b><small>Dedicated app with local PC Allow/Deny connection</small></div><a href={WINDOWS_DOWNLOAD}>DOWNLOAD</a></div>}
            {!IS_MOBILE_DEVICE && <div className="pair" id="agent-connect">
              <b>{IS_NATIVE_DESKTOP ? "DESKTOP PC CONNECTION" : "AUTOMATIC PC CONNECTION"}</b>
              <small>{IS_MOBILE_DEVICE ? "PC control runs from ULTRON on your Windows computer. The Android app controls this phone's own voice and AI interface." : IS_NATIVE_DESKTOP ? "Allow starts the private local service and automatically pairs ULTRON. Deny leaves PC control off. Closing the desktop app stops its service." : "The native Windows app connects automatically after you allow PC access."}</small>
              <div className="pairStatus">
                <i className={agent === "paired" ? "connected" : ""} />
                <span>{agent === "paired" ? "PC CONNECTED" : agent === "disabled" ? "PC ACTIONS DISABLED" : agent === "available" ? "COMPANION FOUND · WAITING FOR TRUSTED PAIR" : "LOOKING FOR WINDOWS COMPANION"}</span>
              </div>
              {IS_NATIVE_DESKTOP && agent !== "paired" && <button onClick={requestDesktopPcAccess}><ShieldCheck /> ALLOW PC CONNECTION</button>}
              {!IS_MOBILE_DEVICE && !IS_NATIVE_DESKTOP && <button onClick={checkAgent}><RefreshCw /> CHECK CONNECTION</button>}
              {agent === "disabled" && <small className="warningText">Enable approved PC actions inside the Windows companion and restart it.</small>}
              <details className="manualPair">
                <summary>Advanced connection settings</summary>
                <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="http://127.0.0.1:8765" />
                <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Optional manual pairing key" />
                <button disabled={!token.trim()} onClick={connect}>MANUAL CONNECT</button>
              </details>
            </div>}
            {IS_MOBILE_DEVICE && (
              <div className="pair" id="phone-control">
                <b>{IS_NATIVE_ANDROID ? "ANDROID PHONE CONTROL" : "MOBILE WEB / PWA"}</b>
                <small>{IS_NATIVE_ANDROID
                  ? "Tap the microphone and speak directly; no wake phrase is required. ULTRON can open selected apps such as WhatsApp, YouTube, Chrome and Maps. It does not read app screens or type into other apps in this release."
                  : "This screen is running in the mobile browser, not inside the native Android APK. Browser/PWA mode cannot launch or type inside other phone apps. Install the Android APK for native speech recognition."}</small>
                {IS_NATIVE_ANDROID && <AndroidAppLauncher />}
                {IS_NATIVE_ANDROID
                  ? <div className="pairStatus"><i className={permissions.microphone ? "connected" : ""} /><span>{permissions.microphone ? "MICROPHONE CONSENT ENABLED" : "MICROPHONE CONSENT NOT ENABLED"}</span></div>
                  : <a className="secondaryButton" href={ANDROID_DOWNLOAD}><Download /> GET ANDROID APP</a>}
              </div>
            )}
            <div className="modalActions">
              {!IS_MOBILE_DEVICE && !IS_NATIVE_DESKTOP && <a className="secondaryButton" href={WINDOWS_DOWNLOAD}><Download /> GET WINDOWS APP</a>}
              {!IS_MOBILE_DEVICE && <button className="secondaryButton" onClick={checkAgent}><RefreshCw /> CHECK CONNECTION</button>}
              <button className="secondaryButton" onClick={checkAppUpdate} disabled={checkingUpdate}><RefreshCw /> {checkingUpdate ? "CHECKING..." : "CHECK UPDATES"}</button>
            </div>
            {IS_NATIVE_ANDROID && <div className="permission"><Volume2 /><div><b>Voice output / Text-to-speech</b><small>Checks that Hindi/English voice data is installed and plays a short test reply. No extra microphone permission is needed for speaking.</small></div><button onClick={testAndroidVoiceOutput}>TEST VOICE</button></div>}
            <div className="permission versionRow"><div><b>Installed version</b><small>{installedNativeVersion || APP_VERSION} · {IS_NATIVE_ANDROID ? "Android app" : IS_NATIVE_DESKTOP ? "Windows desktop" : "Web / PWA"}</small></div><span>ULTRON</span></div>
            <button className="revokeAllButton" onClick={revokeAllPermissions}><ShieldCheck /> REVOKE ALL ULTRON ACCESS</button>
            <p className="privacy"><ShieldCheck /> Revoke All stops listening, cancels speech, clears ULTRON's local consent and disconnects the Windows companion. Android, Windows and browser OS permissions cannot be revoked by an app itself; use the device's system settings for those. Each sensitive PC action still asks for confirmation.</p>
          </section>
        </div>
      )}
      <footer>ULTRON PERSONAL AI · VOICE-FIRST WEB APP + WINDOWS PC COMPANION · PERMISSION-FIRST</footer>
    </main>
  );
}
