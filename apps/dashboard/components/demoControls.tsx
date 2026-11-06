"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
import { anyJson, request } from "@/lib/api";
import { formatClock } from "@/lib/format";

const demoPackage = "@cordondemo/colorkit";

const actions = [
  { id: "poisoned", label: "Publish 1.4.1", path: "/_demo/publish", body: { name: demoPackage, version: "1.4.1" } },
  { id: "clean", label: "Publish 1.4.0 clean", path: "/_demo/publish", body: { name: demoPackage, version: "1.4.0" } },
  { id: "reset", label: "Reset", path: "/_demo/reset", body: {} },
] as const;

type Action = (typeof actions)[number];

export function DemoControls() {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: (action: Action) => request("registry", action.path, anyJson, action.body),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  return (
    <div className="mb-10 flex flex-wrap items-center gap-x-8 gap-y-3">
      {actions.map((action) =>
        action.id === "poisoned" ? (
          <PublishButton key={action.id} disabled={run.isPending} onPress={() => run.mutate(action)}>
            {action.label}
          </PublishButton>
        ) : (
          <button key={action.id} className="button buttonQuiet" disabled={run.isPending} onClick={() => run.mutate(action)}>
            {action.label}
          </button>
        ),
      )}
      <span className="text-[13px] text-jade" role="status">
        {run.isPending && "Sending to the demo registry"}
        {run.isSuccess && (run.variables.id === "reset" ? "Demo registry reset" : `Published ${run.variables.body.version} at ${formatClock(run.submittedAt)}`)}
      </span>
      {run.isError && <p className="basis-full text-[13px] text-persimmon">{run.error.message}</p>}
    </div>
  );
}

function PublishButton({ disabled, onPress, children }: { disabled: boolean; onPress: () => void; children: ReactNode }) {
  const calm = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 16 });
  const y = useSpring(0, { stiffness: 220, damping: 16 });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const pull = (event: PointerEvent<HTMLButtonElement>) => {
    if (calm || disabled) return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - box.left - box.width / 2) * 0.3);
    y.set((event.clientY - box.top - box.height / 2) * 0.4);
  };
  const press = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setRipples((list) => [...list, { id: event.timeStamp, x: event.clientX - box.left, y: event.clientY - box.top }]);
  };
  return (
    <motion.button
      className="button relative overflow-hidden px-6 py-3 text-[15px]"
      style={{ x, y }}
      whileTap={{ scale: 0.96 }}
      disabled={disabled}
      onPointerMove={pull}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      onPointerDown={press}
      onClick={onPress}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor" />
      </svg>
      {children}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            aria-hidden="true"
            className="pointer-events-none absolute h-40 w-40 rounded-full bg-persimmon"
            style={{ left: ripple.x - 80, top: ripple.y - 80 }}
            initial={{ scale: 0, opacity: 0.45 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}
            onAnimationComplete={() => setRipples((list) => list.filter((item) => item.id !== ripple.id))}
          />
        ))}
      </AnimatePresence>
    </motion.button>
  );
}
