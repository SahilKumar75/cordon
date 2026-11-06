"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
    <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3">
      {actions.map((action) => (
        <button
          key={action.id}
          className={action.id === "poisoned" ? "button pressKey px-7 py-4 text-lg" : "button buttonQuiet"}
          disabled={run.isPending}
          onClick={() => run.mutate(action)}
        >
          {action.id === "poisoned" && (
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor" />
            </svg>
          )}
          {action.label}
        </button>
      ))}
      <span className="font-mono text-[13px] text-dim" role="status">
        {run.isPending && "Sending to the demo registry"}
        {run.isSuccess && (run.variables.id === "reset" ? "Demo registry reset" : `Published ${run.variables.body.version} at ${formatClock(run.submittedAt)}`)}
      </span>
      {run.isError && <p className="basis-full text-sm text-signal">{run.error.message}</p>}
    </div>
  );
}
