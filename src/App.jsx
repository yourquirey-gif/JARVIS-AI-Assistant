import { useEffect, useRef, useState } from "react";
import {
  Activity, AudioLines, Bot, Bell, Bluetooth, ExternalLink, MapPin, Mic, MicOff,
  Monitor, RefreshCw, Send, ShieldCheck, Terminal, Volume2, VolumeX, X,
  Download, Copy, Power, CheckCircle2, AlertTriangle, Smartphone, Globe
} from "lucide-react";

const DEFAULT_AGENT = "http://127.0.0.1:8765";
const CLOUD_API = (import.meta.env.VITE_JARVIS_CLOUD_API_URL || "").replace(/\/$/, "");
const DESKTOP_RELEASE = "https://github.com/yourquirey-gif/JARVIS-AI-Assistant/releases/download/ultron-latest/ULTRON-Desktop.exe";
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
  const [pairedToken, setPairedToken] = useState(() => {
    try { return sessionStorage.getItem("ultron-pairing-key") || ""; } catch { return ""; }
  });
  const [agent, setAgent] = useState("offline");
  const [permissions, setPermissions] = useState({ microphone: false, location: false, notifications: false, bluetooth: false });
  const [showPerms, setShowPerms] = useState(false);
  const [listening, setListening] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("STANDBY");
  const [messages, setMessages] = useState([{ role: "assistant", text: "ULTRON online. Say “Hello Ultron” or “Hey Ultron” to get my attention." }]);
  const [input, setInput] = useState("");
  const [transcript, setTranscript] = useState("");
  const [lang, setLang] = useState("en-IN");
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [location, setLocation] = useState("Not shared");
  const [system, setSystem] = useState(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const rec = useRef(null);
  const stream = useRef(null);
  const audioCtx = useRef(null);
  const raf = useRef(null);
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
    if (muted || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 0.72;
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
    try {
      const response = await fetch(agentUrl.replace(/\/$/, "") + "/api/health", {
        mode: "cors",
        targetAddressSpace: "loopback"
      });
      if (!response.ok) throw new Error("Companion unavailable");
      const data = await response.json();
      setAgent("available");
      setAutomationEnabled(Boolean(data.automation_enabled));
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
      try { sessionStorage.setItem("ultron-pairing-key", token); } catch {}
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
  }, [agentUrl]);

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

  useEffect(() => {
    let alive = true;
    let source = null;
    async function meter() {
      if (!listening) return;
      try {
        const audioStream = stream.current || await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive) {
          audioStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = audioStream;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioCtx.current || new AudioContextClass();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source = context.createMediaStreamSource(audioStream);
        source.connect(analyser);
        audioCtx.current = context;
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!alive) return;
          analyser.getByteTimeDomainData(buffer);
          const power = buffer.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / buffer.length;
          setLevel(Math.min(1, Math.sqrt(power) * 2.6));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Please allow microphone access in browser settings.");
        listeningRef.current = false;
        setListening(false);
      }
    }
    meter();
    return () => {
      alive = false;
      if (raf.current) cancelAnimationFrame(raf.current);
      if (source) {
        try { source.disconnect(); } catch {}
      }
      if (!listening) setLevel(0);
    };
  }, [listening]);

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
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        stream.current = null;
      }
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
        <div className="state"><i className={agent === "paired" ? "online" : ""} />{statusAgent}</div>
        <div className="actions">
          <button onClick={checkAgent} title="Check companion"><RefreshCw /></button>
          <button onClick={() => setShowPerms(true)} title="Permissions"><ShieldCheck /></button>
        </div>
      </header>

      {showInstall && (
        <section className="installBanner">
          <div className="installIcon"><Download /></div>
          <div className="installCopy">
            <b>Install ULTRON on this device</b>
            <span>Add the app to your desktop for a cleaner, app-like experience. PC control needs the separate desktop companion.</span>
          </div>
          <button className="primaryButton" onClick={installApp}>{installPrompt ? "INSTALL APP" : "HOW TO INSTALL"}</button>
          <a href={DESKTOP_RELEASE} className="subtleLink" target="_blank" rel="noreferrer">PC companion</a>
          <button className="iconButton" onClick={dismissInstall} aria-label="Dismiss install prompt"><X /></button>
        </section>
      )}
      {installHelp && (
        <div className="veil" onClick={() => setInstallHelp(false)}>
          <section className="modal panel installHelp" onClick={(event) => event.stopPropagation()}>
            <h3>INSTALL ULTRON <button onClick={() => setInstallHelp(false)}><X /></button></h3>
            <p>In Chrome or Edge, open the browser menu and choose “Install ULTRON” or “Apps → Install this site as an app”. The option appears only in browsers that support PWA installation.</p>
            <p>For local computer controls, also install the Windows PC companion from the button below, run it, and pair it from Permissions.</p>
            <a className="primaryButton linkButton" href={DESKTOP_RELEASE} target="_blank" rel="noreferrer"><Download /> DOWNLOAD WINDOWS COMPANION</a>
            <button className="secondaryButton" onClick={() => setInstallHelp(false)}>CLOSE</button>
          </section>
        </div>
      )}

      <section className="grid">
        <aside className="panel left">
          <h3>CORE SYSTEMS <Activity /></h3>
          {[
            ["LOCAL COMPANION", statusAgent],
            ["MICROPHONE", permissions.microphone ? "GRANTED" : "NOT GRANTED"],
            ["PC ACTIONS", automationEnabled ? "ENABLED · APPROVAL REQUIRED" : "NOT ENABLED"],
            ["VOICE PROFILE", "DEEP MALE PREFERRED"]
          ].map((item) => (
            <div className="sys" key={item[0]}>
              <span className="sysIcon"><Bot /></span>
              <div><b>{item[0]}</b><small>{item[1]}</small></div>
              <i className={item[0] === "PC ACTIONS" && automationEnabled ? "goodDot" : ""} />
            </div>
          ))}
          <hr />
          <h3>PC COMPANION <Monitor /></h3>
          <p className="sideText">Install the Windows companion to connect this website to your own PC.</p>
          <a className="downloadLink" href={DESKTOP_RELEASE} target="_blank" rel="noreferrer"><Download /> DOWNLOAD ULTRON FOR WINDOWS</a>
          <p className="safe"><ShieldCheck /> Every local PC action is shown for approval before it runs. ULTRON never runs arbitrary shell commands.</p>
        </aside>

        <section className="center">
          <div className="orbHead"><span>VOICE INTERFACE</span><b>{listening ? (armed ? "● ULTRON ACTIVATED" : "◉ SAY HELLO ULTRON") : busy ? "◌ THINKING" : "○ STANDBY"}</b></div>
          <button className={"orb " + (listening ? "listening" : "")} onClick={toggleMic} style={{ "--scale": 1 + level * 0.2, "--orb": "#5ee7ff" }}>
            <span className="ring one" /><span className="ring two" />
            <span className="orbCore"><AudioLines /><small>{listening ? (armed ? "I'M LISTENING" : "HELLO ULTRON") : busy ? "PROCESSING" : "ULTRON"}</small></span>
          </button>
          <p className="hint">{listening ? (armed ? "Go ahead, sir. Give your command." : "Wake-word mode is active. Say “Hello Ultron” or “Hey Ultron”.") : "Grant microphone permission, then start wake-word mode."}</p>
          <div className="transcript">{transcript || "Wake phrase and recognized speech will appear here."}</div>
          <div className="micActions">
            <button onClick={toggleMic}>{listening ? <MicOff /> : <Mic />}{listening ? "STOP LISTENING" : "START WAKE WORD"}</button>
            <button onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX /> : <Volume2 />}{muted ? "UNMUTE" : "VOICE ON"}</button>
            <button onClick={() => setShowPerms(true)}><ShieldCheck /> PERMISSIONS</button>
          </div>
          <div className="voiceMeta"><span>VOICE: MASCULINE / LOW PITCH PREFERRED</span><select value={lang} onChange={(event) => setLang(event.target.value)}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="en-US">English (US)</option></select></div>
          {error && <p className="error"><AlertTriangle /> {error}</p>}
        </section>

        <aside className="panel right">
          <h3>LIVE TELEMETRY <Activity /></h3>
          <div className="metric"><small>ASSISTANT STATE</small><b>{status}</b><div className="bar"><i style={{ width: busy ? "80%" : listening ? "58%" : "14%" }} /></div></div>
          <div className="metric"><small>LOCAL MACHINE</small><b>{system?.platform || (agent === "paired" ? "Connected" : "Not paired")}</b><small>{system ? ("CPU: " + system.cpu_percent + "% · RAM: " + system.memory_percent + "% · Battery: " + (system.battery?.percent ?? "N/A") + "%") : "System data appears after a PC status request."}</small></div>
          <div className="metric"><small>VOICE ACTIVITY</small><div className="bars">{Array.from({ length: 20 }, (_, index) => <i key={index} style={{ height: (4 + (listening ? (Math.sin(index * 0.9 + level * 14) + 1) * 9 + level * 20 : 3)) + "px" }} />)}</div></div>
          <div className="metric"><small>SHARED LOCATION</small><b>{permissions.location ? location : "Not shared"}</b><button className="test" onClick={grantLocation}>Request location</button></div>
          <div className="metric"><small>PAIRING STATUS</small><b>{pairedToken ? "SESSION PAIRED" : "NOT PAIRED"}</b><button className="test" onClick={() => setShowPerms(true)}>Open setup</button></div>
        </aside>
      </section>

      <section className="console panel">
        <h3><Terminal /> ULTRON CONVERSATION LOG <small>LIVE SESSION</small></h3>
        <div className="log">
          {messages.map((message, index) => (
            <div className={"msg " + message.role} key={index}>
              <b>{message.role.toUpperCase()}</b><span>{message.text}</span><small>{message.time || ""}</small>
            </div>
          ))}
          <div ref={logEnd} />
        </div>
        {pending && (
          <div className="approval">
            <ShieldCheck />
            <div><b>ULTRON NEEDS YOUR APPROVAL</b><span>{pending.description}</span><small>Action: {pending.name}</small></div>
            <button disabled={busy || !automationEnabled} onClick={approveAction}>ALLOW</button>
            <button className="deny" onClick={denyAction}>DENY</button>
          </div>
        )}
        <form onSubmit={(event) => { event.preventDefault(); sendCommand(input); }}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Talk to ULTRON or type a command…" />
          <button disabled={!input.trim() || busy}><Send /> SEND</button>
        </form>
      </section>

      {showPerms && (
        <div className="veil" onClick={() => setShowPerms(false)}>
          <section className="modal panel" onClick={(event) => event.stopPropagation()}>
            <h3>PERMISSION CENTER <button onClick={() => setShowPerms(false)}><X /></button></h3>
            <p className="modalLead">Grant only the permissions you choose. PC control needs the separate Windows companion.</p>
            <div className="permission"><Mic /><div><b>Microphone</b><small>Wake-word detection and voice commands while this app is open</small></div><button onClick={grantMic}>{permissions.microphone ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><MapPin /><div><b>Location</b><small>Only used when you request a location feature</small></div><button onClick={grantLocation}>{permissions.location ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Bell /><div><b>Notifications</b><small>Optional ULTRON alerts</small></div><button onClick={grantNotifications}>{permissions.notifications ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Bluetooth /><div><b>Bluetooth</b><small>Optional browser device chooser where supported</small></div><button onClick={grantBluetooth}>{permissions.bluetooth ? "GRANTED" : "ALLOW"}</button></div>
            <div className="permission"><Monitor /><div><b>Windows PC companion</b><small>Runs locally and keeps PC actions on your own computer</small></div><a href={DESKTOP_RELEASE} target="_blank" rel="noreferrer">DOWNLOAD</a></div>
            <div className="pair" id="agent-connect">
              <b>PAIR YOUR WINDOWS PC</b>
              <small>1. Run ULTRON PC Companion. 2. Enable PC actions and press Copy key. 3. Paste the key below.</small>
              <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} placeholder="http://127.0.0.1:8765" />
              <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste private pairing key from desktop app" />
              <button disabled={!token.trim()} onClick={connect}>CONNECT LOCAL COMPANION</button>
              {pairedToken && <small>Paired for this browser session. The companion must remain running.</small>}
              {agent === "disabled" && <small className="warningText">PC actions are disabled in the desktop companion. Enable them there and restart it.</small>}
            </div>
            <div className="modalActions">
              <a className="secondaryButton" href={DESKTOP_RELEASE} target="_blank" rel="noreferrer"><Download /> GET WINDOWS APP</a>
              <button className="secondaryButton" onClick={checkAgent}><RefreshCw /> CHECK COMPANION</button>
            </div>
            <p className="privacy"><ShieldCheck /> Each PC action asks for confirmation. Browser permissions never grant unrestricted Windows access.</p>
          </section>
        </div>
      )}
      <footer>ULTRON PERSONAL AI · VOICE-FIRST WEB APP + WINDOWS PC COMPANION · PERMISSION-FIRST</footer>
    </main>
  );
}
