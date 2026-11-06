"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Stopwatch" },
  { href: "/sealed", label: "Sealed" },
  { href: "/services", label: "Services" },
  { href: "/guardian", label: "Guardian" },
];

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
