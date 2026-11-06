import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { productName } from "@cordon/shared";
import { HatchDefs } from "@/components/drawing";
import { BrandMark, LiveStatus, Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { demoEnabled, missingSettings } from "@/lib/env";
import "./globals.css";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrumentSerif" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrainsMono" });

export const metadata: Metadata = {
  title: productName,
  description: `${productName} seals malicious npm versions on chain once detectors reach quorum, and guards block them.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col antialiased">
        <Providers>
          <HatchDefs />
          <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-12 gap-y-3 px-4 py-6 sm:px-8">
            <Link href="/" className="inline-flex items-center gap-2.5 font-serif text-[28px] leading-none">
              <BrandMark />
              {productName}
            </Link>
            <Nav demo={demoEnabled} />
            <div className="sm:ml-auto">
              <LiveStatus />
            </div>
          </header>
          {missingSettings.length > 0 && (
            <p className="mx-auto w-full max-w-7xl px-4 text-[13px] text-persimmon sm:px-8">Missing settings: {missingSettings.join(", ")}</p>
          )}
          <main className="pageRise mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-6 sm:px-8">{children}</main>
          <footer className="mx-auto w-full max-w-7xl px-4 sm:px-8">
            <p className="border-t border-plum py-6 text-[13px] leading-5 text-jade">Detection tells you. {productName} keeps the bad version in the vault.</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
