import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import UltronStage from "./UltronStage.jsx";
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
  "Understood, sir. Initiating your command now.",
  "Certainly, sir. Executing your request.",
  "Acknowledged, sir. Proceeding with the operation.",
  "Right away, sir. Your command is in motion.",
  "On it, sir. Starting the requested task.",
  "At once, sir. Initiating the operation.",
  "Very well, sir. Carrying out your instruction.",
  "Affirmative, sir. Proceeding now."
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
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechBeat, setSpeechBeat] = useState(0);
  const [visualQuality, setVisualQuality] = useState("auto");
  const [status, setStatus] = useState("STANDBY");
  const [messages, setMessages] = useState([{ role: "assistant", text: "ULTRON online. Say “Hello Ultron” or “Hey Ultron” to get my attention." }]);
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
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const rec = useRef(null);
  const logEnd = useRef(null);
  const listeningRef = useRef(false);
  const armedRef = useRef(false);
  const speechHandlerRef = useRef(null);
  const ackRef = useRef("");
  const restartTimer = useRef(null);
  const nativeRecognitionRunning = useRef(false);

  const setArmState = (value) => {
    armedRef.current = value;
    setArmed(value);
  };
  const setPerm = (key, value) => setPermissions((p) => ({ ...p, [key]: value }));
  const add = (role, text) => setMessages((m) => [...m, { role, text, time: new Date().toLocaleTimeString() }]);

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
      const installedVersion = IS_NATIVE_DESKTOP && window.ultronDesktop?.getVersion
        ? await window.ultronDesktop.getVersion()
        : APP_VERSION;
      if (release?.version && compareVersions(release.version, installedVersion) > 0) {
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

  const applyAppUpdate = () => {
    if (!appUpdate) return;
    if (appUpdate.platform === "web") {
      window.location.reload();
      return;
    }
    const base = appUpdate.platform === "android" ? UPDATE_ORIGIN : window.location.origin;
    const url = new URL(appUpdate.download || (appUpdate.platform === "android" ? ANDROID_DOWNLOAD : WINDOWS_DOWNLOAD), base);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };

  const revokeAllPermissions = async () => {
    listeningRef.current = false;
    armedRef.current = false;
    if (restartTimer.current) window.clearTimeout(restartTimer.current);
    try { rec.current?.stop(); } catch {}
    if (IS_NATIVE_ANDROID) {
      try { await SpeechRecognition.stop(); } catch {}
    }
    try { window.speechSynthesis?.cancel(); } catch {}
    setListening(false);
    setArmState(false);
    setSpeaking(false);
    setPairedToken("");
    setAgent("offline");
    setAutomationEnabled(false);
    setPermissions({ microphone: false, location: false, notifications: false });
    setLocation("Not shared");
    if (IS_NATIVE_DESKTOP && window.ultronDesktop?.revokeAllPermissions) {
      try { await window.ultronDesktop.revokeAllPermissions(); } catch {}
    }
    setError("");
    add("system", "ULTRON access revoked: active listening stopped, app permissions cleared, and local PC pairing disconnected.");
  };

  const speak = (text) => {
    if (!("speechSynthesis" in window) || !text) return;
    if (muted) {
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    setSpeaking(false);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onboundary = () => setSpeechBeat((value) => value + 1);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utterance.lang = lang;
    utterance.rate = 0.88;
    utterance.pitch = 0.68;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices() || [];
    const base = lang.toLowerCase().split("-")[0];
    const matching = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith(base));
    const masculineName = /(male|david|mark|guy|alex|daniel|ravi|george|james|tom|aaron|arthur|fred|microsoft.*male)/i;
    const feminineName = /(female|zira|susan|samantha|heera|veena|karen)/i;
    const selected = matching.find((voice) => masculineName.test(voice.name))
      || voices.find((voice) => masculineName.test(voice.name))
      || matching.find((voice) => !feminineName.test(voice.name))
      || matching[0]
      || voices[0];
    if (selected) utterance.voice = selected;
    window.speechSynthesis.speak(utterance);
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
    if (IS_NATIVE_DESKTOP) {
      try {
        const access = await window.ultronDesktop.getPcAccessStatus();
        if (!access?.allowed) {
          setPairedToken("");
          setAgent("offline");
          setAutomationEnabled(false);
          return;
        }
      } catch {
        setAgent("offline");
        setAutomationEnabled(false);
        return;
      }
    }
    try {
      const base = agentUrl.replace(/\/$/, "");
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

  const sendCommand = async (message) => {
    const text = (message || "").trim();
    if (!text || busy) return;
    setInput("");
    setTranscript("");
    add("user", text);
    setBusy(true);
    setStatus("THINKING");
    try {
      let data;
      if (pairedToken) {
        const localResponse = await localFetch("/api/command", {
          method: "POST",
          body: JSON.stringify({ message: text, language: lang })
        });
        const localData = await localResponse.json();
        if (!localResponse.ok) throw new Error(localData.detail || "Local companion request failed");
        if (localData.proposed_action) {
          setPending(localData.proposed_action);
          add("system", "Approval required: " + localData.proposed_action.description);
          setStatus("AWAITING APPROVAL");
          return;
        }
        if (localData.needs_ai) {
          if (!CLOUD_API) throw new Error("Cloud AI API is not configured.");
          const plannerResponse = await fetch(CLOUD_API + "/api/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: text,
              language: lang,
              history: messages.slice(-8).map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.text
              }))
            })
          });
          data = await plannerResponse.json();
          if (!plannerResponse.ok) throw new Error(data.detail || "ULTRON could not interpret the command.");
          if (data.kind === "action" && data.proposed_action) {
            setPending(data.proposed_action);
            add("system", "Approval required: " + data.proposed_action.description);
            setStatus("AWAITING APPROVAL");
            return;
          }
        } else {
          data = localData;
        }
      } else {
        if (!CLOUD_API) throw new Error("Cloud AI API is not configured.");
        const plannerResponse = await fetch(CLOUD_API + "/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            language: lang,
            history: messages.slice(-8).map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.text
            }))
          })
        });
        data = await plannerResponse.json();
        if (!plannerResponse.ok) throw new Error(data.detail || "Cloud AI request failed");
        if (data.kind === "action" && data.proposed_action) {
          const note = "I understood the PC command, sir. Start and pair the ULTRON PC Companion to run it on this computer.";
          add("assistant", note);
          speak(note);
          setStatus("PC COMPANION REQUIRED");
          return;
        }
      }
      const reply = data.reply || "I am ready, sir.";
      add("assistant", reply);
      speak(reply);
      setStatus("READY");
    } catch (e) {
      add("system", e.message || "Request failed.");
      setStatus("REQUEST FAILED");
    } finally {
      setBusy(false);
    }
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
      add("system", e.message || "Action failed.");
      setStatus("ACTION FAILED");
    } finally {
      setBusy(false);
    }
  };

  const denyAction = () => {
    add("system", "Permission denied. No PC action was executed.");
    setPending(null);
    setStatus("READY");
  };

  const onRecognizedSpeech = (spoken) => {
    const phrase = spoken.trim();
    if (!phrase) return;
    const wake = phrase.match(/\b(?:hello|hey|hyy|hi)\s+(?:ultron|ultra|alteron)\b/i);
    if (wake) {
      const remaining = phrase.slice(wake.index + wake[0].length).replace(/^[\s,!.:-]+/, "").trim();
      setArmState(true);
      if (remaining) {
        setArmState(false);
        sendCommand(remaining);
      } else {
        const greeting = "I'm listening, sir. What would you like me to do?";
        add("assistant", greeting);
        speak(greeting);
        setStatus("ULTRON ACTIVATED");
      }
      return;
    }
    if (armedRef.current) {
      setArmState(false);
      sendCommand(phrase);
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
    if (IS_NATIVE_ANDROID) {
      rec.current = null;
      return undefined;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const value = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += value;
        else interim += value;
      }
      if (interim) setTranscript(interim);
      if (finalText.trim()) {
        setTranscript(finalText.trim());
        if (speechHandlerRef.current) speechHandlerRef.current(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        listeningRef.current = false;
        setListening(false);
        setArmState(false);
        setError("Microphone permission was denied. Allow microphone access in browser settings.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("Speech recognition: " + event.error);
      }
    };
    recognition.onend = () => {
      if (listeningRef.current) {
        restartTimer.current = window.setTimeout(() => {
          if (listeningRef.current) {
            try { recognition.start(); } catch {}
          }
        }, 450);
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
          speechHandlerRef.current?.(phrase);
        }
        if (listeningRef.current) await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    } catch (e) {
      if (listeningRef.current) setError(e?.message || "Android speech recognition stopped.");
    } finally {
      nativeRecognitionRunning.current = false;
      try { await SpeechRecognition.stop(); } catch {}
    }
  };

  const toggleMic = async () => {
    if (!permissions.microphone) {
      setError("First allow microphone permission in Permissions.");
      setShowPerms(true);
      return;
    }
    if (listening) {
      listeningRef.current = false;
      setListening(false);
      setArmState(false);
      setStatus("STANDBY");
      if (IS_NATIVE_ANDROID) {
        try { await SpeechRecognition.stop(); } catch {}
      } else {
        try { rec.current?.stop(); } catch {}
      }
      return;
    }
    setError("");
    listeningRef.current = true;
    setListening(true);
    setArmState(false);
    setStatus("WAKE WORD ACTIVE");
    if (IS_NATIVE_ANDROID) {
      startAndroidRecognition();
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
              <button className="secondaryButton" onClick={() => setAppUpdate(null)}>LATER</button>
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
                <div className="apkInfo"><Smartphone /><div><b>ULTRON Android APK</b><small>Direct install · Android may ask you to allow installation from your browser or file manager.</small></div></div>
                <a className="primaryButton downloadBig" href={ANDROID_DOWNLOAD}><Download /> DOWNLOAD ANDROID APK</a>
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
              <b>{listening ? (armed ? "ULTRON IS LISTENING" : "SPEAK NOW") : speaking ? "ULTRON IS SPEAKING" : "SAY “HELLO ULTRON” TO START"}</b>
              <span>{transcript || (listening ? "Give your command in Hindi or English" : "Tap the microphone to activate voice commands")}</span>
            </div>
            <button className="voiceIconButton" onClick={() => {
              const next = !muted;
              setMuted(next);
              if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
              if (next) setSpeaking(false);
            }} title={muted ? "Unmute voice" : "Mute voice"}>{muted ? <VolumeX /> : <Volume2 />}</button>
            <button className="voiceIconButton" onClick={() => setShowPerms(true)} title="Permissions"><ShieldCheck /></button>
          </div>
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
            {pending && (
              <div className="actionApproval">
                <b>APPROVAL REQUIRED</b>
                <span>{pending.description}</span>
                <div>
                  <button disabled={busy || !automationEnabled} onClick={approveAction}>ALLOW</button>
                  <button className="deny" onClick={denyAction}>DENY</button>
                </div>
              </div>
            )}
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
              <div><span>RAM USAGE</span><b>{system ? system.memory_percent + "%" : "—"}</b></div>
              <div className="monitorTrace ramTrace" />
            </div>
            <div className="monitorStat">
              <div><span>DISK USAGE</span><b>{system ? system.disk_percent + "%" : "—"}</b></div>
              <div className="monitorTrace diskTrace" />
            </div>
            <div className="monitorStat">
              <div><span>NETWORK SENT</span><b>{system ? (system.network_sent_mb || 0) + " MB" : "—"}</b></div>
              <div className="monitorTrace netTrace" />
            </div>
            <div className="monitorProcesses">
              <span>PROCESSES / STATUS</span>
              <p>{system ? system.platform : "PC companion " + (agent === "paired" ? "connected" : "not connected")}</p>
              <p>Voice engine · {listening ? "active" : "idle"}</p>
              <p>Renderer · Canvas 2D / {visualQuality.toUpperCase()}</p>
            </div>
          </section>


        </aside>
      </section>
      <footer className="ultronFooter">
        <span>ULTRON · PERSONAL INTELLIGENCE SYSTEM</span>
        <span>LOCAL MACHINE CONTROL · USER APPROVAL REQUIRED</span>
      </footer>

      {showPerms && (
        <div className="veil" onClick={() => setShowPerms(false)}>
          <section className="modal panel" onClick={(event) => event.stopPropagation()}>
            <h3>PERMISSION CENTER <button onClick={() => setShowPerms(false)}><X /></button></h3>
            <p className="modalLead">{IS_NATIVE_ANDROID ? "ULTRON needs microphone permission for voice commands. You can deny it and still use text chat." : IS_NATIVE_DESKTOP ? "ULTRON asks separately for PC connection and microphone permission. Denying either keeps that feature off." : "Grant only the browser permissions you choose. PC access is available in the native Windows app."}</p>
            <div className="permission"><Mic /><div><b>Microphone</b><small>Wake-word detection and voice commands while this app is open</small></div><button onClick={grantMic}>{permissions.microphone ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><MapPin /><div><b>Location</b><small>Only used when you request a location feature</small></div><button onClick={grantLocation}>{permissions.location ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Bell /><div><b>Notifications</b><small>Optional ULTRON alerts</small></div><button onClick={grantNotifications}>{permissions.notifications ? "GRANTED" : "ALLOW"}</button></div>
            {!IS_MOBILE_DEVICE && !IS_NATIVE_DESKTOP && <div className="permission"><Monitor /><div><b>Windows desktop app</b><small>Dedicated app with local PC Allow/Deny connection</small></div><a href={WINDOWS_DOWNLOAD}>DOWNLOAD</a></div>}
            <div className="pair" id="agent-connect">
              <b>{IS_MOBILE_DEVICE ? "WINDOWS PC CONTROL" : IS_NATIVE_DESKTOP ? "DESKTOP PC CONNECTION" : "AUTOMATIC PC CONNECTION"}</b>
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
            </div>
            <div className="modalActions">
              {!IS_MOBILE_DEVICE && !IS_NATIVE_DESKTOP && <a className="secondaryButton" href={WINDOWS_DOWNLOAD}><Download /> GET WINDOWS APP</a>}
              <button className="secondaryButton" onClick={checkAgent}><RefreshCw /> CHECK CONNECTION</button>
              <button className="secondaryButton" onClick={checkAppUpdate} disabled={checkingUpdate}><RefreshCw /> {checkingUpdate ? "CHECKING..." : "CHECK UPDATES"}</button>
            </div>
            <div className="permission versionRow"><div><b>Installed version</b><small>{APP_VERSION} · {IS_NATIVE_ANDROID ? "Android app" : IS_NATIVE_DESKTOP ? "Windows desktop" : "Web / PWA"}</small></div><span>ULTRON</span></div>
            <button className="revokeAllButton" onClick={revokeAllPermissions}><ShieldCheck /> REVOKE ALL ULTRON ACCESS</button>
            <p className="privacy"><ShieldCheck /> Revoke All stops listening, cancels speech, clears ULTRON's local consent and disconnects the Windows companion. Android, Windows and browser OS permissions cannot be revoked by an app itself; use the device's system settings for those. Each sensitive PC action still asks for confirmation.</p>
          </section>
        </div>
      )}
      <footer>ULTRON PERSONAL AI · VOICE-FIRST WEB APP + WINDOWS PC COMPANION · PERMISSION-FIRST</footer>
    </main>
  );
}
