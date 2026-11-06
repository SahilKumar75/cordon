"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type SealSceneProps = {
  stage: 0 | 1 | 2 | 3 | 4;
  votes: number;
  quorum: number | null;
  sealed: boolean;
  versionLabel: string | null;
};

const palette = {
  paper: 0xf3f1ec,
  panel: 0xfbfaf7,
  ink: 0x1c1b18,
  line: 0xd6d2c7,
  accent: 0xb23c0c,
  accentSoft: 0xf5e2d6,
};

const aspect = 16 / 7;
const viewHeight = 11.2;
const target = new THREE.Vector3(0.4, 1.5, 0);
const azimuth = THREE.MathUtils.degToRad(22);
const elevation = THREE.MathUtils.degToRad(24);
const driftRange = THREE.MathUtils.degToRad(3);
const shelfX = -10.6;
const shelfTop = 1.0;
const trackTop = 0.2;
const crateSize = 1.25;
const archXs = [-6.6, -4.3, -2.0];
const gateX = 1.8;
const gateZ = -1.45;
const boomOpen = -1.32;
const guardXs = [5.6, 8.2, 10.8];
const pipLimit = 5;
const travelMs = 1500;

type Ease = (p: number) => number;
type Tween = { from: number; to: number; start: number; duration: number; ease: Ease };

const easeInOut: Ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

const weightedDrop: Ease = (p) => {
  if (p < 0.55) return (p / 0.55) ** 2;
  const u = (p - 0.55) / 0.45;
  return 1 - 0.12 * Math.abs(Math.sin(2 * Math.PI * u)) * (1 - u) ** 2;
};

const tweenValue = (tween: Tween, now: number) => {
  const p = THREE.MathUtils.clamp((now - tween.start) / tween.duration, 0, 1);
  return tween.from + (tween.to - tween.from) * tween.ease(p);
};

const still = (value: number): Tween => ({ from: value, to: value, start: 0, duration: 1, ease: easeInOut });

const fillMaterial = (color: number) =>
  new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

function solid(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  fill: THREE.Material | THREE.Material[],
  edge: THREE.LineBasicMaterial,
) {
  const geometry = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, fill);
  mesh.position.set(...position);
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge));
  parent.add(mesh);
  return mesh;
}

function drawLabel(context: CanvasRenderingContext2D, label: string, sealed: boolean) {
  const size = context.canvas.width;
  context.fillStyle = sealed ? "#b23c0c" : "#fbfaf7";
  context.fillRect(0, 0, size, size);
  context.strokeStyle = sealed ? "#f3f1ec" : "#1c1b18";
  context.lineWidth = 4;
  context.strokeRect(22, 22, size - 44, size - 44);
  context.fillStyle = sealed ? "#f3f1ec" : "#1c1b18";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const split = label.lastIndexOf("@");
  const lines = split > 0 ? [label.slice(0, split), label.slice(split)] : [label];
  lines.forEach((text, index) => {
    const weight = index === lines.length - 1 ? 600 : 500;
    let px = index === lines.length - 1 ? 44 : 28;
    context.font = `${weight} ${px}px ui-monospace, Menlo, monospace`;
    while (px > 12 && context.measureText(text).width > size - 64) {
      px -= 2;
      context.font = `${weight} ${px}px ui-monospace, Menlo, monospace`;
    }
    const y = lines.length === 1 ? size / 2 : size / 2 + (index === 0 ? -30 : 26);
    context.fillText(text, size / 2, y);
  });
}

function createSealScene(canvas: HTMLCanvasElement, reducedMotion: () => boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    (-viewHeight * aspect) / 2,
    (viewHeight * aspect) / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    200,
  );

  const ink = new THREE.LineBasicMaterial({ color: palette.ink });
  const faint = new THREE.LineBasicMaterial({ color: palette.line });
  const paper = fillMaterial(palette.paper);
  const panel = fillMaterial(palette.panel);
  const inkFill = fillMaterial(palette.ink);
  const accentFill = fillMaterial(palette.accent);

  const gridPoints: number[] = [];
  for (let x = -20; x <= 20; x += 1) gridPoints.push(x, 0, -5, x, 0, 5);
  for (let z = -5; z <= 5; z += 1) gridPoints.push(-20, 0, z, 20, 0, z);
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(gridPoints, 3));
  scene.add(new THREE.LineSegments(gridGeometry, faint));

  solid(scene, [2.8, 0.12, 2.2], [shelfX, shelfTop - 0.06, 0], panel, ink);
  solid(scene, [2.8, 0.12, 2.2], [shelfX, 0.06, 0], panel, ink);
  for (const [dx, dz] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]] as const) {
    solid(scene, [0.12, shelfTop, 0.12], [shelfX + dx, shelfTop / 2, dz], paper, ink);
  }
  solid(scene, [0.7, 0.55, 0.7], [shelfX - 0.7, 0.4, -0.3], paper, faint);
  solid(scene, [0.55, 0.45, 0.55], [shelfX + 0.5, 0.35, 0.2], paper, faint);
  solid(scene, [0.5, 0.4, 0.5], [shelfX - 0.4, shelfTop + 0.2, -0.6], paper, faint);

  const trackStart = shelfX + 1.8;
  const trackEnd = 12.2;
  const trackLength = trackEnd - trackStart;
  const trackMid = (trackStart + trackEnd) / 2;
  solid(scene, [trackLength, 0.1, 1.8], [trackMid, 0.05, 0], panel, ink);
  solid(scene, [trackLength, 0.1, 0.12], [trackMid, 0.15, -0.6], paper, ink);
  solid(scene, [trackLength, 0.1, 0.12], [trackMid, 0.15, 0.6], paper, ink);

  const arches = archXs.map((x) => {
    const fill = fillMaterial(palette.paper);
    const edge = new THREE.LineBasicMaterial({ color: palette.line });
    solid(scene, [0.3, 2.5, 0.3], [x, 1.25, -1.2], fill, edge);
    solid(scene, [0.3, 2.5, 0.3], [x, 1.25, 1.2], fill, edge);
    solid(scene, [0.4, 0.34, 2.7], [x, 2.67, 0], fill, edge);
    solid(scene, [0.5, 0.08, 1.6], [x, 2.46, 0], fill, edge);
    return { fill, edge };
  });

  solid(scene, [0.5, 2.3, 0.5], [gateX, 1.15, gateZ], panel, ink);
  solid(scene, [0.9, 0.12, 0.9], [gateX, 0.06, gateZ], paper, ink);
  solid(scene, [0.18, 1.62, 0.18], [gateX, 0.81, 2.15], paper, ink);
  const pips = Array.from({ length: pipLimit }, (_, index) => {
    const fill = fillMaterial(palette.paper);
    const pip = solid(scene, [0.22, 0.22, 0.06], [gateX, 0.5 + index * 0.36, gateZ + 0.28], fill, ink);
    return { pip, fill };
  });

  const boom = new THREE.Group();
  boom.position.set(gateX, 1.9, gateZ);
  scene.add(boom);
  solid(boom, [0.62, 0.62, 0.62], [0, 0, 0], panel, ink);
  solid(boom, [0.2, 0.2, 3.7], [0, 0, 2.1], panel, ink);
  solid(boom, [0.46, 0.46, 0.7], [0, 0, -0.62], inkFill, ink);
  const tape = new THREE.Group();
  tape.position.set(0, 0, 2.15);
  boom.add(tape);
  const tapeCount = 7;
  const tapeLength = 3.2 / tapeCount;
  for (let index = 0; index < tapeCount; index += 1) {
    const z = (index - (tapeCount - 1) / 2) * tapeLength;
    solid(tape, [0.28, 0.28, tapeLength], [0, 0, z], index % 2 === 0 ? accentFill : paper, ink);
  }

  const guards = guardXs.map((x) => {
    const fill = fillMaterial(palette.panel);
    const group = new THREE.Group();
    group.position.set(x, 0, 0);
    scene.add(group);
    solid(group, [2.3, 0.16, 2.3], [0, 0.18, 0], paper, ink);
    return { fill, group };
  });
  const [install, ci, services] = guards as [(typeof guards)[0], (typeof guards)[0], (typeof guards)[0]];
  solid(install.group, [1.7, 0.14, 1.3], [0, 0.33, 0], install.fill, ink);
  solid(install.group, [1.7, 0.36, 0.12], [0, 0.58, -0.59], install.fill, ink);
  solid(install.group, [1.7, 0.36, 0.12], [0, 0.58, 0.59], install.fill, ink);
  solid(install.group, [0.12, 0.36, 1.06], [-0.79, 0.58, 0], install.fill, ink);
  solid(install.group, [0.12, 0.36, 1.06], [0.79, 0.58, 0], install.fill, ink);
  solid(ci.group, [0.74, 0.74, 0.74], [-0.52, 0.63, -0.25], ci.fill, ink);
  solid(ci.group, [0.74, 0.74, 0.74], [0.52, 0.63, 0.25], ci.fill, ink);
  solid(ci.group, [0.34, 0.14, 0.14], [0, 0.63, 0], ci.fill, ink);
  solid(ci.group, [0.5, 0.5, 0.5], [-0.52, 1.25, -0.25], ci.fill, ink);
  solid(services.group, [1.1, 2.3, 1.0], [0, 1.41, 0], services.fill, ink);
  for (let index = 0; index < 4; index += 1) {
    solid(services.group, [0.86, 0.1, 0.04], [0, 0.75 + index * 0.45, 0.52], inkFill, ink);
  }

  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 256;
  const labelContext = labelCanvas.getContext("2d") as CanvasRenderingContext2D;
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.anisotropy = 4;
  const crateFill = fillMaterial(palette.panel);
  const labelFill = new THREE.MeshBasicMaterial({ map: labelTexture, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const crate = new THREE.Group();
  scene.add(crate);
  solid(crate, [crateSize, crateSize, crateSize], [0, 0, 0], [crateFill, crateFill, crateFill, crateFill, labelFill, crateFill], ink);
  solid(crate, [crateSize + 0.02, 0.1, crateSize + 0.02], [0, 0.28, 0], crateFill, ink);

  const tweens = {
    crateX: still(shelfX),
    crateY: still(shelfTop),
    crateScale: still(0),
    crateTint: still(0),
    boom: still(boomOpen),
    tape: still(0),
    archEdge: archXs.map(() => still(0)),
    archFill: archXs.map(() => still(0)),
    guard: guardXs.map(() => still(0)),
  };
  const allTweens = () => [
    tweens.crateX,
    tweens.crateY,
    tweens.crateScale,
    tweens.crateTint,
    tweens.boom,
    tweens.tape,
    ...tweens.archEdge,
    ...tweens.archFill,
    ...tweens.guard,
  ];

  let label = "";
  let labelSealed = false;
  let drift = 1;
  let driftGoal = 1;
  let firstApply = true;
  const mountedAt = performance.now();
  let lastFrame = mountedAt;

  const retarget = (tween: Tween, to: number, now: number, delay = 0, duration = 600, ease = easeInOut) => {
    if (tween.to === to) return;
    const instant = firstApply || reducedMotion();
    tween.from = instant ? to : tweenValue(tween, now);
    tween.to = to;
    tween.start = now + (instant ? 0 : delay);
    tween.duration = duration;
    tween.ease = ease;
  };

  const apply = (props: SealSceneProps) => {
    const now = performance.now();
    const quorum = THREE.MathUtils.clamp(props.quorum ?? 2, 1, pipLimit);
    const atArch = props.stage === 2;
    const atGate = props.stage >= 3;
    const archIndex = THREE.MathUtils.clamp(props.votes - 1, 0, archXs.length - 1);
    const crateX = atGate ? (props.sealed ? gateX - 1.9 : gateX + 1.9) : atArch ? (archXs[archIndex] ?? 0) + 1.15 : shelfX;
    const moving = crateX !== tweens.crateX.to;
    retarget(tweens.crateX, crateX, now, 0, travelMs);
    retarget(tweens.crateY, props.stage >= 2 ? trackTop : shelfTop, now, 0, travelMs * 0.6);
    retarget(tweens.crateScale, props.stage >= 1 ? 1 : 0, now, 0, 450);
    const sealDelay = moving ? travelMs * 0.8 : 0;
    retarget(tweens.crateTint, props.sealed ? 1 : 0, now, sealDelay + 500, 350);
    if (props.sealed) retarget(tweens.boom, 0, now, sealDelay, 1100, weightedDrop);
    else retarget(tweens.boom, boomOpen, now, 0, 800);
    retarget(tweens.tape, props.sealed ? 1 : 0, now, props.sealed ? sealDelay + 700 : 0, 350);
    archXs.forEach((_, index) => {
      retarget(tweens.archEdge[index] as Tween, props.stage >= 2 ? 1 : 0, now, index * 120, 400);
      retarget(tweens.archFill[index] as Tween, props.stage >= 2 && props.votes > index ? 1 : 0, now, 0, 400);
    });
    guardXs.forEach((_, index) => {
      retarget(tweens.guard[index] as Tween, props.stage >= 4 && props.sealed ? 1 : 0, now, 200 + index * 450, 300);
    });
    pips.forEach(({ pip, fill }, index) => {
      pip.visible = index < quorum;
      const voted = props.stage >= 2 && index < props.votes;
      fill.color.setHex(voted ? (props.sealed ? palette.accent : palette.ink) : palette.paper);
    });
    if (label !== (props.versionLabel ?? "")) {
      label = props.versionLabel ?? "";
      drawLabel(labelContext, label, labelSealed);
      labelTexture.needsUpdate = true;
    }
    driftGoal = props.stage === 0 && !reducedMotion() ? 1 : 0;
    if (firstApply) drift = driftGoal;
    firstApply = false;
  };

  const paperColor = new THREE.Color(palette.paper);
  const panelColor = new THREE.Color(palette.panel);
  const lineColor = new THREE.Color(palette.line);
  const inkColor = new THREE.Color(palette.ink);
  const accentColor = new THREE.Color(palette.accent);
  const accentSoftColor = new THREE.Color(palette.accentSoft);

  const update = (now: number) => {
    const elapsed = Math.min(now - lastFrame, 100);
    lastFrame = now;
    drift += (driftGoal - drift) * Math.min(1, elapsed / 700);
    const angle = azimuth + drift * driftRange * Math.sin(((now - mountedAt) / 24000) * Math.PI * 2);
    camera.position.set(
      target.x + Math.sin(angle) * Math.cos(elevation) * 50,
      target.y + Math.sin(elevation) * 50,
      target.z + Math.cos(angle) * Math.cos(elevation) * 50,
    );
    camera.lookAt(target);

    const scale = tweenValue(tweens.crateScale, now);
    crate.visible = scale > 0.001;
    crate.scale.setScalar(Math.max(scale, 0.001));
    crate.position.set(tweenValue(tweens.crateX, now), tweenValue(tweens.crateY, now) + crateSize / 2, 0);
    const tint = tweenValue(tweens.crateTint, now);
    crateFill.color.lerpColors(panelColor, accentColor, tint);
    if (tint > 0.5 !== labelSealed) {
      labelSealed = tint > 0.5;
      drawLabel(labelContext, label, labelSealed);
      labelTexture.needsUpdate = true;
    }

    boom.rotation.x = tweenValue(tweens.boom, now);
    const tapeScale = tweenValue(tweens.tape, now);
    tape.visible = tapeScale > 0.001;
    tape.scale.set(Math.max(tapeScale, 0.001), Math.max(tapeScale, 0.001), 1);

    arches.forEach(({ fill, edge }, index) => {
      edge.color.lerpColors(lineColor, inkColor, tweenValue(tweens.archEdge[index] as Tween, now));
      fill.color.lerpColors(paperColor, accentSoftColor, tweenValue(tweens.archFill[index] as Tween, now));
    });
    guards.forEach(({ fill }, index) => {
      fill.color.lerpColors(panelColor, accentColor, tweenValue(tweens.guard[index] as Tween, now));
    });

    const busy = allTweens().some((tween) => now < tween.start + tween.duration);
    return busy || driftGoal > 0 || Math.abs(drift - driftGoal) > 0.0005;
  };

  let frame = 0;
  let onScreen = true;
  const tick = (now: number) => {
    frame = 0;
    const busy = update(now);
    renderer.render(scene, camera);
    if (busy) wake();
  };
  const wake = () => {
    if (frame === 0 && onScreen && !document.hidden) frame = requestAnimationFrame(tick);
  };

  const resize = () => {
    const width = canvas.parentElement?.clientWidth ?? canvas.clientWidth;
    renderer.setSize(width, Math.round(width / aspect), false);
    wake();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.parentElement ?? canvas);
  const intersectionObserver = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    wake();
  });
  intersectionObserver.observe(canvas);
  document.addEventListener("visibilitychange", wake);
  resize();

  const dispose = () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", wake);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        for (const material of [object.material].flat()) material.dispose();
      }
    });
    labelTexture.dispose();
    renderer.dispose();
  };

  return {
    apply: (props: SealSceneProps) => {
      apply(props);
      wake();
    },
    dispose,
  };
}

export function SealScene(props: SealSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReturnType<typeof createSealScene> | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let sealScene: ReturnType<typeof createSealScene>;
    try {
      sealScene = createSealScene(canvas, () => motionQuery.matches);
    } catch {
      setSupported(false);
      return;
    }
    sealScene.apply(propsRef.current);
    sceneRef.current = sealScene;
    return () => {
      sceneRef.current = null;
      sealScene.dispose();
    };
  }, []);

  const { stage, votes, quorum, sealed, versionLabel } = props;
  useEffect(() => {
    sceneRef.current?.apply({ stage, votes, quorum, sealed, versionLabel });
  }, [stage, votes, quorum, sealed, versionLabel]);

  if (!supported) return null;
  return (
    <div className="w-full">
      <canvas ref={canvasRef} className="block w-full" style={{ aspectRatio: "16 / 7" }} aria-hidden="true" />
    </div>
  );
}

export default SealScene;
