"use client";

import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { SlotCanvas, placeInSlot, useCalm, useKick, useStep, useTones, type Tones } from "./sceneKit";

export type BreakerState = "serving" | "stopped" | "unavailable";
export type BreakerItem = { id: string; state: BreakerState };

const leverAngle: Record<BreakerState, number> = { serving: 0, stopped: 0.62, unavailable: 0.26 };
const modelWidth = 210;
const sparkCount = 48;
const pivot = new THREE.Vector3(-50, -14, 16);
const contact = new THREE.Vector3(50, -14, 16);

export default function BreakerScene({ items, slots }: { items: BreakerItem[]; slots: MutableRefObject<Map<string, HTMLElement>> }) {
  return (
    <SlotCanvas>
      {items.map((item) => (
        <Breaker key={item.id} item={item} slots={slots} />
      ))}
    </SlotCanvas>
  );
}

function Breaker({ item, slots }: { item: BreakerItem; slots: MutableRefObject<Map<string, HTMLElement>> }) {
  const calm = useCalm();
  const tones = useTones();
  const root = useRef<THREE.Group>(null);
  const lever = useRef<THREE.Group>(null);
  const sparkPoints = useRef<THREE.Points>(null);
  const spring = useRef({ angle: leverAngle[item.state], velocity: 0 });
  const kick = useKick(item.state === "stopped");
  const burst = useRef(kick.current);
  const live = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.35, emissiveIntensity: 0.45 }), []);
  const sparks = useMemo(() => ({ positions: new Float32Array(sparkCount * 3), colors: new Float32Array(sparkCount * 3), velocity: new Float32Array(sparkCount * 3), life: new Float32Array(sparkCount) }), []);
  const target = useMemo(() => new THREE.Color(), []);

  useStep((dt, t, { gl }) => {
    const group = root.current;
    if (!group || !lever.current || !sparkPoints.current) return;
    placeInSlot(group, slots.current.get(item.id), gl.domElement.getBoundingClientRect(), modelWidth);
    const state = spring.current;
    const stiffness = calm ? 260 : 210;
    const damping = calm ? 32 : 9;
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      state.velocity += (-(state.angle - leverAngle[item.state]) * stiffness - state.velocity * damping) * h;
      state.angle += state.velocity * h;
    }
    lever.current.rotation.z = state.angle;
    target.copy(item.state === "stopped" ? tones.color.resin : tones.color.stream);
    if (item.state === "unavailable") target.lerp(tones.color.lines, 0.5);
    live.color.lerp(target, 1 - Math.exp(-dt * 8));
    live.emissive.copy(live.color);
    live.emissiveIntensity = item.state === "serving" && !calm ? 0.35 + 0.12 * Math.sin(t * 3) : 0.4;
    if (burst.current !== kick.current) {
      burst.current = kick.current;
      if (!calm) igniteSparks(sparks);
    }
    stepSparks(sparks, dt, tones);
    sparkPoints.current.geometry.attributes.position!.needsUpdate = true;
    sparkPoints.current.geometry.attributes.color!.needsUpdate = true;
  });

  return (
    <group ref={root} rotation={[0.5, -0.32, 0, "YXZ"]}>
      <mesh position={[0, 0, -5]}>
        <boxGeometry args={[200, 84, 10]} />
        <meshStandardMaterial color={tones.hex.tube} emissive={tones.hex.tube} emissiveIntensity={tones.theme === "dark" ? 0.6 : 0} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 1]}>
        <boxGeometry args={[188, 72, 2]} />
        <meshStandardMaterial color={tones.hex.surface} roughness={0.9} />
      </mesh>
      {[pivot, contact].map((at, i) => (
        <mesh key={i} position={[at.x, at.y, 7]} rotation={[Math.PI / 2, 0, 0]} material={i === 0 ? undefined : live}>
          <cylinderGeometry args={[9, 10, 14, 24]} />
          {i === 0 && <meshStandardMaterial color={tones.hex.satellite} metalness={0.6} roughness={0.35} />}
        </mesh>
      ))}
      {[-79, 79].map((x) => (
        <mesh key={x} position={[x, -14, 4]} material={live}>
          <boxGeometry args={[42, 3, 3]} />
        </mesh>
      ))}
      <group ref={lever} position={pivot}>
        <mesh position={[50, 0, 0]}>
          <boxGeometry args={[100, 7, 7]} />
          <meshStandardMaterial color={tones.hex.satellite} metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[100, 0, 0]} material={live}>
          <sphereGeometry args={[9, 20, 14]} />
        </mesh>
      </group>
      <points ref={sparkPoints} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparks.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[sparks.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={4} sizeAttenuation={false} vertexColors transparent depthWrite={false} blending={tones.additive} toneMapped={false} />
      </points>
    </group>
  );
}

function igniteSparks(sparks: { positions: Float32Array; velocity: Float32Array; life: Float32Array }) {
  for (let i = 0; i < sparkCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 260;
    sparks.positions.set([contact.x, contact.y, contact.z + 6], i * 3);
    sparks.velocity.set([Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed + 60, (Math.random() - 0.3) * 160], i * 3);
    sparks.life[i] = 0.35 + Math.random() * 0.45;
  }
}

function stepSparks(sparks: { positions: Float32Array; colors: Float32Array; velocity: Float32Array; life: Float32Array }, dt: number, tones: Tones) {
  const hot = tones.color.resin;
  for (let i = 0; i < sparkCount; i++) {
    const life = Math.max(0, sparks.life[i]! - dt);
    sparks.life[i] = life;
    if (life === 0) {
      sparks.positions[i * 3 + 2] = 1e5;
      continue;
    }
    sparks.velocity[i * 3 + 1]! -= 700 * dt;
    for (let a = 0; a < 3; a++) sparks.positions[i * 3 + a]! += sparks.velocity[i * 3 + a]! * dt;
    const glow = tones.theme === "dark" ? Math.min(life * 3, 1) * 2.2 : 1;
    const white = tones.theme === "dark" ? Math.min(life * 2, 1) * 0.5 : 0;
    sparks.colors.set([(hot.r + white) * glow, (hot.g + white) * glow, (hot.b + white) * glow], i * 3);
  }
}
