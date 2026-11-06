export function HatchDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--color-hair)" strokeWidth="1" />
        </pattern>
      </defs>
    </svg>
  );
}

export function Dimension({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g className="stroke-dim" strokeWidth="1" vectorEffect="non-scaling-stroke">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <path d={`M${x1 - 4} ${y + 4}l8 -8M${x2 - 4} ${y + 4}l8 -8M${x1} ${y - 7}v14M${x2} ${y - 7}v14`} />
      <rect x={(x1 + x2) / 2 - label.length * 3.4 - 6} y={y - 8} width={label.length * 6.8 + 12} height="16" className="fill-raised" stroke="none" />
      <text x={(x1 + x2) / 2} y={y + 4} textAnchor="middle" fontSize="11" className="fill-dim font-mono" stroke="none">
        {label}
      </text>
    </g>
  );
}
