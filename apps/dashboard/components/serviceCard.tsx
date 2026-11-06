import type { ReactNode } from "react";
import type { GuardOutcome, ServiceStatus } from "@cordon/shared";
import { formatDateTime, formatGap } from "@/lib/format";
import type { IconName } from "./icon";
import { Notice, Status } from "./ui";

const outcomeView: Record<GuardOutcome, { icon: IconName; label: string; tone: "ink" | "accent" }> = {
  allowed: { icon: "check", label: "Lockfile allowed", tone: "ink" },
  blocked: { icon: "blocked", label: "Lockfile blocked", tone: "accent" },
  unavailable: { icon: "warning", label: "Check unavailable", tone: "accent" },
};

function Rows({ title, items }: { title: string; items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="divide-y divide-line border border-line text-sm">
        {items.map((item, index) => (
          <li key={index} className="p-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ServiceCard({ status }: { status: ServiceStatus }) {
  const { report } = status;
  const outcome = outcomeView[report.outcome];
  const source =
    report.listSource === "chain"
      ? "chain"
      : report.listSource === "snapshot"
        ? `signed snapshot${report.snapshotAgeSeconds === null ? "" : `, ${formatGap(report.snapshotAgeSeconds * 1000)} old`}`
        : "none, age fallback in use";
  return (
    <article className="border border-line bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-mono">{status.service}</span>
          {status.healthy ? <Status icon="check">Serving</Status> : <Status icon="blocked" tone="accent">Stopped serving</Status>}
          <Status icon={outcome.icon} tone={outcome.tone}>{outcome.label}</Status>
        </div>
        <span className="text-sm text-muted">Updated {formatDateTime(status.updatedAt)}</span>
      </header>
      <div className="space-y-6 p-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Sealed list from</dt>
          <dd>{source}</dd>
          <dt className="text-muted">Packages checked</dt>
          <dd className="font-mono">{report.packagesChecked}</dd>
          <dt className="text-muted">Lockfile</dt>
          <dd className="break-all font-mono">{report.lockfile}</dd>
          <dt className="text-muted">Checked at</dt>
          <dd>{formatDateTime(report.checkedAt)}</dd>
        </dl>
        {report.fallback && (
          <Notice icon="warning" tone="accent">
            The Sealed list did not load. This guard blocks every version younger than {report.fallback.minAgeDays} days
            {report.fallback.placeholder ? ", a placeholder value until the team sets it" : ""}.
          </Notice>
        )}
        <Rows
          title="Blocked versions"
          items={report.blocked.map((item) => (
            <div key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Status icon="sealed" tone="accent">Sealed</Status>
              <span className="font-mono">{item.name}@{item.version}</span>
              <span className="font-mono text-muted">{item.lockfilePath}</span>
              {item.alreadyInstalled && <Status icon="warning" tone="accent">Already installed</Status>}
            </div>
          ))}
        />
        <Rows
          title="Git dependencies"
          items={report.gitDependencies.map((item) => (
            <div className="space-y-1">
              <Status icon="warning" tone="accent">
                <span className="font-mono">{item.name}@{item.version}</span>
              </Status>
              <div className="break-all font-mono text-muted">{item.resolved}</div>
              <div className="font-mono text-muted">{item.lockfilePath}</div>
            </div>
          ))}
        />
        <Rows
          title="Editor and agent hook files"
          items={report.hookFiles.map((item) => (
            <div className="flex flex-wrap items-center gap-x-4">
              <Status icon="warning" tone="accent">{item.tool}</Status>
              <span className="break-all font-mono">{item.path}</span>
            </div>
          ))}
        />
        <Rows
          title="Too young to allow"
          items={report.tooYoung.map((item) => (
            <div className="flex flex-wrap items-center gap-x-4">
              <Status icon="clock" tone="accent"><span className="font-mono">{item.name}@{item.version}</span></Status>
              <span className="text-muted">{item.publishedAt ? `published ${formatDateTime(item.publishedAt)}` : "publish time unknown"}</span>
            </div>
          ))}
        />
        <Rows
          title="Proposed rollback"
          items={report.rollback.map((item) => (
            <span className="font-mono">
              {item.name}: {item.from} to {item.to ?? "no safe earlier version found"}
            </span>
          ))}
        />
        <Rows title="Advice" items={report.advice.map((line) => <span>{line}</span>)} />
      </div>
    </article>
  );
}
