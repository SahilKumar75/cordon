"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { useTheme, type Theme } from "@/lib/useTheme";

type ToneName = "ground" | "surface" | "tube" | "stream" | "satellite" | "tracked" | "resin" | "lines" | "dust" | "text" | "gridCell" | "gridSection";

const hexes: Record<Theme, Record<ToneName, string>> = {
  dark: {
    ground: "#1A0F14",
    surface: "#241820",
    tube: "#351E28",
    stream: "#AEB8A0",
    satellite: "#C8794A",
    tracked: "#F2EDE4",
    resin: "#FF5C34",
    lines: "#AEB8A0",
    dust: "#C8794A",
    text: "#F2EDE4",
    gridCell: "#351E28",
    gridSection: "#4A2B38",
  },
  light: {
    ground: "#F2EDE4",
    surface: "#E6DFD3",
    tube: "#B9A794",
    stream: "#6F7D62",
    satellite: "#A85F33",
    tracked: "#1A0F14",
    resin: "#E2441A",
    lines: "#8A7F73",
    dust: "#A85F33",
    text: "#1A0F14",
    gridCell: "#D9CFC2",
    gridSection: "#C9BCAD",
  },
};

export type Tones = {
  theme: Theme;
  hex: Record<ToneName, string>;
  color: Record<ToneName, THREE.Color>;
  grain: number;
  bloom: number;
  dust: number;
  additive: THREE.Blending;
};

const buildTones = (theme: Theme): Tones => ({
  theme,
  hex: hexes[theme],
  color: Object.fromEntries(Object.entries(hexes[theme]).map(([name, value]) => [name, new THREE.Color(value)])) as Record<ToneName, THREE.Color>,
  grain: theme === "dark" ? 0.32 : 0.12,
  bloom: theme === "dark" ? 1.4 : 0.6,
  dust: theme === "dark" ? 0.4 : 0.3,
  additive: theme === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending,
});

const allTones: Record<Theme, Tones> = { dark: buildTones("dark"), light: buildTones("light") };

export const useTones = () => allTones[useTheme()];

export function useCalm() {
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

export function useStep(step: (dt: number, t: number, state: RootState) => void) {
  const clock = useRef({ last: 0, t: 0 });
  useFrame((state) => {
    const now = performance.now() / 1000;
    const dt = clock.current.last === 0 ? 0 : Math.min(now - clock.current.last, 0.1);
    clock.current.last = now;
    clock.current.t += dt;
    step(dt, clock.current.t, state);
  });
}

export function FrameGate({ active }: { active: boolean }) {
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    setFrameloop(active ? "always" : "never");
    if (active) invalidate();
  }, [active, setFrameloop, invalidate]);
  return null;
}

export function useActive(target: MutableRefObject<HTMLDivElement | null>) {
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

export const seconds = () => performance.now() / 1000;

export function useKick(on: boolean) {
  const at = useRef(Number.NEGATIVE_INFINITY);
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) at.current = seconds();
    was.current = on;
  }, [on]);
  return at;
}

const resinVertex = `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  vObj = position;
  mat4 model = modelMatrix;
  #ifdef USE_INSTANCING
  model = modelMatrix * instanceMatrix;
  #endif
  vec4 world = model * vec4(position, 1.0);
  vNormalW = normalize(mat3(model) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const resinFragment = `
uniform float uProgress;
uniform float uOpacity;
uniform float uSize;
uniform float uGlintStrength;
uniform vec3 uGlint;
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
  vec3 p = vObj / uSize;
  float n = noise(p * 5.4) * 0.66 + noise(p * 12.6) * 0.34;
  float m = mix(n, p.y + 0.5, 0.5);
  float reveal = uProgress * 1.25 - 0.12;
  if (m > reveal) discard;
  float edge = smoothstep(reveal - 0.07, reveal, m) * step(uProgress, 0.999);
  vec3 normalW = normalize(vNormalW);
  float fres = pow(1.0 - abs(dot(normalW, vView)), 2.0);
  float glint = pow(max(dot(reflect(-normalize(uGlint), normalW), vView), 0.0), 28.0) * uGlintStrength;
  vec3 body = uColor * (0.45 + 0.9 * fres) + vec3(1.0, 0.93, 0.85) * glint;
  float alpha = 0.5 + 0.4 * fres + glint;
  gl_FragColor = vec4(mix(body, uEdge, edge), min(1.0, mix(alpha, 1.0, edge)) * uOpacity);
  #include <colorspace_fragment>
}`;

export function createResinMaterial(size: number) {
  return new THREE.ShaderMaterial({
    vertexShader: resinVertex,
    fragmentShader: resinFragment,
    uniforms: {
      uProgress: { value: 1 },
      uOpacity: { value: 1 },
      uSize: { value: size },
      uGlintStrength: { value: 0.5 },
      uGlint: { value: new THREE.Vector3(0.6, 0.8, 0.4) },
      uColor: { value: new THREE.Color() },
      uEdge: { value: new THREE.Color() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export function tintResin(material: THREE.ShaderMaterial, tones: Tones) {
  material.uniforms.uColor!.value.copy(tones.color.resin);
  material.uniforms.uEdge!.value.copy(tones.color.resin).multiplyScalar(6);
}

export function placeInSlot(object: THREE.Object3D, slot: HTMLElement | undefined, canvas: DOMRect, modelWidth: number, along = 0.5) {
  object.visible = Boolean(slot);
  if (!slot) return 0;
  const rect = slot.getBoundingClientRect();
  object.position.set(rect.left + rect.width / 2 - canvas.left - canvas.width / 2, canvas.top + canvas.height / 2 - (rect.top + rect.height * along), 0);
  const scale = rect.width / modelWidth;
  object.scale.setScalar(scale);
  return scale;
}

export function SlotCanvas({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const active = useActive(wrapper);
  const tones = useTones();
  return (
    <div ref={wrapper} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <Canvas
        orthographic
        dpr={[1, 2]}
        camera={{ position: [0, 0, 800], near: 1, far: 2000, zoom: 1 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ background: "transparent" }}
      >
        <FrameGate active={active} />
        <hemisphereLight args={["#FFF4E6", tones.hex.tube, 1.2]} />
        <directionalLight position={[300, 500, 600]} intensity={1.8} color="#FFF4E6" />
        <directionalLight position={[-400, -100, 300]} intensity={0.4} color={tones.hex.satellite} />
        {children}
      </Canvas>
    </div>
  );
}
