import type { ReactNode } from "react";

export type GlyphState = { active: boolean; alarm: boolean };

export type GlyphName = "registry" | "staticScripts" | "sandboxCanary" | "advisoryFeed" | "sealRegistry" | "install" | "ci" | "services";

const glyphs: Record<GlyphName, (state: GlyphState) => ReactNode> = {
  registry: ({ active }) => (
    <>
      <path d="M1 21.5h22" strokeLinecap="butt" />
      <rect x="2.5" y="14" width="5.5" height="7.5" />
      <rect x="9.25" y="14" width="5.5" height="7.5" />
      <rect x="16" y="14" width="5.5" height="7.5" strokeDasharray={active ? undefined : "2 2"} />
      <rect x="5.75" y="6.5" width="5.5" height="7.5" />
    </>
  ),
  staticScripts: ({ active }) => (
    <>
      <path d="M4 2h10l4 4v16H4z" strokeLinecap="butt" />
      <path d="M9 7.5c-1.2 0-1.2 1-1.2 2s-.8 1.5-1.3 1.5c.5 0 1.3.5 1.3 1.5s0 2 1.2 2M12.5 7.5c1.2 0 1.2 1 1.2 2s.8 1.5 1.3 1.5c-.5 0-1.3.5-1.3 1.5s0 2-1.2 2" />
      <circle cx="17" cy="17" r="3.8" fill="var(--color-surface)" />
      <path d="M19.8 19.8L23 23" />
      {active && <path d="M5 5h12" className="scanSweep stroke-persimmon" />}
    </>
  ),
  sandboxCanary: ({ alarm }) => (
    <>
      <rect x="1.5" y="5" width="21" height="17" fill="url(#hatch)" strokeLinecap="butt" />
      <rect x="5" y="9" width="14" height="9" fill="var(--color-surface)" stroke="none" />
      <path d="M6.5 14.5q2.5-3 5.5 0M12 14.5q2.5-3 5.5 0M12 14.5v2.5" className={alarm ? "stroke-persimmon" : undefined} />
    </>
  ),
  advisoryFeed: () => (
    <>
      <rect x="2" y="6" width="12" height="16" />
      <path d="M5 3h8.5l3 3v13H5z" fill="var(--color-surface)" strokeLinecap="butt" />
      <path d="M13.5 3v3h3" />
      <path d="M8 10h5M8 13.5h5" />
      <path d="M19 9.5a2.5 2.5 0 0 1 0 5M21 7.5a5 5 0 0 1 0 9" />
    </>
  ),
  sealRegistry: () => (
    <>
      <rect x="2" y="3" width="14" height="19" strokeLinecap="butt" />
      <path d="M5 7.5h8M5 11h8M5 14.5h4" />
      <circle cx="16.5" cy="17" r="5" fill="var(--color-surface)" />
      <circle cx="16.5" cy="17" r="2.2" />
    </>
  ),
  install: () => (
    <>
      <path d="M12 2v12M7.5 9.5L12 14l4.5-4.5" />
      <path d="M2.5 13v8h19v-8" strokeLinecap="butt" />
    </>
  ),
  ci: () => (
    <>
      <rect x="1" y="9.5" width="5" height="5" />
      <rect x="9.5" y="9.5" width="5" height="5" />
      <rect x="18" y="9.5" width="5" height="5" />
      <path d="M6 12h3.5M14.5 12H18" />
    </>
  ),
  services: () => (
    <>
      <rect x="2.5" y="3" width="19" height="8" />
      <rect x="2.5" y="13" width="19" height="8" />
      <circle cx="6.5" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="17" r="1.2" fill="currentColor" stroke="none" />
      <path d="M11 7h7M11 17h7" />
    </>
  ),
};

export function Glyph({ name, x, y, size, blocked, ...state }: GlyphState & { name: GlyphName; x: number; y: number; size: number; blocked: boolean }) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="miter"
      overflow="visible"
      className={blocked ? "text-ground" : state.active || state.alarm ? "text-bone" : "text-jade"}
    >
      {glyphs[name](state)}
      {blocked && <path d="M2 22L22 2" strokeWidth="2.5" className="stroke-ground" />}
    </svg>
  );
}

export function GlyphBadge({ name, size = 28, alarm = false, active = false }: { name: GlyphName; size?: number; alarm?: boolean; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" overflow="visible" className="shrink-0">
      <Glyph name={name} x={0} y={0} size={24} active={active} alarm={alarm} blocked={false} />
    </svg>
  );
}
