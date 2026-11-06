"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { detectorIds, signedSnapshotSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { useQuorum } from "@/lib/useQuorum";

const links = [
  { href: "/", label: "Stopwatch" },
  { href: "/sealed", label: "Sealed" },
  { href: "/services", label: "Services" },
  { href: "/guardian", label: "Guardian" },
];

export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
      <rect x="3" y="4" width="3" height="16" className="fill-fg" />
      <rect x="18" y="4" width="3" height="16" className="fill-fg" />
      <rect x="6" y="9" width="12" height="5" className="fill-live" />
      <path d="M10 9l-2.5 5M14.5 9l-2.5 5" strokeWidth="1.6" strokeLinecap="butt" fill="none" className="stroke-ground" />
    </svg>
  );
}

export function HeaderTape() {
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const sealed = snapshot.data?.snapshot.entries.some((entry) => entry.status === "Sealed") ?? false;
  return (
    <svg className="block h-2.5 w-full" aria-hidden="true">
      <defs>
        <pattern id="hazardTape" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="20" height="20" className="fill-ground" />
          <rect width="10" height="20" className={sealed ? "fill-signal" : "fill-live"} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hazardTape)" />
    </svg>
  );
}

export function LiveStatus() {
  const quorum = useQuorum();
  return (
    <span className="font-mono text-[13px] text-dim">
      Live, {detectorIds.length} detectors, quorum {quorum ?? "unknown"}
    </span>
  );
}

export function Nav({ demo }: { demo: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {[...links, ...(demo ? [{ href: "/demo", label: "Demo" }] : [])].map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "text-fg underline decoration-live decoration-2 underline-offset-8" : "text-dim hover:text-fg"}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
