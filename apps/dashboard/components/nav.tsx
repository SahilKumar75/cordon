"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signedSnapshotSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { Tape } from "./ui";

const links = [
  { href: "/", label: "Stopwatch" },
  { href: "/sealed", label: "Sealed" },
  { href: "/services", label: "Services" },
  { href: "/guardian", label: "Guardian" },
];

export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="shrink-0">
      <rect x="3" y="4" width="3" height="16" className="fill-ink" />
      <rect x="18" y="4" width="3" height="16" className="fill-ink" />
      <rect x="6" y="9" width="12" height="5" className="fill-accent" />
      <path d="M10 9l-2.5 5M14.5 9l-2.5 5" strokeWidth="1.6" strokeLinecap="butt" fill="none" className="stroke-paper" />
    </svg>
  );
}

export function HeaderTape() {
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const sealed = snapshot.data?.snapshot.entries.some((entry) => entry.status === "Sealed") ?? false;
  return <Tape tone={sealed ? "accent" : "ink"} className="block h-1 w-full" />;
}

export function Nav({ demo }: { demo: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {[...links, ...(demo ? [{ href: "/demo", label: "Demo" }] : [])].map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={active ? "font-medium text-ink underline decoration-accent decoration-2 underline-offset-8" : "text-muted hover:text-ink"}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
