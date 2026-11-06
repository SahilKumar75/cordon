"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: Math.min(index, 8) * 0.08, ease: [0.2, 0.8, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
