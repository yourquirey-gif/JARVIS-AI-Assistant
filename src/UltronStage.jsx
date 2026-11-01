import { useEffect, useRef, useState } from "react";

/*
 * Lightweight ULTRON hologram renderer.
 * Canvas 2D keeps the avatar usable on older Windows 7-era browsers/GPUs:
 * no WebGL, shader compilation, or large 3D model download is required.
 */
const W = 520;
const H = 690;

function rounded(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function polygon(ctx, points, fill, stroke, width) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
}

function metal(ctx, x, y, w, h, dark) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  if (dark) {
    g.addColorStop(0, "#101b2b");
    g.addColorStop(0.2, "#64798d");
    g.addColorStop(0.42, "#18283d");
    g.addColorStop(0.68, "#91a8b8");
    g.addColorStop(1, "#101a2a");
  } else {
    g.addColorStop(0, "#f0f7ff");
    g.addColorStop(0.14, "#8299ac");
    g.addColorStop(0.3, "#d8e4ef");
    g.addColorStop(0.52, "#425a70");
    g.addColorStop(0.74, "#c3d1de");
    g.addColorStop(1, "#526b81");
  }
  return g;
}

function glow(ctx, x, y, radius, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

function drawArm(ctx, side, time, talking, detail) {
  const sign = side;
  const gesture = talking ? Math.sin(time * 5.4 + (side < 0 ? 0 : 1.2)) * 0.16 : Math.sin(time * 1.2 + side) * 0.035;
  ctx.save();
  ctx.translate(sign < 0 ? 156 : 364, 314);
  ctx.rotate((sign < 0 ? -0.2 : 0.2) + gesture);
  ctx.scale(sign < 0 ? 1 : -1, 1);

  // Shoulder joint and angular shoulder shell.
  ctx.fillStyle = "#101e31";
  ctx.beginPath(); ctx.arc(0, 18, 38, 0, Math.PI * 2); ctx.fill();
  polygon(ctx, [[-32, 4], [-22, -20], [8, -34], [34, -14], [41, 23], [19, 48], [-24, 40]], metal(ctx, -32, -34, 75, 84), "#d3e4ef", 2);
  polygon(ctx, [[-21, 2], [-4, -18], [22, -8], [28, 19], [4, 34], [-19, 23]], "#263c53", "#8da9bd", 1);
  ctx.fillStyle = "#f05252";
  ctx.fillRect(2, 1, 14, 3);
  ctx.fillStyle = "#17263a";
  ctx.beginPath(); ctx.arc(0, 18, 15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 18, 7, 0, Math.PI * 2); ctx.fillStyle = "#86a3ba"; ctx.fill();

  // Upper arm armour.
  ctx.save();
  ctx.translate(3, 36);
  ctx.rotate(-0.13 + gesture * 0.45);
  polygon(ctx, [[-23, 0], [22, -2], [31, 57], [19, 93], [-17, 88], [-31, 42]], metal(ctx, -30, 0, 65, 95, true), "#a6c2d6", 1.7);
  polygon(ctx, [[-18, 12], [14, 7], [23, 52], [4, 73], [-18, 53]], "#354e66", "#90aabc", 1);
  if (detail) {
    ctx.strokeStyle = "rgba(224,240,255,.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-15, 18); ctx.lineTo(-2, 54); ctx.lineTo(15, 64); ctx.stroke();
    ctx.fillStyle = "#e35d63"; ctx.fillRect(-5, 29, 9, 3);
  }
  ctx.restore();

  // Elbow and forearm.
  ctx.save();
  ctx.translate(5 + gesture * 18, 122);
  ctx.rotate(0.1 + gesture * 0.8);
  ctx.fillStyle = "#17283b"; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#a2bed1"; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = "#637d91"; ctx.fill();
  polygon(ctx, [[-24, 10], [18, 4], [32, 67], [18, 117], [-17, 112], [-32, 58]], metal(ctx, -28, 5, 62, 110), "#cadbe8", 2);
  polygon(ctx, [[-17, 24], [10, 18], [20, 62], [7, 93], [-18, 83]], "#253b52", "#8da8bc", 1);
  ctx.strokeStyle = "#e4eff8"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-10, 32); ctx.lineTo(8, 55); ctx.lineTo(9, 83); ctx.stroke();

  // Wrist cuff.
  rounded(ctx, -19, 105, 40, 17, 5);
  ctx.fillStyle = "#b6cbd9"; ctx.fill();
  ctx.strokeStyle = "#526c83"; ctx.lineWidth = 2; ctx.stroke();

  // Five-piece mechanical hand. Fingers flex with the speech gesture.
  ctx.save();
  ctx.translate(1, 119);
  ctx.rotate(gesture * 0.6);
  polygon(ctx, [[-17, 3], [15, 0], [22, 26], [13, 43], [-13, 40], [-22, 19]], metal(ctx, -20, 0, 44, 44, true), "#bbd0df", 1.5);
  for (let finger = 0; finger < 4; finger += 1) {
    const fx = -15 + finger * 9;
    const curl = talking ? Math.sin(time * 5 + finger * 0.8 + side) * 3 : 0;
    rounded(ctx, fx, 31, 7, 26 + curl, 3);
    ctx.fillStyle = metal(ctx, fx, 31, 7, 28, false); ctx.fill();
    ctx.strokeStyle = "#94adbf"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#293e54"; ctx.fillRect(fx + 1, 43, 5, 2);
  }
  ctx.save();
  ctx.translate(-18, 12); ctx.rotate(-0.7 + gesture);
  rounded(ctx, -4, 0, 8, 27, 3); ctx.fillStyle = metal(ctx, -4, 0, 8, 27); ctx.fill(); ctx.strokeStyle = "#a9c1d2"; ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

function drawRobot(ctx, time, speaking, listening, detail, beat) {
  const idle = Math.sin(time * 1.25) * 2;
  const jaw = speaking ? 0.5 + 0.5 * Math.sin(time * 12 + beat * 0.55) : 0.035 + Math.sin(time * 2) * 0.018;
  const open = Math.max(0, jaw) * (speaking ? 14 : 1.5);
  const eyePulse = 0.68 + 0.27 * Math.sin(time * (speaking ? 9 : 2.4));

  // Atmospheric light behind the machine.
  glow(ctx, 260, 325, 245, "rgba(26,105,185,.45)", 0.8);
  glow(ctx, 258, 168, 120, "rgba(75,30,255,.22)", 0.9);
  const beam = ctx.createLinearGradient(0, 250, 0, 675);
  beam.addColorStop(0, "rgba(66,156,255,.05)");
  beam.addColorStop(0.65, "rgba(65,183,255,.12)");
  beam.addColorStop(1, "rgba(65,183,255,0)");
  ctx.fillStyle = beam; ctx.fillRect(110, 245, 300, 440);

  // Hologram particles, reduced in Low mode.
  const count = detail ? 42 : 12;
  for (let i = 0; i < count; i += 1) {
    const x = 48 + ((i * 83 + Math.sin(time * 0.7 + i) * 15) % 424);
    const y = 70 + ((i * 137 + time * (detail ? 8 : 4)) % 555);
    ctx.globalAlpha = 0.18 + ((i % 4) * 0.1);
    ctx.fillStyle = i % 3 === 0 ? "#e34e58" : "#68cfff";
    ctx.fillRect(x, y, detail ? 2 : 1.5, detail ? 4 : 2.5);
  }
  ctx.globalAlpha = 1;

  // Rear shoulders and arms.
  drawArm(ctx, -1, time, speaking, detail);
  drawArm(ctx, 1, time, speaking, detail);

  // Torso and neck.
  ctx.save();
  ctx.translate(0, idle);
  polygon(ctx, [[174, 330], [205, 290], [315, 290], [348, 330], [397, 375], [420, 600], [365, 658], [155, 658], [100, 600], [123, 375]], metal(ctx, 100, 290, 320, 360, true), "#87abc4", 2);
  polygon(ctx, [[192, 317], [225, 300], [295, 300], [328, 317], [356, 405], [329, 510], [191, 510], [164, 405]], "#243b53", "#bacddd", 2);
  ctx.fillStyle = "#0b1727";
  polygon(ctx, [[215, 305], [305, 305], [323, 373], [295, 435], [225, 435], [197, 373]], "#0b1b2c", "#6a8499", 1.5);
  // Chest plates.
  polygon(ctx, [[160, 384], [207, 351], [235, 438], [221, 522], [157, 500], [137, 433]], metal(ctx, 137, 351, 100, 180), "#c2d6e4", 1.5);
  polygon(ctx, [[360, 384], [313, 351], [285, 438], [299, 522], [363, 500], [383, 433]], metal(ctx, 285, 351, 100, 180), "#c2d6e4", 1.5);
  polygon(ctx, [[219, 445], [301, 445], [316, 545], [260, 579], [204, 545]], metal(ctx, 204, 445, 112, 134, true), "#9db6ca", 2);
  // Sternum power channel, cyan holographic not reactor branding.
  rounded(ctx, 251, 463, 18, 90, 8);
  const core = ctx.createLinearGradient(251, 463, 269, 553);
  core.addColorStop(0, "#b6f7ff"); core.addColorStop(0.45, "#318fd6"); core.addColorStop(1, "#0a315c");
  ctx.fillStyle = core; ctx.fill();
  glow(ctx, 260, 500, 40, "rgba(57,180,255,.4)", 0.8);
  if (detail) {
    ctx.strokeStyle = "rgba(225,242,255,.5)"; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(160 + i * 8, 404); ctx.lineTo(184 + i * 6, 482); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(360 - i * 8, 404); ctx.lineTo(336 - i * 6, 482); ctx.stroke();
    }
    ctx.fillStyle = "#e34e58";
    ctx.fillRect(177, 535, 12, 3); ctx.fillRect(331, 535, 12, 3);
  }
  ctx.restore();

  // Head tilt, animated only very slightly.
  ctx.save();
  ctx.translate(260, 202);
  ctx.rotate(Math.sin(time * 0.62) * 0.018 + (speaking ? Math.sin(time * 2.1) * 0.009 : 0));
  ctx.translate(-260, -202);

  // Neck pistons and collar.
  polygon(ctx, [[224, 256], [296, 256], [309, 320], [284, 348], [236, 348], [211, 320]], metal(ctx, 211, 256, 98, 92, true), "#b9ccdc", 2);
  rounded(ctx, 228, 264, 12, 60, 4); ctx.fillStyle = "#c2d4e0"; ctx.fill();
  rounded(ctx, 280, 264, 12, 60, 4); ctx.fillStyle = "#c2d4e0"; ctx.fill();
  ctx.strokeStyle = "#718ba1"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(241, 270); ctx.lineTo(241, 331); ctx.moveTo(279, 270); ctx.lineTo(279, 331); ctx.stroke();

  // Cranium silhouette: angular and unmistakably robotic, with chrome planes.
  polygon(ctx, [[260, 58], [301, 69], [334, 112], [329, 173], [315, 229], [286, 270], [260, 279], [234, 270], [205, 229], [191, 173], [186, 112], [219, 69]], metal(ctx, 186, 58, 148, 221), "#d8e6f1", 2.5);
  polygon(ctx, [[260, 67], [294, 75], [313, 111], [302, 145], [260, 130], [218, 145], [207, 111], [226, 75]], "#283d55", "#9cb5c8", 1.5);
  polygon(ctx, [[260, 68], [287, 78], [260, 119], [233, 78]], metal(ctx, 232, 70, 56, 58), "#e4eff7", 1.2);
  // Forehead centre blade.
  polygon(ctx, [[259, 91], [271, 105], [260, 150], [249, 105]], "#15283e", "#b2c6d7", 1.5);
  ctx.strokeStyle = "#dceaf4"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(260, 93); ctx.lineTo(260, 143); ctx.stroke();

  // Side temple armour and audio/vent gills.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(260, 0); ctx.scale(side, 1); ctx.translate(-260, 0);
    polygon(ctx, [[190, 125], [211, 130], [218, 196], [205, 235], [183, 215], [178, 164]], metal(ctx, 178, 125, 40, 110, true), "#a8c1d2", 1.5);
    rounded(ctx, 188, 176, 15, 5, 2); ctx.fillStyle = "#0b1727"; ctx.fill();
    rounded(ctx, 188, 187, 15, 5, 2); ctx.fillStyle = "#0b1727"; ctx.fill();
    rounded(ctx, 188, 198, 15, 5, 2); ctx.fillStyle = "#0b1727"; ctx.fill();
    polygon(ctx, [[202, 148], [218, 158], [213, 187], [200, 179]], "#657e92", "#d0dfea", 1);
    ctx.restore();
  }

  // Eye sockets and red optic beams.
  for (const side of [-1, 1]) {
    const ex = side < 0 ? 224 : 296;
    glow(ctx, ex, 169, 34, "rgba(255,34,49,.75)", eyePulse);
    polygon(ctx, side < 0
      ? [[198, 156], [242, 149], [251, 170], [230, 183], [201, 174]]
      : [[322, 156], [278, 149], [269, 170], [290, 183], [319, 174]],
      "#101928", "#9cb3c7", 1.5);
    ctx.save();
    ctx.shadowColor = "#ff293e"; ctx.shadowBlur = detail ? 18 : 8;
    polygon(ctx, side < 0
      ? [[205, 164], [239, 158], [244, 169], [229, 174], [205, 171]]
      : [[315, 164], [281, 158], [276, 169], [291, 174], [315, 171]],
      "#ff3a48", "#ff9ba0", 1);
    ctx.restore();
  }

  // Nose bridge and cheek blades.
  polygon(ctx, [[260, 164], [276, 188], [267, 217], [260, 224], [253, 217], [244, 188]], metal(ctx, 244, 164, 32, 60, true), "#c7d7e3", 1.3);
  polygon(ctx, [[203, 185], [236, 187], [248, 219], [225, 241], [201, 223]], metal(ctx, 201, 185, 47, 60), "#c3d5e1", 1.2);
  polygon(ctx, [[317, 185], [284, 187], [272, 219], [295, 241], [319, 223]], metal(ctx, 272, 185, 47, 60), "#c3d5e1", 1.2);

  // Mouth cavity. It changes shape while the voice synthesis engine is speaking.
  ctx.fillStyle = "#050b14";
  polygon(ctx, [[231, 218], [289, 218], [282, 248 + open], [238, 248 + open]], "#050b14", "#8ea7ba", 1.5);
  ctx.strokeStyle = "#dce8f1"; ctx.lineWidth = 2;
  const teeth = 4;
  for (let i = 0; i < teeth; i += 1) {
    const tx = 239 + i * 10.5;
    ctx.beginPath(); ctx.moveTo(tx, 222); ctx.lineTo(tx + 1, 230 + open * 0.15); ctx.stroke();
  }
  // Jaw piston rails.
  ctx.strokeStyle = "#c5d8e6"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(218, 218); ctx.lineTo(225, 252 + open * 0.65); ctx.moveTo(302, 218); ctx.lineTo(295, 252 + open * 0.65); ctx.stroke();
  // Articulated lower jaw.
  ctx.save();
  ctx.translate(260, 235);
  ctx.translate(0, open);
  polygon(ctx, [[-29, -5], [-19, 5], [-11, 22], [0, 30], [11, 22], [19, 5], [29, -5], [25, 25], [0, 47], [-25, 25]], metal(ctx, -30, -5, 60, 50, true), "#d2e2ed", 1.8);
  polygon(ctx, [[-15, 20], [0, 29], [15, 20], [11, 34], [0, 39], [-11, 34]], "#1c3045", "#9db4c7", 1);
  ctx.restore();

  // Chin and cheek light seams.
  ctx.strokeStyle = "rgba(231,244,255,.7)"; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(205, 225); ctx.lineTo(219, 253); ctx.lineTo(244, 266); ctx.moveTo(315, 225); ctx.lineTo(301, 253); ctx.lineTo(276, 266); ctx.stroke();
  ctx.restore(); // head/neck
  ctx.restore(); // idle torso
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
  const [canvasAvailable, setCanvasAvailable] = useState(true);
  const [effectiveMode, setEffectiveMode] = useState("high");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext && canvas.getContext("2d", { alpha: true });
    if (!ctx) {
      setCanvasAvailable(false);
      return undefined;
    }
    setCanvasAvailable(true);
    let width = 520;
    let height = 690;
    let frame = 0;
    let lastDraw = 0;
    let running = true;
    let previousTime = 0;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hardware = navigator.hardwareConcurrency || 2;
    const memory = navigator.deviceMemory || 4;
    const autoLow = hardware <= 2 || memory <= 4;
    const mode = quality === "auto" ? (autoLow ? "low" : "high") : quality;
    const low = mode === "low";
    setEffectiveMode(mode);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(240, rect.width || 520);
      const cssHeight = Math.max(360, rect.height || 690);
      const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      width = cssWidth;
      height = cssHeight;
      ctx.setTransform((cssWidth / W) * dpr, 0, 0, (cssHeight / H) * dpr, 0, 0);
    }
    resize();
    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    function draw(now) {
      if (!running) return;
      frame = window.requestAnimationFrame(draw);
      const interval = reduceMotion ? 200 : (low ? 42 : 24);
      if (now - lastDraw < interval) return;
      lastDraw = now;
      const seconds = now / 1000;
      ctx.clearRect(0, 0, W, H);

      // Perspective grid and halo ring under the hologram.
      const floor = ctx.createLinearGradient(0, 430, 0, 690);
      floor.addColorStop(0, "rgba(5,16,35,0)");
      floor.addColorStop(1, "rgba(4,12,27,.86)");
      ctx.fillStyle = floor; ctx.fillRect(0, 420, W, 270);
      ctx.save();
      ctx.strokeStyle = "rgba(55,164,245,.18)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i += 1) {
        const y = 485 + i * i * 2.6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let i = -6; i <= 6; i += 1) {
        ctx.beginPath(); ctx.moveTo(260, 470); ctx.lineTo(260 + i * 62, 690); ctx.stroke();
      }
      ctx.restore();
      glow(ctx, 260, 630, 180, "rgba(22,119,255,.23)", 1);
      ctx.save();
      ctx.translate(260, 641);
      ctx.scale(1, 0.26);
      ctx.strokeStyle = "rgba(81,202,255,.9)";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#2fbcff";
      ctx.shadowBlur = low ? 8 : 20;
      ctx.beginPath(); ctx.ellipse(0, 0, 172 + Math.sin(seconds * 1.7) * 3, 85, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(148,94,255,.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 124, 61, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (!reduceMotion) {
        drawRobot(ctx, seconds, speaking, listening, !low, speechTick);
      } else {
        drawRobot(ctx, 0, false, false, false, 0);
      }
      // Hologram scan line.
      const scanY = 80 + ((seconds * 66) % 520);
      const scan = ctx.createLinearGradient(0, scanY - 7, 0, scanY + 7);
      scan.addColorStop(0, "rgba(76,184,255,0)");
      scan.addColorStop(0.5, "rgba(76,184,255,.14)");
      scan.addColorStop(1, "rgba(76,184,255,0)");
      ctx.fillStyle = scan; ctx.fillRect(80, scanY - 7, 360, 14);
    }
    frame = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", resize);
    };
  }, [speaking, listening, thinking, speechTick, quality]);

  return (
    <div className={"ultronVisual " + (speaking ? "isSpeaking " : "") + (listening ? "isListening" : "")} onClick={onMicClick} role="button" tabIndex={0} aria-label="Toggle ULTRON voice listening" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onMicClick(); }}>
      <div className="avatarAura" />
      {canvasAvailable ? (
        <canvas ref={canvasRef} className="ultronCanvas" aria-label="Animated metallic ULTRON hologram" />
      ) : (
        <div className="avatarFallback"><div className="fallbackHead"><i /><b /><em /></div><strong>ULTRON</strong></div>
      )}
      <div className="visualName">ULTRON</div>
      <div className="visualStatus">{speaking ? "VOICE OUTPUT · ANIMATING" : listening ? "VOICE INPUT · LISTENING" : thinking ? "NEURAL PROCESSING" : "AWAITING COMMAND"}</div>
      <div className="qualityPill" title="Auto mode selects detail based on available hardware">
        <span className={effectiveMode === "low" ? "lowDot" : "highDot"} />
        {effectiveMode.toUpperCase()} RENDER
      </div>
    </div>
  );
}
