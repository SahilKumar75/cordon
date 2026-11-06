"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { anyJson, request } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { BrokenLine, Notice, SimulatedTag } from "./ui";

const demoPackage = "@cordondemo/colorkit";

const actions = [
  { id: "poisoned", label: "Publish 1.4.1, poisoned", path: "/_demo/publish", body: { name: demoPackage, version: "1.4.1" } },
  { id: "clean", label: "Publish 1.4.0, clean", path: "/_demo/publish", body: { name: demoPackage, version: "1.4.0" } },
  { id: "reset", label: "Reset demo registry", path: "/_demo/reset", body: {} },
] as const;

type Action = (typeof actions)[number];

export function DemoControls() {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: (action: Action) => request("registry", action.path, anyJson, action.body),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  return (
    <section className="space-y-4 border border-line bg-panel p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono">{demoPackage}</span>
        <SimulatedTag />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions.map((action) => (
          <button
            key={action.id}
            className={action.id === "poisoned" ? "button pressKey px-5 py-3 text-base" : "button buttonQuiet"}
            disabled={run.isPending}
            onClick={() => run.mutate(action)}
          >
            {action.id === "poisoned" && <StartMark />}
            {action.label}
          </button>
        ))}
        {run.isSuccess && run.variables.id === "poisoned" && (
          <span className="stampTurn stampLand stampQuick inline-flex items-center gap-2 border-2 border-accent px-3 py-1 font-mono text-sm uppercase tracking-widest text-accent">
            Published {run.variables.body.version} at {formatClock(run.submittedAt)}
          </span>
        )}
      </div>
      {run.isPending && (
        <Notice icon="clock" tone="muted">
          Sending to the demo registry.
        </Notice>
      )}
      {run.isError && (
        <Notice icon="warning" tone="accent" art={<BrokenLine label="registry" />}>
          {run.error.message}
        </Notice>
      )}
      {run.isSuccess && (
        <Notice icon="check">
          {run.variables.id === "reset"
            ? "Demo registry reset."
            : `${run.variables.body.name}@${run.variables.body.version} published. The watcher picks it up on its next poll.`}
        </Notice>
      )}
      {run.isIdle && (
        <Notice icon="info" tone="muted">
          Press Publish 1.4.1 to start the clock below. 1.4.0 keeps flowing, because seals are per version.
        </Notice>
      )}
    </section>
  );
}

function StartMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor" />
    </svg>
  );
}
