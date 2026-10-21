import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { api } from "@/lib/api";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Agent Ops Console",
  description: "Monitor an AI support agent and work the conversations it hands to humans.",
};

export const dynamic = "force-dynamic";

async function openCount(): Promise<number | null> {
  try {
    const { total } = await api.tickets({ status: "open", limit: "1" });
    return total;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const open = await openCount();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans text-fog-100 antialiased">
        <div className="mx-auto flex max-w-[1400px] flex-col md:flex-row">
          <aside className="border-b border-white/[0.06] p-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r md:p-5">
            <div className="mb-4 flex items-center gap-3 md:mb-8">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-ink-950">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <circle cx="6" cy="7" r="2" />
                  <circle cx="18" cy="7" r="2" />
                  <circle cx="12" cy="17" r="2.5" />
                  <path d="M7.5 8.5 11 15M16.5 8.5 13 15" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Agent Ops</div>
                <div className="font-mono text-[10.5px] text-fog-500">Neem &amp; Nest support</div>
              </div>
            </div>
            <Nav openCount={open} />
            <div className="mt-8 hidden rounded-xl border border-white/[0.06] p-3 md:block">
              <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-widest text-fog-500">
                <span className={`h-1.5 w-1.5 rounded-full ${open === null ? "bg-danger" : "animate-pulse bg-lime"}`} />
                {open === null ? "API offline" : "Agent live"}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-fog-500">Neha (AI) handles WhatsApp in English, Hindi and Hinglish.</p>
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
