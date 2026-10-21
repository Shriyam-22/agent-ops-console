"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/tickets", label: "Escalations", icon: "M4 6h16M4 12h16M4 18h10" },
];

export function Nav({ openCount }: { openCount: number | null }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active ? "bg-white/[0.07] text-white" : "text-fog-300 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" className={`h-4 w-4 ${active ? "text-lime" : "text-fog-500 group-hover:text-fog-300"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={l.icon} />
            </svg>
            {l.label}
            {l.href === "/tickets" && openCount !== null && openCount > 0 && (
              <span className="ml-auto rounded-full bg-lime px-1.5 font-mono text-[10px] font-semibold text-ink-950">{openCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
