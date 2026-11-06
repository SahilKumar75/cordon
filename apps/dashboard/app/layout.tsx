import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { productName } from "@cordon/shared";
import { HatchDefs } from "@/components/drawing";
import { BrandMark, HeaderTape, LiveStatus, Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { demoEnabled, missingSettings } from "@/lib/env";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plexSans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plexMono" });

export const metadata: Metadata = {
  title: productName,
  description: `${productName} seals malicious npm versions on chain once detectors reach quorum, and guards block them.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Providers>
          <HatchDefs />
          <HeaderTape />
          <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-10 gap-y-3 px-4 py-5 sm:px-8">
            <Link href="/" className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
              <BrandMark />
              {productName}
            </Link>
            <Nav demo={demoEnabled} />
            <div className="sm:ml-auto">
              <LiveStatus />
            </div>
          </header>
          {missingSettings.length > 0 && (
            <p className="mx-auto w-full max-w-7xl px-4 text-sm text-signal sm:px-8">
              Missing settings: <span className="font-mono">{missingSettings.join(", ")}</span>
            </p>
          )}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 sm:px-8">{children}</main>
          <footer className="mx-auto w-full max-w-7xl border-t border-hair px-4 py-6 text-[13px] leading-5 text-dim sm:px-8">
            Detection tells you. {productName} stops the flow.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
