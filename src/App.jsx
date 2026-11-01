import { useEffect, useRef, useState } from "react";
import UltronStage from "./UltronStage.jsx";
import {
  Activity, AudioLines, Bot, Bell, Bluetooth, ExternalLink, MapPin, Mic, MicOff,
  Monitor, RefreshCw, Send, ShieldCheck, Terminal, Volume2, VolumeX, X,
  Download, Copy, Power, CheckCircle2, AlertTriangle, Smartphone, Globe
} from "lucide-react";

const DEFAULT_AGENT = "http://127.0.0.1:8765";
const CLOUD_API = (import.meta.env.VITE_JARVIS_CLOUD_API_URL || "").replace(/\/$/, "");
// Same-origin download: custom domains automatically use their own host.
const DESKTOP_DOWNLOAD = "/downloads/ULTRON-Desktop.exe";
const IS_MOBILE_DEVICE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
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

export default function App() {
  const [agentUrl, setAgentUrl] = useState(DEFAULT_AGENT);
  const [token, setToken] = useState("");
  // Pairing token is memory-only and is cleared whenever the app is closed.
  const [pairedToken, setPairedToken] = useState("");
  const [agent, setAgent] = useState("offline");
  const [permissions, setPermissions] = useState({ microphone: false, location: false, notifications: false, bluetooth: false });
  const [showPerms, setShowPerms] = useState(false);
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
  const rec = useRef(null);
  const logEnd = useRef(null);
  const listeningRef = useRef(false);
  const armedRef = useRef(false);
  const speechHandlerRef = useRef(null);
  const ackRef = useRef("");
  const restartTimer = useRef(null);

  const setArmState = (value) => {
    armedRef.current = value;
    setArmed(value);
  };
  const setPerm = (key, value) => setPermissions((p) => ({ ...p, [key]: value }));
  const add = (role, text) => setMessages((m) => [...m, { role, text, time: new Date().toLocaleTimeString() }]);

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
      try { window.speechSynthesis?.cancel(); } catch {}
      try { sessionStorage.removeItem("ultron-pairing-key"); } catch {}
      setListening(false);
      setArmState(false);
      setSpeaking(false);
      setPairedToken("");
      setPermissions({ microphone: false, location: false, notifications: false, bluetooth: false });
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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (!standalone) {
      const timer = window.setTimeout(() => {
        try {
          if (sessionStorage.getItem("ultron-install-dismissed") !== "1") setShowInstall(true);
        } catch {
          setShowInstall(true);
        }
      }, 1800);
      return () => window.clearTimeout(timer);
    }
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
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach((track) => track.stop());
      setPerm("microphone", true);
      setError("");
    } catch {
      setError("Microphone permission was not granted.");
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
  const grantBluetooth = async () => {
    try {
      if (!navigator.bluetooth) throw new Error("Web Bluetooth is not supported by this browser.");
      await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      setPerm("bluetooth", true);
    } catch (e) {
      setError(e.message || "Bluetooth permission was not granted.");
    }
  };

  const toggleMic = async () => {
    if (!permissions.microphone) {
      setError("First grant microphone permission in Permissions.");
      setShowPerms(true);
      return;
    }
    if (!rec.current) {
      setError("Speech recognition is not supported in this browser. Use a supported Chrome or Edge version.");
      return;
    }
    if (listening) {
      listeningRef.current = false;
      setListening(false);
      setArmState(false);
      setStatus("STANDBY");
      try { rec.current.stop(); } catch {}
    } else {
      setError("");
      listeningRef.current = true;
      setListening(true);
      setArmState(false);
      setStatus("WAKE WORD ACTIVE");
      try { rec.current.start(); } catch {
        setError("Could not start microphone. Close another app using it and try again.");
        listeningRef.current = false;
        setListening(false);
      }
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
        <div className="state"><i className={agent === "paired" ? "online" : ""} />{IS_MOBILE_DEVICE ? "MOBILE MODE" : statusAgent}</div>
        <div className="actions">
          <button onClick={checkAgent} title="Check companion"><RefreshCw /></button>
          <button onClick={() => setShowPerms(true)} title="Permissions"><ShieldCheck /></button>
        </div>
      </header>

      {showInstall && (
        <section className="installBanner">
          <div className="installIcon"><Download /></div>
          <div className="installCopy">
            <b>{IS_MOBILE_DEVICE ? "Install ULTRON on your phone" : "Install ULTRON on your Windows PC"}</b>
            <span>{IS_MOBILE_DEVICE ? "Add ULTRON to your home screen for quick voice and AI access." : "Install ULTRON as a desktop app. PC control connects to the local companion."}</span>
          </div>
          <button className="primaryButton" onClick={installApp}>{installPrompt ? "INSTALL APP" : "HOW TO INSTALL"}</button>
          {!IS_MOBILE_DEVICE && <a href={DESKTOP_DOWNLOAD} className="subtleLink">PC companion</a>}
          <button className="iconButton" onClick={dismissInstall} aria-label="Dismiss install prompt"><X /></button>
        </section>
      )}
      {installHelp && (
        <div className="veil" onClick={() => setInstallHelp(false)}>
          <section className="modal panel installHelp" onClick={(event) => event.stopPropagation()}>
            <h3>INSTALL ULTRON <button onClick={() => setInstallHelp(false)}><X /></button></h3>
            <p>{IS_MOBILE_DEVICE ? "On Android, open the browser menu and choose “Install app” or “Add to Home screen”. On iPhone, use Share → Add to Home Screen. The installed ULTRON app gives you the mobile-friendly voice and AI interface." : "In Chrome or Edge, open the browser menu and choose “Install ULTRON” or “Apps → Install this site as an app”."}</p>
            {!IS_MOBILE_DEVICE && <p>For Windows PC controls, install the companion below and keep it running. ULTRON will detect and pair with it automatically when this trusted website opens.</p>}
            {!IS_MOBILE_DEVICE && <a className="primaryButton linkButton" href={DESKTOP_DOWNLOAD}><Download /> DOWNLOAD WINDOWS COMPANION</a>}
            <button className="secondaryButton" onClick={() => setInstallHelp(false)}>CLOSE</button>
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
          <div className="heroControls">
            <button className={listening ? "controlActive" : ""} onClick={toggleMic}>
              {listening ? <MicOff /> : <Mic />} {listening ? "STOP LISTENING" : "ACTIVATE VOICE"}
            </button>
            <button onClick={() => {
              const next = !muted;
              setMuted(next);
              if (next && "speechSynthesis" in window) window.speechSynthesis.cancel();
              if (next) setSpeaking(false);
            }}>
              {muted ? <VolumeX /> : <Volume2 />} {muted ? "UNMUTE" : "VOICE OUTPUT"}
            </button>
            <button onClick={() => setShowPerms(true)}><ShieldCheck /> PERMISSIONS</button>
          </div>
          <div className="heroFooter">
            <span>{transcript || (listening ? "Say “Hello Ultron” or “Hey Ultron”" : "Voice interface standing by")}</span>
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

          <section className="hudPanel shortcutsPanel">
            <h3><span>{IS_MOBILE_DEVICE ? "QUICK AI ACTIONS" : "QUICK COMMANDS"}</span><Power /></h3>
            <div className="shortcutGrid">
              {IS_MOBILE_DEVICE ? (
                <>
                  <button onClick={() => sendCommand("Explain artificial intelligence in simple Hindi")}><Bot /><span>Explain<br/>AI</span></button>
                  <button onClick={() => sendCommand("Help me plan my day")}><Activity /><span>Plan<br/>Day</span></button>
                  <button onClick={() => sendCommand("Tell me one interesting science fact")}><Globe /><span>Science<br/>Fact</span></button>
                  <button onClick={() => { setShowPerms(true); }}><ShieldCheck /><span>App<br/>Access</span></button>
                </>
              ) : (
                <>
                  <button onClick={() => sendCommand("show my PC system information")}><Activity /><span>System<br/>Info</span></button>
                  <button onClick={() => sendCommand("open calculator")}><Monitor /><span>Calculator</span></button>
                  <button onClick={() => sendCommand("open YouTube")}><Globe /><span>Open<br/>YouTube</span></button>
                  <button onClick={() => sendCommand("show desktop folders")}><Terminal /><span>Desktop<br/>Files</span></button>
                </>
              )}
            </div>
            {!IS_MOBILE_DEVICE && <a className="downloadLink" href={DESKTOP_DOWNLOAD}><Download /> WINDOWS COMPANION</a>}
            {IS_MOBILE_DEVICE && <p className="mobileHint">MOBILE MODE · Install ULTRON on your home screen for voice and AI access. Windows PC actions run from the ULTRON app on the computer.</p>}
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
            <p className="modalLead">Grant only the permissions you choose. PC control needs the separate Windows companion.</p>
            <div className="permission"><Mic /><div><b>Microphone</b><small>Wake-word detection and voice commands while this app is open</small></div><button onClick={grantMic}>{permissions.microphone ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><MapPin /><div><b>Location</b><small>Only used when you request a location feature</small></div><button onClick={grantLocation}>{permissions.location ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Bell /><div><b>Notifications</b><small>Optional ULTRON alerts</small></div><button onClick={grantNotifications}>{permissions.notifications ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Bluetooth /><div><b>Bluetooth</b><small>Optional browser device chooser where supported</small></div><button onClick={grantBluetooth}>{permissions.bluetooth ? "GRANTED" : "ALLOW"}</button></div>
            {!IS_MOBILE_DEVICE && <div className="permission"><Monitor /><div><b>Windows PC companion</b><small>Runs locally and keeps PC actions on your own computer</small></div><a href={DESKTOP_DOWNLOAD}>DOWNLOAD</a></div>}
            <div className="pair" id="agent-connect">
              <b>{IS_MOBILE_DEVICE ? "WINDOWS PC CONTROL" : "AUTOMATIC PC CONNECTION"}</b>
              <small>{IS_MOBILE_DEVICE ? "PC control is available when ULTRON is opened on the Windows computer with its companion running." : "Keep ULTRON PC Companion running on this computer. The trusted ULTRON website will discover it and pair automatically—no key copy/paste."}</small>
              <div className="pairStatus">
                <i className={agent === "paired" ? "connected" : ""} />
                <span>{agent === "paired" ? "PC CONNECTED" : agent === "disabled" ? "PC ACTIONS DISABLED" : agent === "available" ? "COMPANION FOUND · WAITING FOR TRUSTED PAIR" : "LOOKING FOR WINDOWS COMPANION"}</span>
              </div>
              {!IS_MOBILE_DEVICE && <button onClick={checkAgent}><RefreshCw /> FIND MY PC AUTOMATICALLY</button>}
              {agent === "disabled" && <small className="warningText">Enable approved PC actions inside the Windows companion and restart it.</small>}
              <details className="manualPair">
                <summary>Advanced connection settings</summary>
                <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="http://127.0.0.1:8765" />
                <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Optional manual pairing key" />
                <button disabled={!token.trim()} onClick={connect}>MANUAL CONNECT</button>
              </details>
            </div>
            <div className="modalActions">
              {!IS_MOBILE_DEVICE && <a className="secondaryButton" href={DESKTOP_DOWNLOAD}><Download /> GET WINDOWS APP</a>}
              <button className="secondaryButton" onClick={checkAgent}><RefreshCw /> CHECK CONNECTION</button>
            </div>
            <p className="privacy"><ShieldCheck /> ULTRON resets its own permission switches and pairing session when closed. Browser and Windows permissions may remain saved until you revoke them in browser settings. Every PC action still asks for confirmation.</p>
          </section>
        </div>
      )}
      <footer>ULTRON PERSONAL AI · VOICE-FIRST WEB APP + WINDOWS PC COMPANION · PERMISSION-FIRST</footer>
    </main>
  );
}
