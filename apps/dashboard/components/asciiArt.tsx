"use client";

import { useEffect } from "react";

export const asciiBanner = String.raw`
 ####   ####  #####  #####   ####  #    #
#      #    # #    # #    # #    # ##   #
#      #    # #####  #    # #    # # #  #
#      #    # #   #  #    # #    # #  # #
 ####   ####  #    # #####   ####  #   ##
`;

export const asciiVault = String.raw`
  ___________________
 |  _______________  |
 | |   _________   | |
 | |  |  [###]  |  | |
 | |  |  [###]  |  | |
 | |  |_________|  | |
 | |_______________| |
 |___________________|
     ||         ||
`;

export function AsciiArt({ art, className = "" }: { art: string; className?: string }) {
  return (
    <pre aria-hidden="true" className={`select-none overflow-hidden font-mono text-[11px] leading-[13px] text-copper ${className}`}>
      {art.slice(1)}
    </pre>
  );
}

export function ConsoleBanner() {
  useEffect(() => {
    console.log(`%c${asciiBanner}\nDetection tells you. Cordon stops the flow.`, "color:#c8794a;font-family:monospace");
  }, []);
  return null;
}
