"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "@react-three/drei";
import { SlotCanvas, createResinMaterial, placeInSlot, tintResin, useCalm, useStep, useTones } from "./sceneKit";

export type ShelfItem = { key: string; sealed: boolean };

type ShelfProps = { items: ShelfItem[]; slots: MutableRefObject<Map<string, HTMLElement>>; hovered: MutableRefObject<string | null> };

const blockSize = 70;
const modelWidth = 192;

export default function VaultShelfScene(props: ShelfProps) {
  return (
    <SlotCanvas>
      <Blocks key={props.items.length} {...props} />
    </SlotCanvas>
  );
}

function Blocks({ items, slots, hovered }: ShelfProps) {
  const calm = useCalm();
  const tones = useTones();
  const shells = useRef<THREE.InstancedMesh>(null);
  const cores = useRef<THREE.InstancedMesh>(null);
  const shell = useMemo(() => createResinMaterial(blockSize), []);
  const motion = useMemo(() => Array.from({ length: items.length }, (_, i) => ({ spin: i * 1.7, lift: 0 })), [items.length]);
  const scratch = useMemo(() => ({ anchor: new THREE.Object3D(), p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), m: new THREE.Matrix4() }), []);

  useEffect(() => tintResin(shell, tones), [shell, tones]);

  useEffect(() => {
    items.forEach((item, i) => cores.current?.setColorAt(i, item.sealed ? tones.color.tracked : tones.color.stream));
    if (cores.current?.instanceColor) cores.current.instanceColor.needsUpdate = true;
  }, [items, tones]);

  useStep((dt, t, { gl }) => {
    if (!shells.current || !cores.current) return;
    const canvas = gl.domElement.getBoundingClientRect();
    shell.uniforms.uGlint!.value.set(Math.cos(t * 0.6), 0.7, 0.6 + Math.sin(t * 0.6) * 0.4);
    shell.uniforms.uGlintStrength!.value = 0.7;
    items.forEach((item, i) => {
      const state = motion[i]!;
      const scale = placeInSlot(scratch.anchor, slots.current.get(item.key), canvas, modelWidth, 0.62);
      const visible = scratch.anchor.visible;
      state.lift = THREE.MathUtils.damp(state.lift, hovered.current === item.key ? 1 : 0, calm ? 20 : 9, dt);
      state.spin += dt * (calm ? 0.12 : 0.35 + state.lift * 1.4);
      const bob = calm ? 0 : Math.sin(t * 1.1 + i) * 2;
      scratch.p.copy(scratch.anchor.position).setY(scratch.anchor.position.y + (state.lift * 16 + bob) * scale);
      scratch.e.set(0.42 - state.lift * 0.12, state.spin, 0);
      scratch.q.setFromEuler(scratch.e);
      scratch.s.setScalar(visible && item.sealed ? scale * (1 + state.lift * 0.08) : 0);
      shells.current!.setMatrixAt(i, scratch.m.compose(scratch.p, scratch.q, scratch.s));
      scratch.e.set(0.42 + state.spin * 0.4, -state.spin * 0.7, state.spin * 0.25);
      scratch.q.setFromEuler(scratch.e);
      scratch.s.setScalar(visible ? scale * (item.sealed ? 1 : 1.3) : 0);
      cores.current!.setMatrixAt(i, scratch.m.compose(scratch.p, scratch.q, scratch.s));
    });
    shells.current.instanceMatrix.needsUpdate = true;
    cores.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={cores} args={[undefined, undefined, items.length]} frustumCulled={false}>
        <boxGeometry args={[26, 26, 26]} />
        <meshStandardMaterial roughness={0.4} emissive={tones.hex.tracked} emissiveIntensity={0.08} />
      </instancedMesh>
      <instancedMesh ref={shells} args={[undefined, undefined, items.length]} material={shell} frustumCulled={false} renderOrder={2}>
        <RoundedBoxGeometry args={[blockSize, blockSize, blockSize]} radius={9} smoothness={3} />
      </instancedMesh>
    </>
  );
}
