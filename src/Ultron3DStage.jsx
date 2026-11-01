import { useEffect, useRef } from "react";
import * as THREE from "three";

function roundedBox(group, size, position, material, bevel = 0.08) {
  const shape = new THREE.Shape();
  const w = size[0], h = size[1], d = size[2];
  const x = -w / 2, y = -h / 2;
  const r = Math.min(bevel, w / 3, h / 3);
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: Math.min(bevel / 2, d / 5),
    bevelThickness: Math.min(bevel / 2, d / 5),
    curveSegments: 4
  });
  geometry.translate(0, 0, -d / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function ball(group, radius, position, material, scale = [1, 1, 1], segments = 20) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, Math.floor(segments / 2))), material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}
function beam(group, radiusTop, radiusBottom, length, position, material, rotation = [0, 0, 0], radial = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radial, 1), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function line(group, points, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
  const mesh = new THREE.Line(geometry, material);
  group.add(mesh);
  return mesh;
}

function materials() {
  return {
    chrome: new THREE.MeshStandardMaterial({ color: 0x9eacba, metalness: 0.88, roughness: 0.24 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xc5d0da, metalness: 0.82, roughness: 0.29 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x28394d, metalness: 0.9, roughness: 0.31 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x091321, metalness: 0.72, roughness: 0.4 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x485c70, metalness: 0.93, roughness: 0.2 }),
    red: new THREE.MeshStandardMaterial({ color: 0xff384b, emissive: 0xc80019, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.18 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x72e5ff, emissive: 0x138fd0, emissiveIntensity: 1.8, metalness: 0.45, roughness: 0.19 })
  };
}

function addFinger(hand, x, y, length, mat) {
  const finger = new THREE.Group();
  finger.position.set(x, y, 0.05);
  hand.add(finger);
  beam(finger, 0.035, 0.045, length * 0.54, [0, -length * 0.27, 0], mat, [0, 0, 0], 8);
  ball(finger, 0.042, [0, -length * 0.53, 0], mat, [1, 0.8, 1], 10);
  beam(finger, 0.028, 0.04, length * 0.48, [0, -length * 0.76, 0], mat, [0, 0, 0], 8);
  return finger;
}

function addArm(torso, side, m, low) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.85, 0.3, 0);
  torso.add(shoulder);
  ball(shoulder, 0.31, [0, 0, 0], m.dark, [1, 1, 0.9]);
  ball(shoulder, 0.23, [0, 0, 0.06], m.joint, [1, 1, 0.8]);
  const shoulderPlate = roundedBox(shoulder, [0.53, 0.48, 0.42], [side * -0.03, -0.02, 0.1], m.silver, 0.12);
  shoulderPlate.rotation.z = side * -0.12;
  roundedBox(shoulder, [0.35, 0.21, 0.12], [side * -0.03, -0.04, 0.32], m.gunmetal, 0.06);
  if (!low) {
    roundedBox(shoulder, [0.12, 0.035, 0.025], [side * -0.03, -0.08, 0.39], m.red, 0.012);
  }

  const upper = new THREE.Group();
  upper.position.set(0, -0.22, 0);
  shoulder.add(upper);
  beam(upper, 0.16, 0.22, 0.58, [0, -0.34, 0], m.joint, [0, 0, side * 0.04], 12);
  roundedBox(upper, [0.39, 0.59, 0.33], [0, -0.34, 0.05], m.chrome, 0.11);
  roundedBox(upper, [0.3, 0.44, 0.1], [0, -0.34, 0.22], m.gunmetal, 0.07);
  for (let i = 0; i < (low ? 1 : 3); i += 1) {
    roundedBox(upper, [0.22, 0.018, 0.018], [0, -0.2 - i * 0.09, 0.282], m.silver, 0.008);
  }
  const elbow = new THREE.Group();
  elbow.position.set(0, -0.68, 0);
  upper.add(elbow);
  ball(elbow, 0.17, [0, 0, 0], m.dark, [1, 1, 0.9]);
  ball(elbow, 0.105, [0, 0, 0.07], m.joint, [1, 1, 0.8]);
  const forearm = new THREE.Group();
  forearm.position.set(0, -0.08, 0);
  elbow.add(forearm);
  beam(forearm, 0.12, 0.19, 0.62, [0, -0.31, 0], m.joint, [0, 0, -side * 0.03], 12);
  roundedBox(forearm, [0.37, 0.58, 0.34], [0, -0.31, 0.05], m.silver, 0.1);
  roundedBox(forearm, [0.27, 0.43, 0.09], [0, -0.31, 0.23], m.gunmetal, 0.07);
  if (!low) {
    roundedBox(forearm, [0.09, 0.26, 0.025], [0, -0.31, 0.3], m.chrome, 0.012);
  }

  const wrist = new THREE.Group();
  wrist.position.set(0, -0.65, 0);
  forearm.add(wrist);
  beam(wrist, 0.09, 0.12, 0.12, [0, 0, 0], m.dark);
  const hand = new THREE.Group();
  hand.position.set(0, -0.12, 0.02);
  wrist.add(hand);
  roundedBox(hand, [0.25, 0.28, 0.13], [0, -0.1, 0.03], m.joint, 0.06);
  roundedBox(hand, [0.21, 0.11, 0.08], [0, -0.08, 0.11], m.silver, 0.04);
  const fingers = [];
  for (let i = 0; i < 4; i += 1) {
    fingers.push(addFinger(hand, -0.09 + i * 0.06, -0.21, 0.23 + (i === 1 || i === 2 ? 0.025 : 0), m.chrome));
  }
  const thumb = addFinger(hand, side < 0 ? 0.14 : -0.14, -0.03, 0.19, m.silver);
  thumb.rotation.z = side < 0 ? 0.78 : -0.78;
  fingers.push(thumb);
  return { shoulder, upper, elbow, forearm, wrist, hand, fingers };
}

function createRobot(scene, low) {
  const m = materials();
  const root = new THREE.Group();
  scene.add(root);

  // Waist and pelvis armour.
  const pelvis = new THREE.Group();
  pelvis.position.y = -0.58;
  root.add(pelvis);
  roundedBox(pelvis, [0.92, 0.48, 0.56], [0, 0, 0], m.dark, 0.15);
  roundedBox(pelvis, [0.74, 0.3, 0.6], [0, -0.08, 0.02], m.chrome, 0.1);
  for (const side of [-1, 1]) {
    const plate = roundedBox(pelvis, [0.27, 0.4, 0.22], [side * 0.37, 0, 0.19], m.silver, 0.07);
    plate.rotation.z = side * -0.16;
  }

  // Layered torso / chest.
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  root.add(torso);
  roundedBox(torso, [1.45, 1.4, 0.65], [0, -0.02, 0], m.dark, 0.19);
  roundedBox(torso, [1.31, 1.22, 0.68], [0, 0, 0.015], m.gunmetal, 0.17);
  for (const side of [-1, 1]) {
    const pectoral = roundedBox(torso, [0.61, 0.54, 0.2], [side * 0.35, 0.31, 0.39], m.silver, 0.11);
    pectoral.rotation.z = side * -0.12;
    roundedBox(torso, [0.43, 0.34, 0.08], [side * 0.35, 0.27, 0.52], m.chrome, 0.06);
    roundedBox(torso, [0.24, 0.04, 0.025], [side * 0.35, 0.06, 0.57], m.gunmetal, 0.01);
    if (!low) {
      for (let n = 0; n < 3; n += 1) {
        roundedBox(torso, [0.22, 0.014, 0.014], [side * 0.35, -0.1 - n * 0.08, 0.55], m.silver, 0.006);
      }
    }
  }
  ball(torso, 0.2, [0, 0.04, 0.52], m.dark, [1.1, 1.3, 0.55]);
  const core = ball(torso, 0.13, [0, 0.04, 0.64], m.cyan, [0.9, 1.25, 0.4], 20);
  const coreLight = new THREE.PointLight(0x32aaff, low ? 1 : 2, 2.2);
  coreLight.position.set(0, 0.03, 0.9);
  torso.add(coreLight);

  // Neck mechanics and shoulder bridge.
  roundedBox(torso, [0.58, 0.24, 0.42], [0, 0.72, 0], m.dark, 0.07);
  beam(torso, 0.15, 0.17, 0.35, [0, 0.84, 0], m.chrome);
  for (const side of [-1, 1]) {
    beam(torso, 0.035, 0.05, 0.4, [side * 0.2, 0.77, 0.13], m.silver, [0, 0, side * 0.13], 8);
  }

  // Angular skull shell.
  const head = new THREE.Group();
  head.position.set(0, 1.45, 0.04);
  root.add(head);
  ball(head, 0.55, [0, 0.02, 0], m.chrome, [0.91, 1.15, 0.78], 24);
  roundedBox(head, [0.73, 0.29, 0.58], [0, 0.38, 0.015], m.gunmetal, 0.11);
  const crest = roundedBox(head, [0.23, 0.55, 0.14], [0, 0.27, 0.42], m.silver, 0.07);
  crest.rotation.x = -0.12;
  roundedBox(head, [0.12, 0.22, 0.06], [0, 0.07, 0.51], m.dark, 0.025);
  for (const side of [-1, 1]) {
    const temple = roundedBox(head, [0.22, 0.62, 0.34], [side * 0.42, -0.02, 0.03], m.silver, 0.08);
    temple.rotation.z = side * -0.13;
    roundedBox(head, [0.13, 0.27, 0.08], [side * 0.45, -0.19, 0.29], m.dark, 0.04);
    for (let i = 0; i < 3; i += 1) {
      roundedBox(head, [0.12, 0.026, 0.025], [side * 0.44, -0.14 - i * 0.09, 0.34], m.chrome, 0.009);
    }
  }

  // Face mask and brow.
  roundedBox(head, [0.65, 0.46, 0.18], [0, -0.19, 0.45], m.dark, 0.08);
  const brow = roundedBox(head, [0.68, 0.12, 0.15], [0, 0.17, 0.52], m.gunmetal, 0.04);
  brow.rotation.z = -0.015;
  for (const side of [-1, 1]) {
    roundedBox(head, [0.25, 0.06, 0.12], [side * 0.21, 0.08, 0.55], m.dark, 0.025);
    const eye = ball(head, 0.064, [side * 0.22, 0.045, 0.61], m.red, [1.4, 0.65, 0.46], 16);
    const light = new THREE.PointLight(0xff273c, low ? 0.35 : 0.75, 0.9);
    light.position.set(side * 0.22, 0.04, 0.72);
    head.add(light);
  }
  // Nose ridge and cheek armour.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.34, 5), m.silver);
  nose.position.set(0, -0.08, 0.61);
  nose.rotation.x = Math.PI;
  head.add(nose);
  for (const side of [-1, 1]) {
    const cheek = roundedBox(head, [0.24, 0.25, 0.13], [side * 0.28, -0.2, 0.53], m.chrome, 0.055);
    cheek.rotation.z = side * -0.17;
  }

  // Mouth cavity with a moving jaw hinge.
  roundedBox(head, [0.39, 0.15, 0.12], [0, -0.34, 0.55], m.dark, 0.035);
  for (let i = 0; i < 5; i += 1) {
    roundedBox(head, [0.035, 0.035, 0.018], [-0.13 + i * 0.065, -0.31, 0.62], m.silver, 0.008);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.37, 0.5);
  head.add(jaw);
  roundedBox(jaw, [0.47, 0.16, 0.22], [0, -0.065, 0.02], m.chrome, 0.06);
  roundedBox(jaw, [0.3, 0.045, 0.05], [0, -0.055, 0.14], m.dark, 0.02);
  for (const side of [-1, 1]) {
    beam(jaw, 0.022, 0.022, 0.13, [side * 0.21, 0.035, -0.015], m.silver, [0, 0, side * 0.22], 6);
  }

  const arms = [addArm(torso, -1, m, low), addArm(torso, 1, m, low)];

  // Upper legs remain mostly still; this makes the hologram stable on mobile.
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.4, -0.78, 0);
    root.add(leg);
    ball(leg, 0.18, [0, 0, 0], m.dark);
    beam(leg, 0.15, 0.2, 0.62, [0, -0.32, 0], m.joint);
    roundedBox(leg, [0.4, 0.56, 0.35], [0, -0.32, 0.05], m.silver, 0.1);
    roundedBox(leg, [0.27, 0.37, 0.08], [0, -0.31, 0.24], m.gunmetal, 0.05);
    const knee = new THREE.Group();
    knee.position.set(0, -0.63, 0);
    leg.add(knee);
    ball(knee, 0.13, [0, 0, 0], m.dark);
    roundedBox(knee, [0.31, 0.2, 0.18], [0, -0.02, 0.1], m.chrome, 0.06);
    beam(knee, 0.1, 0.14, 0.62, [0, -0.34, 0], m.joint);
    roundedBox(knee, [0.36, 0.58, 0.32], [0, -0.32, 0.05], m.silver, 0.09);
    roundedBox(knee, [0.25, 0.42, 0.08], [0, -0.31, 0.22], m.gunmetal, 0.05);
    legs.push(leg);
  }

  // Glowing holographic pedestal with concentric rings.
  const pedestal = new THREE.Group();
  pedestal.position.y = -2.45;
  root.add(pedestal);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.14, low ? 28 : 64), m.dark);
  base.position.y = 0.02;
  pedestal.add(base);
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.025, 8, low ? 28 : 64), m.cyan);
  outerRing.rotation.x = Math.PI / 2;
  outerRing.position.y = 0.1;
  pedestal.add(outerRing);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.012, 6, low ? 20 : 48), m.red);
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.105;
  pedestal.add(innerRing);

  return { root, torso, head, jaw, arms, legs, core, pedestal };
}

export default function Ultron3DStage({ speaking = false, listening = false, quality = "auto", onReady, onFallback }) {
  const canvasRef = useRef(null);
  const speakingRef = useRef(speaking);
  const readyRef = useRef(onReady);
  const fallbackRef = useRef(onFallback);
  speakingRef.current = speaking;
  readyRef.current = onReady;
  fallbackRef.current = onFallback;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const cores = navigator.hardwareConcurrency || 2;
    const memory = navigator.deviceMemory || 2;
    const low = quality === "low" || (quality === "auto" && (cores <= 2 || memory <= 2));
    // AUTO still attempts 3D at reduced resolution on modest hardware.
    // Explicit LOW mode skips WebGL and uses the dependable 2D fallback.
    if (quality === "low") {
      fallbackRef.current?.("Low-power 2D mode selected.");
      return undefined;
    }

    let renderer = null;
    let frame = 0;
    let observer = null;
    let resizeHandler = null;
    let stopped = false;
    let lastFrame = 0;
    try {
      const context = canvas.getContext("webgl2", {
        alpha: true,
        antialias: !low,
        powerPreference: low ? "low-power" : "high-performance",
        failIfMajorPerformanceCaveat: false
      });
      if (!context) throw new Error("This graphics driver does not provide WebGL 2.");
      renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: !low });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 0.8 : 1.35));
      renderer.shadowMap.enabled = !low;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x071326, 0.035);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      camera.position.set(0, 0.25, 8.5);
      camera.lookAt(0, -0.12, 0);

      scene.add(new THREE.HemisphereLight(0xb7dfff, 0x101b2b, 1.7));
      const key = new THREE.DirectionalLight(0xffffff, 3.4);
      key.position.set(-3.2, 5.5, 5);
      key.castShadow = !low;
      if (!low) {
        key.shadow.mapSize.set(512, 512);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 15;
      }
      scene.add(key);
      const blueRim = new THREE.PointLight(0x2879ff, 4.2, 9);
      blueRim.position.set(3, 1.8, -2.8);
      scene.add(blueRim);
      const redRim = new THREE.PointLight(0xff2338, 1.4, 5);
      redRim.position.set(-2.2, 0.5, 2.5);
      scene.add(redRim);
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(2.3, low ? 28 : 64),
        new THREE.MeshBasicMaterial({ color: 0x0a1b34, transparent: true, opacity: 0.3 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -2.5;
      scene.add(floor);

      const robot = createRobot(scene, low);
      robot.root.position.y = -0.02;

      const onResize = () => {
        const width = Math.max(canvas.clientWidth, 1);
        const height = Math.max(canvas.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(onResize);
        observer.observe(canvas);
      } else {
        resizeHandler = onResize;
        window.addEventListener("resize", resizeHandler);
      }
      onResize();

      const clock = new THREE.Clock();
      const animate = (now) => {
        if (stopped) return;
        frame = requestAnimationFrame(animate);
        const interval = low ? 50 : 33;
        if (now - lastFrame < interval) return;
        lastFrame = now;
        const time = clock.getElapsedTime();
        const talking = speakingRef.current;
        robot.jaw.rotation.x = talking ? 0.06 + Math.abs(Math.sin(time * 11.5)) * 0.42 : 0.015;
        robot.head.rotation.y = Math.sin(time * 0.65) * 0.055;
        robot.head.rotation.z = Math.sin(time * 0.5) * 0.014;
        robot.root.rotation.y = Math.sin(time * 0.26) * 0.045;
        robot.root.position.y = -0.02 + Math.sin(time * 1.1) * 0.025;
        robot.arms.forEach((arm, index) => {
          const phase = time * 4.7 + index * 1.4;
          const side = index === 0 ? -1 : 1;
          arm.shoulder.rotation.z = side * (0.03 + (talking ? Math.sin(phase) * 0.11 : Math.sin(time * 0.9 + index) * 0.012));
          arm.upper.rotation.x = talking ? Math.sin(phase * 0.65) * 0.07 : 0;
          arm.elbow.rotation.x = talking ? Math.cos(phase) * 0.1 : 0.02;
          arm.forearm.rotation.x = talking ? Math.sin(phase + 0.7) * 0.055 : 0;
          arm.fingers.forEach((finger, fingerIndex) => {
            finger.rotation.x = talking ? 0.08 + Math.sin(phase + fingerIndex) * 0.14 : 0.02;
          });
        });
        robot.legs.forEach((leg, index) => {
          leg.rotation.z = Math.sin(time * 0.75 + index) * 0.008;
        });
        robot.core.material.emissiveIntensity = 1.3 + Math.abs(Math.sin(time * (talking ? 6 : 1.5))) * 0.8;
        robot.pedestal.rotation.y = time * 0.08;
        renderer.render(scene, camera);
      };
      frame = requestAnimationFrame(animate);
      readyRef.current?.();
    } catch (error) {
      stopped = true;
      if (renderer) renderer.dispose();
      fallbackRef.current?.(error?.message || "WebGL 2 unavailable.");
    }

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (renderer) renderer.dispose();
    };
  }, [quality]);

  return <canvas ref={canvasRef} className="ultron3dCanvas" aria-label="Metallic ULTRON real-time 3D avatar" />;
}
