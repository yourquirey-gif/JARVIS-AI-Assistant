import { useEffect, useRef } from "react";

const WIDTH = 520;
const HEIGHT = 610;

function makeBlobPath(ctx, cx, cy, rx, ry, time, energy) {
  ctx.beginPath();
  const steps = 112;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const ripple =
      Math.sin(angle * 3 + time * 0.9) * 0.026 +
      Math.sin(angle * 5 - time * 1.25) * 0.018 +
      Math.sin(angle * 2 + time * 0.55) * 0.012 +
      Math.sin(angle * 4 + time * 5.2) * energy * 0.035;
    const x = cx + Math.cos(angle) * rx * (1 + ripple);
    const y = cy + Math.sin(angle) * ry * (1 + ripple * 0.82);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawWave(ctx, cx, cy, width, baseY, amplitude, time, speed, color, fillColor) {
  ctx.beginPath();
  const left = cx - width / 2;
  const right = cx + width / 2;
  for (let x = left; x <= right; x += 4) {
    const progress = (x - left) / width;
    const y =
      baseY +
      Math.sin(progress * Math.PI * 3.1 + time * speed) * amplitude +
      Math.sin(progress * Math.PI * 6.4 - time * speed * 0.62) * amplitude * 0.28;
    if (x === left) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(right, HEIGHT);
  ctx.lineTo(left, HEIGHT);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, baseY - amplitude, 0, HEIGHT);
  gradient.addColorStop(0, fillColor);
  gradient.addColorStop(1, "rgba(7,23,52,0.02)");
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  for (let x = left; x <= right; x += 4) {
    const progress = (x - left) / width;
    const y =
      baseY +
      Math.sin(progress * Math.PI * 3.1 + time * speed) * amplitude +
      Math.sin(progress * Math.PI * 6.4 - time * speed * 0.62) * amplitude * 0.28;
    if (x === left) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawGlassBlob(ctx, time, energy, state) {
  const cx = WIDTH / 2;
  const cy = 264;
  const rx = 145 + energy * 8;
  const ry = 166 + energy * 7;
  const accent = state === "speaking" ? "#7eeaff" : state === "listening" ? "#6df5d0" : state === "thinking" ? "#a69aff" : "#6ebeff";
  const accentRgb = state === "speaking" ? "91,220,255" : state === "listening" ? "88,245,207" : state === "thinking" ? "153,132,255" : "70,165,255";

  // Soft holographic aura and the floating orbital glass rings.
  const aura = ctx.createRadialGradient(cx, cy, 20, cx, cy, 245);
  aura.addColorStop(0, `rgba(${accentRgb},0.22)`);
  aura.addColorStop(0.54, `rgba(${accentRgb},0.09)`);
  aura.addColorStop(1, "rgba(13,31,67,0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.translate(cx, cy + 127);
  ctx.rotate(-0.08 + Math.sin(time * 0.24) * 0.025);
  ctx.scale(1, 0.28);
  ctx.beginPath();
  ctx.ellipse(0, 0, 190 + energy * 8, 66 + energy * 4, 0, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${accentRgb},0.52)`;
  ctx.lineWidth = 2;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, 158, 51, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(174,132,255,0.38)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // The blob itself is continuously morphing, like a liquid glass orb.
  makeBlobPath(ctx, cx, cy, rx, ry, time, energy);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 38 + energy * 30;
  const glass = ctx.createRadialGradient(cx - 64, cy - 92, 12, cx + 14, cy + 25, 218);
  glass.addColorStop(0, "rgba(229,251,255,0.72)");
  glass.addColorStop(0.16, "rgba(160,225,255,0.39)");
  glass.addColorStop(0.48, `rgba(${accentRgb},0.19)`);
  glass.addColorStop(0.76, "rgba(49,89,170,0.17)");
  glass.addColorStop(1, "rgba(12,27,62,0.38)");
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.restore();

  // Inner moving liquid waves stay clipped inside the glass shell.
  ctx.save();
  makeBlobPath(ctx, cx, cy, rx, ry, time, energy);
  ctx.clip();
  const innerGlow = ctx.createRadialGradient(cx - 25, cy - 44, 4, cx, cy + 10, 190);
  innerGlow.addColorStop(0, "rgba(255,255,255,0.24)");
  innerGlow.addColorStop(0.5, `rgba(${accentRgb},0.13)`);
  innerGlow.addColorStop(1, "rgba(11,24,58,0.2)");
  ctx.fillStyle = innerGlow;
  ctx.fillRect(cx - rx - 15, cy - ry - 15, (rx + 15) * 2, (ry + 15) * 2);

  const waveBoost = energy * 1.75;
  drawWave(ctx, cx, cy, 360, cy + 47, 11 + waveBoost * 13, time, 1.5, "rgba(178,246,255,0.9)", "rgba(77,191,255,0.23)");
  drawWave(ctx, cx, cy, 360, cy + 75, 8 + waveBoost * 10, -time * 0.72, -1.05, "rgba(151,160,255,0.8)", "rgba(121,112,255,0.19)");
  drawWave(ctx, cx, cy, 360, cy + 103, 6 + waveBoost * 8, time * 0.56, 1.25, "rgba(126,242,238,0.68)", "rgba(45,208,211,0.14)");

  // Tiny suspended bubbles make the material feel deep and glass-like.
  for (let i = 0; i < 9; i += 1) {
    const bx = cx + Math.sin(time * 0.65 + i * 1.9) * (48 + (i % 3) * 23);
    const by = cy + 76 - ((time * (8 + (i % 4) * 2) + i * 37) % 176);
    const radius = 2 + (i % 3) * 1.2;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(225,250,255,0.7)";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 9;
    ctx.fill();
  }
  ctx.restore();

  // Bright glass rim and curved reflections.
  makeBlobPath(ctx, cx, cy, rx, ry, time, energy);
  ctx.strokeStyle = "rgba(192,239,255,0.82)";
  ctx.lineWidth = 2.2;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 19;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx - 52, cy - 49, 69, 104, -0.42, Math.PI * 1.08, Math.PI * 1.72);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.shadowColor = "#c9f6ff";
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + 72, cy + 18, 43, 94, 0.38, -0.82, 0.85);
  ctx.strokeStyle = "rgba(125,211,255,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Moving orbital sparks around the blob.
  for (let i = 0; i < 7; i += 1) {
    const angle = time * (0.22 + i * 0.012) + i * ((Math.PI * 2) / 7);
    const px = cx + Math.cos(angle) * (190 + (i % 2) * 9);
    const py = cy + Math.sin(angle) * (205 + (i % 2) * 8);
    ctx.beginPath();
    ctx.arc(px, py, i % 3 === 0 ? 3 : 1.8, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? accent : "#d5f8ff";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export default function UltronStage({
  speaking = false,
  listening = false,
  thinking = false,
  speechTick = 0,
  quality = "auto",
  onQualityChange,
  onMicClick
}) {
  const canvasRef = useRef(null);
  const speakingRef = useRef(speaking);
  const listeningRef = useRef(listening);
  const thinkingRef = useRef(thinking);
  const speechTickRef = useRef(speechTick);
  const speechPulseRef = useRef(0);
  speakingRef.current = speaking;
  listeningRef.current = listening;
  thinkingRef.current = thinking;
  if (speechTick !== speechTickRef.current) {
    speechTickRef.current = speechTick;
    speechPulseRef.current = 1;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === "undefined") return undefined;
    const ctx = canvas.getContext && canvas.getContext("2d", { alpha: true });
    if (!ctx) return undefined;

    let frame = 0;
    let lastDraw = 0;
    let running = true;
    let observer = null;
    let width = WIDTH;
    let height = HEIGHT;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
    const cores = navigator.hardwareConcurrency || 2;
    const memory = navigator.deviceMemory || 2;
    const lowPower = quality === "low" || (quality === "auto" && (cores <= 2 || memory <= 2));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(260, rect.width || WIDTH);
      height = Math.max(360, rect.height || HEIGHT);
      const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.35);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform((width / WIDTH) * dpr, 0, 0, (height / HEIGHT) * dpr, 0, 0);
    };
    resize();

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    const animate = (now) => {
      if (!running) return;
      frame = window.requestAnimationFrame(animate);
      const interval = reducedMotion ? 180 : lowPower ? 48 : 30;
      if (now - lastDraw < interval) return;
      lastDraw = now;

      const time = reducedMotion ? 0 : now / 1000;
      const isSpeaking = speakingRef.current;
      const isListening = listeningRef.current;
      const isThinking = thinkingRef.current;
      const state = isSpeaking ? "speaking" : isListening ? "listening" : isThinking ? "thinking" : "idle";
      const beat = speechPulseRef.current;
      const breath = reducedMotion ? 0 : (Math.sin(time * 1.1) + 1) * 0.5;
      const voiceMotion = isSpeaking ? 0.2 + Math.abs(Math.sin(time * 5.7)) * 0.23 + beat * 0.5 : 0;
      const energy = Math.min(1, 0.035 + breath * 0.055 + voiceMotion + (isListening ? 0.09 : 0) + (isThinking ? 0.08 : 0));

      if (!reducedMotion) speechPulseRef.current *= 0.88;
      else speechPulseRef.current = 0;

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawGlassBlob(ctx, time, energy, state);

      // A subtle signal ring responds to the current voice state.
      ctx.save();
      ctx.translate(WIDTH / 2, 489);
      ctx.scale(1, 0.3);
      ctx.beginPath();
      ctx.ellipse(0, 0, 125 + energy * 18, 30 + energy * 5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = isSpeaking ? "rgba(116,226,255,0.68)" : isListening ? "rgba(104,245,206,0.58)" : "rgba(83,164,255,0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Fine scan particles rise softly around the hologram.
      if (!reducedMotion) {
        for (let i = 0; i < 15; i += 1) {
          const x = 58 + ((i * 37 + Math.sin(time * 0.55 + i) * 17) % 404);
          const y = 55 + ((i * 71 - time * 14 + 720) % 500);
          ctx.fillStyle = i % 4 === 0 ? "rgba(255,125,151,0.42)" : "rgba(115,212,255,0.38)";
          ctx.fillRect(x, y, 1.4, 2.8);
        }
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", resize);
    };
  }, [quality]);

  const status = speaking ? "VOICE OUTPUT · WAVES ACTIVE" : listening ? "VOICE INPUT · LISTENING" : thinking ? "NEURAL PROCESSING" : "AWAITING COMMAND";

  return (
    <div
      className={"ultronVisual glassMode " + (speaking ? "isSpeaking " : "") + (listening ? "isListening" : "")}
      onClick={onMicClick}
      role="button"
      tabIndex={0}
      aria-label="Toggle ULTRON voice listening"
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onMicClick) {
          event.preventDefault();
          onMicClick();
        }
      }}
    >
      <div className="avatarAura" />
      <canvas ref={canvasRef} className="ultronGlassCanvas" aria-label="Animated glass wave hologram" />
      <div className="visualName">ULTRON</div>
      <div className="visualStatus">{status}</div>
      <div className="qualityPill" title="Auto mode adjusts animation detail for this device">
        <span className={quality === "low" ? "lowDot" : "highDot"} />
        {(quality === "auto" ? "AUTO" : quality).toUpperCase()} WAVE RENDER
      </div>
    </div>
  );
}
