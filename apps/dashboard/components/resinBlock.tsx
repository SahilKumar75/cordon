import type { SealStatusName } from "@cordon/shared";

const faces = {
  top: "M8 18L32 6l24 12-24 12z",
  left: "M8 18l24 12v36L8 54z",
  right: "M56 18L32 30v36l24-12z",
};

export function ResinBlock({ status, size }: { status: SealStatusName; size: number }) {
  const sealed = status === "Sealed";
  const outline = sealed ? undefined : status === "Unsealed" ? "stroke-jade" : "stroke-plum";
  return (
    <svg
      viewBox="0 0 64 72"
      width={size}
      height={(size * 72) / 64}
      role="img"
      aria-label={sealed ? "Sealed in resin" : status === "Unsealed" ? "Unsealed by guardian" : "Not sealed"}
      className="shrink-0"
    >
      {sealed ? (
        <>
          <path d={faces.top} className="fill-persimmon" opacity="0.78" />
          <path d={faces.left} className="fill-persimmon" />
          <path d={faces.right} className="fill-persimmon" opacity="0.6" />
          <path d="M11 22v30" strokeWidth="1.5" strokeLinecap="round" className="stroke-bone" opacity="0.35" />
        </>
      ) : (
        <g fill="none" strokeWidth="1.5" strokeDasharray="3 3" className={outline}>
          <path d={faces.top} />
          <path d={faces.left} />
          <path d={faces.right} />
        </g>
      )}
      <path
        d="M24 38l8-4 8 4-8 4zM24 38v9l8 4 8-4v-9M32 42v9"
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className={sealed ? "stroke-ground" : outline}
      />
    </svg>
  );
}
