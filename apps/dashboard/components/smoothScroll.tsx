"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { motion, useScroll, useSpring } from "motion/react";

export function SmoothScroll() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 34, restDelta: 0.001 });

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, anchors: true });
    let frame = requestAnimationFrame(function tick(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return (
    <motion.div
      aria-hidden="true"
      className="accentTrack fixed inset-x-0 top-0 z-[90] h-[3px] origin-left"
      style={{ scaleX: progress }}
    />
  );
}
