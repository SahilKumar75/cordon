"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { detectorIds } from "@cordon/shared";
import { useQuorum } from "@/lib/useQuorum";

const links = [
  { href: "/", label: "Stopwatch" },
  { href: "/sealed", label: "Vault" },
  { href: "/services", label: "Services" },
  { href: "/guardian", label: "Guardian" },
];

export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
      <path d="M4 8l8-4 8 4-8 4z" className="fill-persimmon" opacity="0.7" />
      <path d="M4 8l8 4v9l-8-4z" className="fill-persimmon" />
      <path d="M20 8l-8 4v9l8-4z" className="fill-persimmon" opacity="0.55" />
      <path d="M6.5 12.2l3 1.5v3.2l-3-1.5z" className="fill-ground" />
    </svg>
  );
}

export function LiveStatus() {
  const quorum = useQuorum();
  return (
    <span className="text-[13px] text-jade">
      {detectorIds.length} detectors, quorum {quorum ?? "unknown"}
    </span>
  );
}

export function Nav({ demo }: { demo: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-7 gap-y-2 text-[13px]">
      {[...links, ...(demo ? [{ href: "/demo", label: "Demo" }] : [])].map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "text-bone underline decoration-copper underline-offset-8" : "text-jade hover:text-bone"}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
