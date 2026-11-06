"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

export function CountUp({ value }: { value: number }) {
  const node = useRef<HTMLSpanElement>(null);
  const seen = useInView(node, { once: true });
  const calm = useReducedMotion();
  const shown = useRef(0);
  useEffect(() => {
    const target = node.current;
    if (!target || !seen) return;
    if (calm) {
      target.textContent = String(value);
      shown.current = value;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 1.2,
      ease: [0.2, 0.8, 0.3, 1],
      onUpdate: (latest) => {
        shown.current = latest;
        target.textContent = String(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [value, seen, calm]);
  return <span ref={node}>0</span>;
}
