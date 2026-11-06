"use client";

import { useEffect, useId, useRef } from "react";
import type { SealStatusName } from "@cordon/shared";

const tone: Record<SealStatusName, string> = { Sealed: "text-accent", Unsealed: "text-muted", None: "text-line" };

export function SealStamp({
  status,
  size,
  label = "",
  footer,
  onNight = false,
}: {
  status: SealStatusName;
  size: "large" | "small";
  label?: string;
  footer?: string;
  onNight?: boolean;
}) {
  const filterId = `stampInk${useId().replace(/\W/g, "")}`;
  const bleed = useRef<SVGAnimateElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: no-preference)").matches) bleed.current?.beginElementAt(0.25);
  }, []);
  const word = status === "None" ? "" : status.toUpperCase();
  const color = onNight && status === "Sealed" ? "text-accentOnNight" : tone[status];
  if (size === "small")
    return (
      <span role="img" aria-label={status === "None" ? "Not sealed" : word} className={`stampTurn inline-block ${color}`}>
        <svg viewBox="0 0 72 24" width="72" height="24" aria-hidden="true" fill="none" stroke="currentColor">
          <rect x="1" y="1" width="70" height="22" strokeWidth="1.5" strokeDasharray={status === "None" ? "4 3" : undefined} />
          <text x="36" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize={status === "Unsealed" ? 9 : 11} fontWeight="600" letterSpacing="2" className="font-mono">
            {word}
          </text>
          {status === "Unsealed" && <path d="M6 18L66 6" strokeWidth="1.5" />}
        </svg>
      </span>
    );
  const width = Math.max(220, label.length * 7.4 + 36);
  return (
    <div className={`stampTurn stampLand ${color}`} role="img" aria-label={status === "None" ? "Not sealed" : `${word}: ${label}`}>
      <svg viewBox={`0 0 ${width} 92`} width={width} height="92" aria-hidden="true">
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3">
            <animate ref={bleed} attributeName="scale" from="8" to="3" dur="400ms" begin="indefinite" fill="freeze" />
          </feDisplacementMap>
        </filter>
        <g filter={status === "None" ? undefined : `url(#${filterId})`} fill="none" stroke="currentColor">
          <rect x="3" y="3" width={width - 6} height="86" strokeWidth="3.5" strokeDasharray={status === "None" ? "8 6" : undefined} />
          {status !== "None" && <rect x="9" y="9" width={width - 18} height="74" strokeWidth="1.5" />}
          {word && (
            <text x={width / 2} y="44" textAnchor="middle" fill="currentColor" stroke="none" fontSize="30" fontWeight="600" letterSpacing="9">
              {word}
            </text>
          )}
          {status === "Unsealed" && <path d={`M16 50L${width - 16} 22`} strokeWidth="3.5" />}
        </g>
        {word && (
          <text x={width / 2} y="62" textAnchor="middle" fill="currentColor" fontSize="12" className="font-mono">
            {label}
          </text>
        )}
        {word && footer && (
          <text x={width / 2} y="76" textAnchor="middle" fill="currentColor" fontSize="10" letterSpacing="1" className="font-mono">
            {footer}
          </text>
        )}
      </svg>
    </div>
  );
}
