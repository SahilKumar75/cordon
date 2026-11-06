"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { AsciiRenderer, Grid, RoundedBox } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import type { ChromaticAberrationEffect } from "postprocessing";
import { createResinMaterial, FrameGate, seconds, tintResin, useActive, useCalm, useKick, useStep, useTones, type Tones } from "./sceneKit";

export type VaultSceneProps = {
  stage: 0 | 1 | 2 | 3 | 4;
  votes: number;
  quorum: number | null;
  sealed: boolean;
  versionLabel: string | null;
  ascii?: boolean;
};

type Anchors = Map<string, THREE.Vector3>;
type Kick = MutableRefObject<number>;
type SceneProps = VaultSceneProps & {
  calm: boolean;
  tones: Tones;
  anchors: Anchors;
  tracked: MutableRefObject<THREE.Vector3>;
  arrival: MutableRefObject<number>;
  sealKick: Kick;
};

const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-16, 0.7, 4.5),
  new THREE.Vector3(-9, 0.7, 1.6),
  new THREE.Vector3(-3, 0.7, -0.2),
  new THREE.Vector3(3, 0.7, 0.4),
  new THREE.Vector3(8.5, 0.7, -0.6),
  new THREE.Vector3(15, 0.7, -3),
]);
const sampleCount = 600;
const samples = curve.getSpacedPoints(sampleCount);
const streamSpeed = 0.028;
const streamCount = 40;
const inspectU = 0.56;
const tubeRadius = 0.5;
const gateUs = [0.81, 0.865, 0.92];
const gateNames = ["install", "ci", "services"];
const shelfSlot = new THREE.Vector3(10.8, 4.1, -3.4);
const satelliteCenter = curve.getPointAt(inspectU).add(new THREE.Vector3(0, 3.1, 0));
const cameraBase = new THREE.Vector3(2.5, 8.4, 17.5);
const cameraTarget = new THREE.Vector3(2.6, 1.6, -0.6);
const particleCount = 160;
const dustCount = 520;
const glitchSeconds = 0.5;
const asciiCharacters = " .:-+*=%@#";
const labelFont = "var(--font-mono, ui-monospace, monospace)";

const pointAt = (u: number, out: THREE.Vector3) => {
  const f = THREE.MathUtils.clamp(u, 0, 1) * sampleCount;
  const i = Math.min(Math.floor(f), sampleCount - 1);
  return out.lerpVectors(samples[i]!, samples[i + 1]!, f - i);
};

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const jitter = (step: number, k: number) => {
  const x = Math.sin(step * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

const dustVertex = `
attribute vec3 seed;
uniform float uTime;
uniform float uScale;
varying float vFade;
void main() {
  vec3 p = position;
  float rise = mod(p.y + uTime * (0.12 + seed.y * 0.18), 7.0);
  p.y = rise;
  p.x += sin(uTime * 0.21 * (0.6 + seed.y) + seed.x * 6.2831) * 0.7;
  p.z += cos(uTime * 0.17 * (0.6 + seed.y) + seed.x * 6.2831) * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (1.5 + seed.z * 3.5) * uScale / -mv.z;
  vFade = smoothstep(0.0, 0.8, rise) * (1.0 - smoothstep(6.0, 7.0, rise)) * (0.4 + 0.6 * seed.z);
}`;

const dustFragment = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vFade * uOpacity);
}`;

const shaftVertex = `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const shaftFragment = `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  float fall = smoothstep(1.0, 0.1, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
  float core = pow(abs(dot(normalize(vNormalW), vView)), 1.5);
  float streak = 0.75 + 0.25 * sin(vUv.x * 60.0 + uTime * 0.8) * sin(vUv.x * 23.0 - uTime * 0.5);
  gl_FragColor = vec4(uColor, fall * core * streak * uStrength);
}`;

function CameraRig({ calm, sealKick }: { calm: boolean; sealKick: Kick }) {
  const pointer = useRef({ x: 0, y: 0 });
  const view = useRef({ yaw: 0, pitch: 0, depth: 0 });
  const scratch = useMemo(() => ({ base: new THREE.Spherical().setFromVector3(cameraBase.clone().sub(cameraTarget)), orbit: new THREE.Spherical(), shake: new THREE.Vector3() }), []);
  useEffect(() => {
    if (calm) return;
    const move = (event: PointerEvent) => {
      pointer.current = { x: (event.clientX / window.innerWidth) * 2 - 1, y: (event.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [calm]);
  useStep((dt, t, { camera, gl }) => {
    const aim = view.current;
    const box = gl.domElement.getBoundingClientRect();
    const passed = calm || box.height === 0 ? 0 : THREE.MathUtils.clamp(-box.top / box.height, 0, 1);
    aim.depth = THREE.MathUtils.damp(aim.depth, passed, 6, dt);
    const swing = calm ? 0 : Math.sin(t * 0.05) * 0.14;
    aim.yaw = THREE.MathUtils.damp(aim.yaw, swing + (calm ? 0 : pointer.current.x * 0.06), 2.5, dt);
    aim.pitch = THREE.MathUtils.damp(aim.pitch, calm ? 0 : pointer.current.y * 0.04, 2.5, dt);
    scratch.orbit.copy(scratch.base);
    scratch.orbit.theta += aim.yaw;
    scratch.orbit.phi += aim.pitch - aim.depth * 0.18;
    scratch.orbit.radius *= 1 + aim.depth * 0.55;
    camera.position.setFromSpherical(scratch.orbit).add(cameraTarget);
    const since = seconds() - sealKick.current;
    if (!calm && since < 0.8) {
      const amount = 0.28 * Math.exp(-since * 6);
      scratch.shake.set(Math.sin(since * 83) * amount, Math.sin(since * 71 + 1.3) * amount, Math.sin(since * 59 + 2.1) * amount * 0.5);
      camera.position.add(scratch.shake);
    }
    camera.lookAt(cameraTarget);
  });
  return null;
}

function Labels({ anchors, nodes }: { anchors: Anchors; nodes: MutableRefObject<Map<string, HTMLDivElement>> }) {
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    nodes.current.forEach((node, key) => {
      const anchor = anchors.get(key);
      node.style.visibility = anchor ? "visible" : "hidden";
      if (!anchor) return;
      projected.copy(anchor).project(camera);
      node.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px, ${((1 - projected.y) / 2) * size.height}px) translate(-50%, -100%)`;
    });
  });
  return null;
}

function Tube({ tones }: { tones: Tones }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 240, tubeRadius, 32, false), []);
  return (
    <>
      <mesh geometry={geometry} renderOrder={2}>
        <meshStandardMaterial color={tones.hex.tube} emissive={tones.hex.tube} emissiveIntensity={0.5} roughness={0.35} transparent opacity={0.42} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometry} renderOrder={1}>
        <meshBasicMaterial color={tones.hex.tube} transparent opacity={0.18} depthWrite={false} side={THREE.BackSide} />
      </mesh>
    </>
  );
}

function Stream({ calm, tones }: { calm: boolean; tones: Tones }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(
    () => Array.from({ length: streamCount }, (_, i) => ({ offset: i / streamCount + Math.random() * 0.012, lateral: (Math.random() - 0.5) * 0.36, lift: (Math.random() - 0.5) * 0.3, spin: Math.random() * Math.PI, scale: 0.75 + Math.random() * 0.4 })),
    [],
  );
  const flow = useRef(0);
  const scratch = useMemo(() => ({ p: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3() }), []);
  useStep((dt) => {
    const instances = mesh.current;
    if (!instances) return;
    flow.current += dt * streamSpeed * (calm ? 0.3 : 1);
    seeds.forEach((seed, i) => {
      const u = (seed.offset + flow.current) % 1;
      pointAt(u, scratch.p);
      scratch.p.z += seed.lateral;
      scratch.p.y += seed.lift;
      scratch.e.set(seed.spin + flow.current * 20, seed.spin * 2 + flow.current * 14, 0);
      scratch.q.setFromEuler(scratch.e);
      scratch.s.setScalar(0.24 * seed.scale * smooth(0, 0.04, u) * (1 - smooth(0.96, 1, u)));
      scratch.m.compose(scratch.p, scratch.q, scratch.s);
      instances.setMatrixAt(i, scratch.m);
    });
    instances.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, streamCount]} frustumCulled={false}>
      <boxGeometry />
      <meshStandardMaterial color={tones.hex.stream} roughness={0.55} emissive={tones.hex.stream} emissiveIntensity={0.12} />
    </instancedMesh>
  );
}

function Dust({ calm, tones }: { calm: boolean; tones: Tones }) {
  const time = useRef(Math.random() * 100);
  const geometry = useMemo(() => {
    const positions = new Float32Array(dustCount * 3);
    const seed = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions.set([(Math.random() - 0.5) * 34, Math.random() * 7, -9 + Math.random() * 16], i * 3);
      seed.set([Math.random(), Math.random(), Math.random() ** 2], i * 3);
    }
    const built = new THREE.BufferGeometry();
    built.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    built.setAttribute("seed", new THREE.BufferAttribute(seed, 3));
    return built;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dustVertex,
        fragmentShader: dustFragment,
        uniforms: { uTime: { value: 0 }, uScale: { value: 22 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0.5 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uColor!.value.copy(tones.color.dust);
    material.uniforms.uOpacity!.value = tones.dust;
    material.blending = tones.additive;
    material.needsUpdate = true;
  }, [material, tones]);
  useStep((dt, _, { viewport }) => {
    time.current += dt * (calm ? 0.35 : 1);
    material.uniforms.uTime!.value = time.current;
    material.uniforms.uScale!.value = 22 * viewport.dpr;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function Detectors({ stage, votes, sealed, calm, tracked, tones }: SceneProps) {
  const bodies = useRef<(THREE.Mesh | null)[]>([]);
  const beams = useRef<(THREE.Mesh | null)[]>([]);
  const orbit = useRef(0);
  const scratch = useMemo(() => ({ pos: new THREE.Vector3(), aim: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  const beamGeometry = useMemo(() => new THREE.CylinderGeometry(0.02, 0.05, 1, 8, 1, true).translate(0, 0.5, 0), []);
  useStep((dt, now) => {
    orbit.current += dt * (calm ? 0.3 : 1);
    const t = orbit.current;
    const judging = stage === 2 && !sealed;
    [0, 1, 2].forEach((i) => {
      const body = bodies.current[i];
      const beam = beams.current[i];
      if (!body || !beam) return;
      const angle = t * 0.35 + (i * Math.PI * 2) / 3;
      scratch.pos.set(satelliteCenter.x + Math.cos(angle) * 2.1, satelliteCenter.y + Math.sin(t * 0.9 + i * 2) * (calm ? 0 : 0.12), satelliteCenter.z + Math.sin(angle) * 1.5);
      body.position.copy(scratch.pos);
      body.rotation.set(t * 0.6 + i, t * 0.8, 0);
      const cycle = (t * 0.42 + i * 0.33) % 1;
      const scan = cycle < 0.22 ? Math.sin((cycle / 0.22) * Math.PI) : 0;
      const voted = stage >= 2 && i < votes;
      const strength = judging ? (voted ? 0.9 : 0.3 + 0.3 * Math.sin(now * 6 + i)) : scan;
      if (judging) scratch.aim.copy(tracked.current);
      else pointAt(inspectU + Math.cos(angle) * 0.07, scratch.aim);
      scratch.dir.subVectors(scratch.aim, scratch.pos);
      beam.position.copy(scratch.pos);
      beam.scale.set(1, scratch.dir.length(), 1);
      beam.quaternion.setFromUnitVectors(scratch.up, scratch.dir.normalize());
      const beamMaterial = beam.material as THREE.MeshBasicMaterial;
      beamMaterial.opacity = strength * 0.75;
      beamMaterial.color.copy(tones.color.satellite);
      beamMaterial.blending = tones.additive;
      beam.visible = strength > 0.01;
      const material = body.material as THREE.MeshStandardMaterial;
      const tone = voted ? tones.color.resin : tones.color.satellite;
      material.color.copy(tone);
      material.emissive.copy(tone);
      material.emissiveIntensity = 0.25 + strength * 0.45;
      body.scale.setScalar(1 + (calm ? 0 : strength * 0.18));
    });
  });
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <mesh ref={(node) => { bodies.current[i] = node; }}>
            <octahedronGeometry args={[0.26, 0]} />
            <meshStandardMaterial roughness={0.3} metalness={0.4} flatShading />
          </mesh>
          <mesh ref={(node) => { beams.current[i] = node; }} geometry={beamGeometry}>
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Gates({ stage, calm, tones }: SceneProps) {
  const frames = useMemo(() => gateUs.map(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 })), []);
  const bars = useRef<(THREE.Mesh | null)[]>([]);
  const elapsed = useRef(0);
  const placements = useMemo(
    () =>
      gateUs.map((u) => {
        const tangent = curve.getTangentAt(u);
        return { position: curve.getPointAt(u), yaw: Math.atan2(tangent.x, tangent.z) };
      }),
    [],
  );
  useStep((dt) => {
    elapsed.current = stage === 4 ? elapsed.current + dt : 0;
    frames.forEach((material, i) => {
      const bar = bars.current[i];
      if (!bar) return;
      const since = elapsed.current - 0.3 - i * 0.45;
      const hit = stage === 4 && since > 0;
      const flash = hit ? Math.exp(-since * (calm ? 2 : 5)) : 0;
      material.color.copy(hit ? tones.color.resin : tones.color.lines).lerp(tones.color.text, flash * 0.6);
      material.opacity = hit ? 0.85 + flash * 0.15 : 0.4;
      bar.visible = hit;
      bar.scale.x = hit ? Math.min(1, since * (calm ? 100 : 6)) : 0.001;
    });
  });
  return (
    <>
      {placements.map(({ position, yaw }, i) => (
        <group key={gateNames[i]} position={[position.x, 0, position.z]} rotation={[0, yaw + Math.PI / 2, 0]}>
          {[-0.85, 0.85].map((x) => (
            <mesh key={x} position={[x, 0.85, 0]} material={frames[i]}>
              <boxGeometry args={[0.06, 1.7, 0.06]} />
            </mesh>
          ))}
          <mesh position={[0, 1.7, 0]} material={frames[i]}>
            <boxGeometry args={[1.76, 0.06, 0.06]} />
          </mesh>
          <mesh ref={(node) => { bars.current[i] = node; }} position={[0, 0.7, 0.02]} visible={false}>
            <boxGeometry args={[1.7, 0.08, 0.04]} />
            <meshBasicMaterial color={tones.hex.resin} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Shelf({ tones }: { tones: Tones }) {
  return (
    <group position={[shelfSlot.x, shelfSlot.y - 0.52, shelfSlot.z]}>
      <mesh>
        <boxGeometry args={[4.2, 0.12, 1.4]} />
        <meshStandardMaterial color={tones.hex.tube} roughness={0.7} emissive={tones.hex.tube} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.065, 0.7]}>
        <boxGeometry args={[4.2, 0.015, 0.015]} />
        <meshBasicMaterial color={tones.hex.text} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Shaft({ arrival, calm, tones }: { arrival: MutableRefObject<number>; calm: boolean; tones: Tones }) {
  const light = useRef<THREE.PointLight>(null);
  const glow = useRef(0);
  const height = 6;
  const geometry = useMemo(() => new THREE.CylinderGeometry(0.3, 1.6, height, 40, 1, true), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: shaftVertex,
        fragmentShader: shaftFragment,
        uniforms: { uColor: { value: new THREE.Color() }, uStrength: { value: 0 }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => {
    material.uniforms.uColor!.value.copy(tones.color.resin).lerp(tones.color.text, 0.35);
    material.blending = tones.additive;
    material.needsUpdate = true;
  }, [material, tones]);
  useStep((dt, t) => {
    glow.current = THREE.MathUtils.damp(glow.current, smooth(0.85, 1, arrival.current), calm ? 1.5 : 3, dt);
    material.uniforms.uStrength!.value = glow.current * (tones.theme === "dark" ? 0.22 : 0.35) * (calm ? 1 : 0.85 + 0.15 * Math.sin(t * 1.7));
    material.uniforms.uTime!.value = t;
    if (light.current) light.current.intensity = glow.current * 9;
  });
  return (
    <>
      <mesh geometry={geometry} material={material} position={[shelfSlot.x, shelfSlot.y - 0.46 + height / 2, shelfSlot.z]} renderOrder={4} />
      <pointLight ref={light} position={[shelfSlot.x, shelfSlot.y + 1.4, shelfSlot.z + 0.8]} color={tones.hex.resin} intensity={0} distance={7} decay={1.4} />
    </>
  );
}

function Tracked({ stage, votes, sealed, calm, tracked, anchors, arrival, tones }: SceneProps) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const ghosts = useRef<(THREE.Mesh | null)[]>([]);
  const resin = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);
  const motion = useRef({ u: stage >= 2 ? inspectU : 0.2, speed: streamSpeed * 4, sealTime: stage === 4 ? 10 : 0 });
  const shell = useMemo(() => createResinMaterial(0.9), []);
  const uniforms = shell.uniforms;
  const particles = useMemo(() => ({ positions: new Float32Array(particleCount * 3), colors: new Float32Array(particleCount * 3), velocity: new Float32Array(particleCount * 3), life: new Float32Array(particleCount), next: 0 }), []);
  const scratch = useMemo(() => ({ stream: new THREE.Vector3(), tangent: new THREE.Vector3(), label: new THREE.Vector3() }), []);
  const locking = sealed || stage >= 3;
  const glitchAt = useKick(stage >= 2 && votes > 0 && !locking);

  useEffect(() => tintResin(shell, tones), [shell, tones]);

  useEffect(() => {
    if (stage !== 0) return;
    motion.current = { u: 0.2, speed: streamSpeed * 4, sealTime: 0 };
    particles.life.fill(0);
  }, [stage, particles]);

  useStep((dt, t) => {
    const node = group.current;
    if (!node || !resin.current || !points.current || !core.current) return;
    const state = motion.current;
    node.visible = stage > 0;
    if (stage === 0) {
      anchors.delete("version");
      arrival.current = 0;
      return;
    }
    const cruise = streamSpeed * (0.25 + 3.5 * (1 - smooth(0.36, inspectU, state.u))) * (1 - smooth(inspectU + 0.02, inspectU + 0.07, state.u));
    state.speed = locking ? THREE.MathUtils.damp(state.speed, 0, 3, dt) : cruise * (calm ? 0.6 : 1);
    state.u = Math.min(state.u + state.speed * dt, 0.7);
    if (locking) state.sealTime += dt;
    pointAt(state.u, scratch.stream);
    const growDuration = calm ? 0.45 : 1.5;
    const liftStart = growDuration + (calm ? 0.3 : 0.5);
    const lift = easeInOut(THREE.MathUtils.clamp((state.sealTime - liftStart) / 1.9, 0, 1));
    arrival.current = lift;
    node.position.lerpVectors(scratch.stream, shelfSlot, lift);
    node.position.y += Math.sin(lift * Math.PI) * 1.1;
    const yaw = Math.atan2(curve.getTangentAt(state.u, scratch.tangent).x, scratch.tangent.z);
    node.rotation.set(0, yaw * (1 - lift) + (calm ? 0 : lift * Math.sin(t * 0.4) * 0.25), 0);
    tracked.current.copy(node.position);
    anchors.set("version", scratch.label.copy(node.position).setY(node.position.y + 0.75));
    const grow = THREE.MathUtils.clamp(state.sealTime / growDuration, 0, 1);
    uniforms.uProgress!.value = calm ? (locking ? 1 : 0) : grow;
    uniforms.uOpacity!.value = calm ? grow : 1;
    uniforms.uGlint!.value.set(Math.cos(t * 0.5), 0.8, Math.sin(t * 0.5));
    resin.current.visible = locking && state.sealTime > 0;
    const since = seconds() - glitchAt.current;
    const glitching = !calm && since < glitchSeconds;
    const step = Math.floor(since * 24);
    const fade = glitching ? 1 - since / glitchSeconds : 0;
    core.current.position.set(fade * jitter(step, 1) * 0.3, fade * jitter(step, 2) * 0.1, fade * jitter(step, 3) * 0.16);
    core.current.scale.set(1 + fade * jitter(step, 4) * 0.7, 1 + fade * jitter(step, 5) * 0.4, 1);
    const coreMaterial = core.current.material as THREE.MeshStandardMaterial;
    coreMaterial.color.copy(tones.color.tracked);
    coreMaterial.emissive.copy(glitching && step % 2 === 0 ? tones.color.resin : tones.color.tracked);
    coreMaterial.emissiveIntensity = glitching ? 0.6 : 0.18;
    ghosts.current.forEach((ghost, i) => {
      if (!ghost) return;
      ghost.visible = glitching;
      ghost.position.set(core.current!.position.x + (i === 0 ? 1 : -1) * (0.08 + Math.abs(jitter(step, 6 + i)) * 0.16), core.current!.position.y + jitter(step, 8 + i) * 0.06, 0);
      const ghostMaterial = ghost.material as THREE.MeshBasicMaterial;
      ghostMaterial.color.copy(i === 0 ? tones.color.resin : tones.color.stream);
      ghostMaterial.opacity = fade * 0.7;
      ghostMaterial.blending = tones.additive;
    });
    updateParticles(particles, locking && !calm && grow > 0.02 && grow < 1 ? grow : -1, node.position, dt, tones.color.resin);
    const geometry = points.current.geometry;
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={core}>
          <boxGeometry args={[0.46, 0.46, 0.46]} />
          <meshStandardMaterial roughness={0.4} />
        </mesh>
        {[0, 1].map((i) => (
          <mesh key={i} ref={(node) => { ghosts.current[i] = node; }} visible={false}>
            <boxGeometry args={[0.46, 0.46, 0.46]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
        <RoundedBox ref={resin} args={[0.9, 0.9, 0.9]} radius={0.1} smoothness={3} visible={false} renderOrder={3} material={shell} />
      </group>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[particles.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.07} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </points>
    </>
  );
}

function updateParticles(state: { positions: Float32Array; colors: Float32Array; velocity: Float32Array; life: Float32Array; next: number }, edge: number, origin: THREE.Vector3, dt: number, tint: THREE.Color) {
  const spawn = edge >= 0 ? Math.ceil(dt * 140) : 0;
  for (let k = 0; k < spawn; k++) {
    const i = state.next;
    state.next = (state.next + 1) % particleCount;
    const angle = Math.random() * Math.PI * 2;
    const height = (edge - 0.5) * 0.9 + (Math.random() - 0.5) * 0.15;
    state.positions.set([origin.x + Math.cos(angle) * 0.47, origin.y + height, origin.z + Math.sin(angle) * 0.47], i * 3);
    state.velocity.set([Math.cos(angle) * (0.5 + Math.random() * 0.6), 0.3 + Math.random() * 0.6, Math.sin(angle) * (0.5 + Math.random() * 0.6)], i * 3);
    state.life[i] = 0.6 + Math.random() * 0.6;
  }
  for (let i = 0; i < particleCount; i++) {
    const life = Math.max(0, state.life[i]! - dt);
    state.life[i] = life;
    for (let a = 0; a < 3; a++) {
      state.velocity[i * 3 + a]! *= 1 - dt * 1.8;
      state.positions[i * 3 + a]! += state.velocity[i * 3 + a]! * dt;
    }
    const glow = Math.min(life, 0.6) * 6;
    state.colors.set([tint.r * glow, tint.g * glow, tint.b * glow], i * 3);
  }
}

function Effects({ calm, sealKick, tones }: { calm: boolean; sealKick: Kick; tones: Tones }) {
  const aberration = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(), []);
  useFrame(() => {
    const since = seconds() - sealKick.current;
    const pulse = !calm && since < 1.2 ? Math.exp(-since * 4) * 0.006 : 0;
    aberration.current?.offset.set(pulse, pulse * 0.6);
  });
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={tones.bloom} radius={0.7} />
      <ChromaticAberration ref={aberration} offset={offset} radialModulation={false} modulationOffset={0} />
      <Noise premultiply opacity={tones.grain} />
      <Vignette offset={0.32} darkness={tones.theme === "dark" ? 0.55 : 0.25} />
    </EffectComposer>
  );
}

function Scene(props: SceneProps & { labelNodes: MutableRefObject<Map<string, HTMLDivElement>> }) {
  const { tones, calm } = props;
  return (
    <>
      <fog attach="fog" args={[tones.hex.ground, 16, 40]} />
      <hemisphereLight args={[tones.theme === "dark" ? tones.hex.text : "#FFFFFF", tones.hex.tube, tones.theme === "dark" ? 0.9 : 1.3]} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} color={tones.theme === "dark" ? tones.hex.text : "#FFFFFF"} />
      <CameraRig calm={calm} sealKick={props.sealKick} />
      <Labels anchors={props.anchors} nodes={props.labelNodes} />
      <Grid args={[80, 80]} cellSize={1} cellThickness={0.6} cellColor={tones.hex.gridCell} sectionSize={5} sectionThickness={1} sectionColor={tones.hex.gridSection} fadeDistance={34} fadeStrength={2} infiniteGrid />
      <Tube tones={tones} />
      <Stream calm={calm} tones={tones} />
      <Dust calm={calm} tones={tones} />
      <Detectors {...props} />
      <Gates {...props} />
      <Shelf tones={tones} />
      <Shaft arrival={props.arrival} calm={calm} tones={tones} />
      <Tracked {...props} />
      {props.ascii ? (
        <>
          <color attach="background" args={[tones.theme === "dark" ? "#000000" : "#FFFFFF"]} />
          <AsciiRenderer characters={asciiCharacters} fgColor={tones.hex.text} bgColor="transparent" invert={tones.theme === "dark"} resolution={0.16} />
        </>
      ) : (
        <Effects calm={calm} sealKick={props.sealKick} tones={tones} />
      )}
    </>
  );
}

const staticAnchors = (): Anchors =>
  new Map([
    ...gateUs.map((u, i): [string, THREE.Vector3] => [gateNames[i]!, curve.getPointAt(u).setY(-0.15).add(new THREE.Vector3(0, 0, 1.1))]),
    ["vault", new THREE.Vector3(shelfSlot.x - 1.6, shelfSlot.y - 0.75, shelfSlot.z + 0.8)],
  ]);

const labelStyle: CSSProperties = { position: "absolute", left: 0, top: 0, fontFamily: labelFont, fontSize: 10, letterSpacing: "0.08em", opacity: 0.6, whiteSpace: "nowrap", pointerEvents: "none", visibility: "hidden" };

export function VaultScene(props: VaultSceneProps) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const labelNodes = useRef(new Map<string, HTMLDivElement>());
  const anchors = useMemo(staticAnchors, []);
  const tracked = useRef(new THREE.Vector3());
  const arrival = useRef(0);
  const calm = useCalm();
  const tones = useTones();
  const active = useActive(wrapper);
  const locking = props.sealed || props.stage >= 3;
  const sealKick = useKick(locking);
  const status = locking ? "sealed" : props.stage >= 2 ? `votes ${props.votes}${props.quorum ? ` of ${props.quorum}` : ""}` : "inspecting";
  const register = (key: string) => (node: HTMLDivElement | null) => {
    if (node) labelNodes.current.set(key, node);
    else labelNodes.current.delete(key);
  };
  return (
    <div ref={wrapper} data-ascii={props.ascii ? "" : undefined} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", color: tones.hex.text }}>
      {props.ascii && <style>{"[data-ascii] table { font-family: var(--font-mono, ui-monospace, monospace) !important; }"}</style>}
      <Canvas dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 120, position: cameraBase.toArray() }} gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }} style={{ background: "transparent" }}>
        <FrameGate active={active} />
        <Scene {...props} calm={calm} tones={tones} anchors={anchors} tracked={tracked} arrival={arrival} sealKick={sealKick} labelNodes={labelNodes} />
      </Canvas>
      {[...gateNames, "vault"].map((name) => (
        <div key={name} ref={register(name)} style={labelStyle}>
          {name}
        </div>
      ))}
      {props.stage > 0 && (
        <div ref={register("version")} style={{ ...labelStyle, fontSize: 11, lineHeight: 1.35, opacity: 1, letterSpacing: 0, padding: "3px 7px", background: tones.theme === "dark" ? "rgba(26, 15, 20, 0.78)" : "rgba(242, 237, 228, 0.85)", borderLeft: `2px solid ${locking ? tones.hex.resin : tones.hex.satellite}` }}>
          <div>{props.versionLabel ?? "version"}</div>
          <div style={{ opacity: 0.75, color: locking ? tones.hex.resin : tones.hex.text }}>{status}</div>
        </div>
      )}
    </div>
  );
}

export default VaultScene;
