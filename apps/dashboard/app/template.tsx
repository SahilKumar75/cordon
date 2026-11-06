"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";

export default function Template({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: [0.2, 0.8, 0.3, 1] }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
