import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { productName } from "@bulkhead/shared";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { demoEnabled, missingSettings } from "@/lib/env";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: productName,
  description: `${productName} seals malicious npm versions on chain once detectors reach quorum, and guards refuse them.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <header className="border-b border-line">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <Link href="/" className="font-semibold tracking-tight">
                {productName}
              </Link>
              <Nav demo={demoEnabled} />
            </div>
          </header>
          {missingSettings.length > 0 && (
            <div className="border-b border-line bg-accentSoft">
              <p className="mx-auto max-w-5xl px-4 py-3 text-sm sm:px-6">
                Missing settings: <span className="font-mono">{missingSettings.join(", ")}</span>. Pages that need them say so.
              </p>
            </div>
          )}
          <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
          <footer className="border-t border-line">
            <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted sm:px-6">
              Detection tells you. {productName} stops the flow for versions that reach detector quorum. It only blocks what was sealed, so
              a malicious version no detector flags still gets through.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
