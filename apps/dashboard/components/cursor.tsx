"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

const interactive = "a, button, summary, label, [role='button'], [data-cursor]";
const magnetic = ".button, [data-magnetic]";

export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const [hover, setHover] = useState(false);
  const [label, setLabel] = useState("");
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 380, damping: 32, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 380, damping: 32, mass: 0.6 });

  useEffect(() => {
    const fine = matchMedia("(pointer: fine)");
    const calm = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(fine.matches && !calm.matches);
    update();
    fine.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("cursorCustom");
    let pulled: HTMLElement | null = null;
    const release = () => {
      if (pulled) pulled.style.translate = "";
      pulled = null;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x.set(event.clientX);
      y.set(event.clientY);
      setVisible(true);
      const target = event.target instanceof Element ? event.target : null;
      const hit = target?.closest<HTMLElement>(interactive) ?? null;
      setHover(hit !== null && !(hit as HTMLButtonElement).disabled);
      setLabel(target?.closest<HTMLElement>("[data-cursor]")?.dataset.cursor ?? "");
      const pull = target?.closest<HTMLElement>(magnetic) ?? null;
      if (pull !== pulled) release();
      if (pull && !(pull as HTMLButtonElement).disabled && pull.dataset.magnetic !== "own") {
        const box = pull.getBoundingClientRect();
        const dx = (event.clientX - (box.left + box.width / 2)) * 0.22;
        const dy = (event.clientY - (box.top + box.height / 2)) * 0.3;
        pull.style.transition = "translate 180ms cubic-bezier(0.2, 0.8, 0.3, 1)";
        pull.style.translate = `${dx}px ${dy}px`;
        pulled = pull;
      }
    };
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    const leave = () => {
      setVisible(false);
      release();
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("pointerleave", leave);
    return () => {
      root.classList.remove("cursorCustom");
      release();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("pointerleave", leave);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  const size = label ? 64 : hover ? 46 : 28;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100]" style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}>
      <motion.div className="absolute left-0 top-0" style={{ x: ringX, y: ringY }}>
        <motion.div
          className="flex items-center justify-center rounded-full border font-mono text-[10px] uppercase tracking-[0.12em]"
          animate={{
            width: size,
            height: size,
            x: -size / 2,
            y: -size / 2,
            scaleX: pressed ? 1.18 : 1,
            scaleY: pressed ? 0.78 : 1,
            borderColor: hover ? "var(--color-persimmon)" : "var(--color-copper)",
            backgroundColor: hover ? "var(--glowPersimmon)" : "rgba(0, 0, 0, 0)",
          }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          style={{ color: "var(--color-bone)" }}
        >
          {label}
        </motion.div>
      </motion.div>
      <motion.div
        className="absolute left-0 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-copper"
        style={{ x, y }}
        animate={{ scale: hover ? 0 : pressed ? 0.6 : 1 }}
        transition={{ duration: 0.15 }}
      />
    </div>
  );
}
