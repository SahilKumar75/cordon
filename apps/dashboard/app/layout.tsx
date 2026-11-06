import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { productName } from "@cordon/shared";
import { HatchDefs } from "@/components/drawing";
import { BrandMark, HeaderTape, Nav } from "@/components/nav";
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
          <header className="border-b border-line">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <Link href="/" className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
                <BrandMark />
                {productName}
              </Link>
              <Nav demo={demoEnabled} />
            </div>
          </header>
          {missingSettings.length > 0 && (
            <div className="border-b border-line bg-accentSoft">
              <p className="mx-auto max-w-6xl px-4 py-3 text-sm sm:px-6">
                Missing settings: <span className="font-mono">{missingSettings.join(", ")}</span>. Pages that need them say so.
              </p>
            </div>
          )}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">{children}</main>
          <footer className="border-t border-nightLine bg-night text-nightText">
            <p className="mx-auto max-w-6xl px-4 py-6 text-[13px] leading-5 sm:px-6">
              Detection tells you. {productName} stops the flow. It blocks only versions sealed at quorum; a malicious version no
              detector flags still gets through.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
