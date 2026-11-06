"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { anyJson, request } from "@/lib/api";
import { Notice, SimulatedTag } from "./ui";

const demoPackage = "@bulkheaddemo/colorkit";

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
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <button
            key={action.id}
            className={action.id === "poisoned" ? "button" : "button buttonQuiet"}
            disabled={run.isPending}
            onClick={() => run.mutate(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {run.isPending && (
        <Notice icon="clock" tone="muted">
          Sending to the demo registry.
        </Notice>
      )}
      {run.isError && (
        <Notice icon="warning" tone="accent">
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
          Nothing sent yet. Publish 1.4.1 and watch the stopwatch below; 1.4.0 stays clean to show sealing is per version.
        </Notice>
      )}
    </section>
  );
}
