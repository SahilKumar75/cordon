import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Azeret_Mono, Doto } from "next/font/google";
import { productName } from "@cordon/shared";
import { HatchDefs } from "@/components/drawing";
import { AsciiArt, ConsoleBanner, asciiBanner } from "@/components/asciiArt";
import { BrandMark, LiveStatus, Nav, ThemeToggle } from "@/components/nav";
import { Cursor } from "@/components/cursor";
import { SmoothScroll } from "@/components/smoothScroll";
import { Providers } from "@/components/providers";
import { demoEnabled, missingSettings, readOnly } from "@/lib/env";
import "./globals.css";

const display = Doto({ subsets: ["latin"], axes: ["ROND"], variable: "--font-doto" });
const mono = Azeret_Mono({ subsets: ["latin"], variable: "--font-azeretMono" });
const themeScript = `try{const t=localStorage.getItem("cordonTheme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: productName,
  description: `${productName} seals malicious npm versions on chain once detectors reach quorum, and guards block them.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          <HatchDefs />
          <SmoothScroll />
          <Cursor />
          <ConsoleBanner />
          <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-12 gap-y-3 px-4 py-6 sm:px-8">
            <Link href="/" className="inline-flex items-center gap-2.5 font-display text-[28px] leading-none">
              <BrandMark />
              {productName}
            </Link>
            <Nav demo={demoEnabled} />
            <div className="flex items-center gap-5 sm:ml-auto">
              <LiveStatus />
              <ThemeToggle />
            </div>
          </header>
          {missingSettings.length > 0 && (
            <p className="mx-auto w-full max-w-7xl px-4 text-[13px] text-persimmon sm:px-8">Missing settings: {missingSettings.join(", ")}</p>
          )}
          {readOnly && (
            <p className="mx-auto w-full max-w-7xl px-4 text-[13px] text-jade sm:px-8">
              Read only view of SealRegistry on a testnet. This is a prototype; watcher, detector and stopwatch panels need a local run.
            </p>
          )}
          <main className="pageRise mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-6 sm:px-8">{children}</main>
          <footer className="mx-auto w-full max-w-7xl px-4 sm:px-8">
            <div className="hairline" />
            <div className="flex flex-wrap items-end justify-between gap-6 py-6">
              <AsciiArt art={asciiBanner} className="opacity-70" />
              <p className="text-[13px] leading-5 text-jade">Detection tells you. {productName} keeps the bad version in the vault.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
