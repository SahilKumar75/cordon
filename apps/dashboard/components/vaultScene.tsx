"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { Grid, RoundedBox } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";

export type VaultSceneProps = {
  stage: 0 | 1 | 2 | 3 | 4;
  votes: number;
  quorum: number | null;
  sealed: boolean;
  versionLabel: string | null;
};

type Anchors = Map<string, THREE.Vector3>;
type SceneProps = VaultSceneProps & { calm: boolean; anchors: Anchors; tracked: MutableRefObject<THREE.Vector3> };

const hex = { ground: "#1A0F14", plum: "#351E28", persimmon: "#FF5C34", jade: "#AEB8A0", bone: "#F2EDE4", copper: "#C8794A" };
const colors = {
  persimmon: new THREE.Color(hex.persimmon),
  jade: new THREE.Color(hex.jade),
  bone: new THREE.Color(hex.bone),
  copper: new THREE.Color(hex.copper),
};
const edgeGlow = colors.persimmon.clone().multiplyScalar(6);

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
const labelFont = "var(--font-mono, ui-monospace, monospace)";

const pointAt = (u: number, out: THREE.Vector3) => {
  const f = THREE.MathUtils.clamp(u, 0, 1) * sampleCount;
  const i = Math.min(Math.floor(f), sampleCount - 1);
  return out.lerpVectors(samples[i]!, samples[i + 1]!, f - i);
};

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

const resinVertex = `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  vObj = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const resinFragment = `
uniform float uProgress;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uEdge;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vView;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
void main() {
  float n = noise(vObj * 6.0) * 0.66 + noise(vObj * 14.0) * 0.34;
  float m = mix(n, vObj.y / 0.9 + 0.5, 0.5);
  float reveal = uProgress * 1.25 - 0.12;
  if (m > reveal) discard;
  float edge = smoothstep(reveal - 0.07, reveal, m) * step(uProgress, 0.999);
  float fres = pow(1.0 - abs(dot(normalize(vNormalW), vView)), 2.0);
  vec3 body = uColor * (0.45 + 0.9 * fres);
  float alpha = 0.5 + 0.4 * fres;
  gl_FragColor = vec4(mix(body, uEdge, edge), mix(alpha, 1.0, edge) * uOpacity);
  #include <colorspace_fragment>
}`;

function useStep(step: (dt: number, t: number, state: RootState) => void) {
  const clock = useRef({ last: 0, t: 0 });
  useFrame((state) => {
    const now = performance.now() / 1000;
    const dt = clock.current.last === 0 ? 0 : Math.min(now - clock.current.last, 0.1);
    clock.current.last = now;
    clock.current.t += dt;
    step(dt, clock.current.t, state);
  });
}

function useReducedMotion() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setCalm(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return calm;
}

function useActive(target: MutableRefObject<HTMLDivElement | null>) {
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const node = target.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
    observer.observe(node);
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [target]);
  return inView && visible;
}

function CameraRig({ calm }: { calm: boolean }) {
  const drift = useMemo(() => new THREE.Vector3(), []);
  useStep((_, t, { camera }) => {
    drift.set(Math.sin(t * 0.11) * 0.9, Math.sin(t * 0.08) * 0.3, Math.cos(t * 0.09) * 0.5);
    camera.position.copy(cameraBase);
    if (!calm) camera.position.add(drift);
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

function Tube() {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 240, tubeRadius, 32, false), []);
  return (
    <>
      <mesh geometry={geometry} renderOrder={2}>
        <meshStandardMaterial color={hex.plum} emissive={hex.plum} emissiveIntensity={0.5} roughness={0.35} transparent opacity={0.42} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geometry} renderOrder={1}>
        <meshBasicMaterial color={hex.plum} transparent opacity={0.18} depthWrite={false} side={THREE.BackSide} />
      </mesh>
    </>
  );
}

function Stream({ calm }: { calm: boolean }) {
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
      <meshStandardMaterial color={hex.jade} roughness={0.55} emissive={hex.jade} emissiveIntensity={0.12} />
    </instancedMesh>
  );
}

function Detectors({ stage, votes, sealed, calm, tracked }: SceneProps) {
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
      (beam.material as THREE.MeshBasicMaterial).opacity = strength * 0.75;
      beam.visible = strength > 0.01;
      const material = body.material as THREE.MeshStandardMaterial;
      material.color.copy(voted ? colors.persimmon : colors.copper);
      material.emissive.copy(voted ? colors.persimmon : colors.copper);
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
            <meshStandardMaterial color={hex.copper} roughness={0.3} metalness={0.4} flatShading />
          </mesh>
          <mesh ref={(node) => { beams.current[i] = node; }} geometry={beamGeometry}>
            <meshBasicMaterial color={hex.copper} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Gates({ stage, calm }: SceneProps) {
  const frames = useMemo(() => gateUs.map(() => new THREE.MeshBasicMaterial({ color: hex.jade, transparent: true, opacity: 0.4 })), []);
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
      material.color.copy(hit ? colors.persimmon : colors.jade).lerp(colors.bone, flash * 0.6);
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
            <meshBasicMaterial color={hex.persimmon} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Shelf() {
  return (
    <group position={[shelfSlot.x, shelfSlot.y - 0.52, shelfSlot.z]}>
      <mesh>
        <boxGeometry args={[4.2, 0.12, 1.4]} />
        <meshStandardMaterial color={hex.plum} roughness={0.7} emissive={hex.plum} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0.065, 0.7]}>
        <boxGeometry args={[4.2, 0.015, 0.015]} />
        <meshBasicMaterial color={hex.bone} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Tracked({ stage, sealed, calm, tracked, anchors }: SceneProps) {
  const group = useRef<THREE.Group>(null);
  const resin = useRef<THREE.Mesh>(null);
  const points = useRef<THREE.Points>(null);
  const motion = useRef({ u: stage >= 2 ? inspectU : 0.2, speed: streamSpeed * 4, sealTime: stage === 4 ? 10 : 0 });
  const shell = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: resinVertex,
        fragmentShader: resinFragment,
        uniforms: { uProgress: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: colors.persimmon.clone() }, uEdge: { value: edgeGlow } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  );
  const uniforms = shell.uniforms;
  const particles = useMemo(() => ({ positions: new Float32Array(particleCount * 3), colors: new Float32Array(particleCount * 3), velocity: new Float32Array(particleCount * 3), life: new Float32Array(particleCount), next: 0 }), []);
  const scratch = useMemo(() => ({ stream: new THREE.Vector3(), tangent: new THREE.Vector3(), label: new THREE.Vector3() }), []);
  const locking = sealed || stage >= 3;

  useEffect(() => {
    if (stage !== 0) return;
    motion.current = { u: 0.2, speed: streamSpeed * 4, sealTime: 0 };
    particles.life.fill(0);
  }, [stage, particles]);

  useStep((dt) => {
    const node = group.current;
    if (!node || !resin.current || !points.current) return;
    const state = motion.current;
    node.visible = stage > 0;
    if (stage === 0) {
      anchors.delete("version");
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
    node.position.lerpVectors(scratch.stream, shelfSlot, lift);
    node.position.y += Math.sin(lift * Math.PI) * 1.1;
    const yaw = Math.atan2(curve.getTangentAt(state.u, scratch.tangent).x, scratch.tangent.z);
    node.rotation.set(0, yaw * (1 - lift), 0);
    tracked.current.copy(node.position);
    anchors.set("version", scratch.label.copy(node.position).setY(node.position.y + 0.75));
    const grow = THREE.MathUtils.clamp(state.sealTime / growDuration, 0, 1);
    uniforms.uProgress!.value = calm ? (locking ? 1 : 0) : grow;
    uniforms.uOpacity!.value = calm ? grow : 1;
    resin.current.visible = locking && state.sealTime > 0;
    updateParticles(particles, locking && !calm && grow > 0.02 && grow < 1 ? grow : -1, node.position, dt);
    const geometry = points.current.geometry;
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
  });

  return (
    <>
      <group ref={group} visible={false}>
        <mesh>
          <boxGeometry args={[0.46, 0.46, 0.46]} />
          <meshStandardMaterial color={hex.bone} roughness={0.4} emissive={hex.bone} emissiveIntensity={0.18} />
        </mesh>
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

function updateParticles(state: { positions: Float32Array; colors: Float32Array; velocity: Float32Array; life: Float32Array; next: number }, edge: number, origin: THREE.Vector3, dt: number) {
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
    state.colors.set([colors.persimmon.r * glow, colors.persimmon.g * glow, colors.persimmon.b * glow], i * 3);
  }
}

function Scene(props: SceneProps & { labelNodes: MutableRefObject<Map<string, HTMLDivElement>> }) {
  return (
    <>
      <fog attach="fog" args={[hex.ground, 16, 40]} />
      <hemisphereLight args={[hex.bone, hex.plum, 0.9]} />
      <directionalLight position={[6, 10, 6]} intensity={1.1} color={hex.bone} />
      <CameraRig calm={props.calm} />
      <Labels anchors={props.anchors} nodes={props.labelNodes} />
      <Grid args={[80, 80]} cellSize={1} cellThickness={0.6} cellColor={hex.plum} sectionSize={5} sectionThickness={1} sectionColor="#4A2B38" fadeDistance={34} fadeStrength={2} infiniteGrid />
      <Tube />
      <Stream calm={props.calm} />
      <Detectors {...props} />
      <Gates {...props} />
      <Shelf />
      <Tracked {...props} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={1.4} radius={0.7} />
      </EffectComposer>
    </>
  );
}

const staticAnchors = (): Anchors =>
  new Map([
    ...gateUs.map((u, i): [string, THREE.Vector3] => [gateNames[i]!, curve.getPointAt(u).setY(-0.15).add(new THREE.Vector3(0, 0, 1.1))]),
    ["vault", new THREE.Vector3(shelfSlot.x - 1.6, shelfSlot.y - 0.75, shelfSlot.z + 0.8)],
  ]);

const labelStyle: CSSProperties = { position: "absolute", left: 0, top: 0, fontFamily: labelFont, fontSize: 10, letterSpacing: "0.08em", color: hex.bone, opacity: 0.6, whiteSpace: "nowrap", pointerEvents: "none", visibility: "hidden" };

export function VaultScene(props: VaultSceneProps) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const labelNodes = useRef(new Map<string, HTMLDivElement>());
  const anchors = useMemo(staticAnchors, []);
  const tracked = useRef(new THREE.Vector3());
  const calm = useReducedMotion();
  const active = useActive(wrapper);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const probe = document.createElement("canvas");
    setSupported(Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl")));
  }, []);
  if (supported === false) return null;
  const locking = props.sealed || props.stage >= 3;
  const status = locking ? "sealed" : props.stage >= 2 ? `votes ${props.votes}${props.quorum ? ` of ${props.quorum}` : ""}` : "inspecting";
  const register = (key: string) => (node: HTMLDivElement | null) => {
    if (node) labelNodes.current.set(key, node);
    else labelNodes.current.delete(key);
  };
  return (
    <div ref={wrapper} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {supported && (
        <Canvas dpr={[1, 2]} frameloop={active ? "always" : "never"} camera={{ fov: 30, near: 0.1, far: 120, position: cameraBase.toArray() }} gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }} style={{ background: "transparent" }}>
          <Scene {...props} calm={calm} anchors={anchors} tracked={tracked} labelNodes={labelNodes} />
        </Canvas>
      )}
      {[...gateNames, "vault"].map((name) => (
        <div key={name} ref={register(name)} style={labelStyle}>
          {name}
        </div>
      ))}
      {props.stage > 0 && (
        <div ref={register("version")} style={{ ...labelStyle, fontSize: 11, lineHeight: 1.35, opacity: 1, letterSpacing: 0, padding: "3px 7px", background: "rgba(26, 15, 20, 0.78)", borderLeft: `2px solid ${locking ? hex.persimmon : hex.copper}` }}>
          <div>{props.versionLabel ?? "version"}</div>
          <div style={{ opacity: 0.75, color: locking ? hex.persimmon : hex.bone }}>{status}</div>
        </div>
      )}
    </div>
  );
}

export default VaultScene;
