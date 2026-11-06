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
      <h3 className="mb-1 text-[12px] text-jade">{title}</h3>
      <ul className="divide-y divide-plum border-t border-plum text-[13px]">
        {items.map((item, index) => (
          <li key={index} className="py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Breaker = "serving" | "stopped" | "unavailable";

export const breakerState = (status: ServiceStatus): Breaker =>
  status.healthy ? "serving" : status.report.outcome === "unavailable" ? "unavailable" : "stopped";

const breakerView: Record<Breaker, { angle: number; color: string; plate: string; label: string }> = {
  serving: { angle: 0, color: "text-jade", plate: "CLOSED", label: "Breaker closed, flowing" },
  stopped: { angle: -38, color: "text-persimmon", plate: "OPEN", label: "Breaker open, blocked by the guard" },
  unavailable: { angle: -15, color: "text-jade/60", plate: "OPEN", label: "Breaker open, the check could not run" },
};

function BreakerSwitch({ state }: { state: Breaker }) {
  const view = breakerView[state];
  return (
    <svg
      viewBox="0 0 96 48"
      width="240"
      height="120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      role="img"
      aria-label={view.label}
      className={`my-5 h-auto w-full max-w-52 ${view.color}`}
    >
      <rect x="1" y="1" width="94" height="46" strokeLinecap="butt" />
      <path d="M1 32h16M67 32h28" strokeLinecap="butt" />
      <path d="M52.3 6.8A41 41 0 0 1 61 32" strokeDasharray="2 3" className="stroke-plum" />
      <circle cx="20" cy="32" r="3" fill="currentColor" />
      <circle cx="64" cy="32" r="3" className="fill-ground" />
      <g className="breakerLever" style={{ transformOrigin: "20px 32px", transform: `rotate(${view.angle}deg)` }}>
        <path d="M20 32h40" strokeWidth="2.5" strokeDasharray={state === "unavailable" ? "5 3" : undefined} strokeLinecap="butt" />
        <circle cx="61" cy="32" r="3.5" fill="currentColor" />
      </g>
      {state === "unavailable" && <path d="M40 6v7M40 15.5v1.5" strokeWidth="2" strokeLinecap="round" />}
      <rect x="66" y="5" width="26" height="12" className="fill-ground" strokeWidth="1" />
      <text x="79" y="14" textAnchor="middle" fontSize="7.5" fontWeight="500" letterSpacing="0.5" fill="currentColor" stroke="none" className="font-mono">
        {view.plate}
      </text>
    </svg>
  );
}

export function ServiceCard({ status, slot }: { status: ServiceStatus; slot?: (node: HTMLElement | null) => void }) {
  const { report } = status;
  const outcome = outcomeView[report.outcome];
  const source =
    report.listSource === "chain"
      ? "chain"
      : report.listSource === "snapshot"
        ? `signed snapshot${report.snapshotAgeSeconds === null ? "" : `, ${formatGap(report.snapshotAgeSeconds * 1000)} old`}`
        : "none, age fallback in use";
  const breaker = breakerState(status);
  return (
    <article className="min-w-0">
      <h2 className="text-[15px]">{status.service}</h2>
      {slot ? (
        <div ref={slot} role="img" aria-label={breakerView[breaker].label} className={`relative my-5 aspect-[2/1] w-full max-w-52 ${breakerView[breaker].color}`}>
          <span className="absolute right-0 top-0 font-mono text-[10px] tracking-[0.1em]">{breakerView[breaker].plate}</span>
        </div>
      ) : (
        <BreakerSwitch state={breaker} />
      )}
      <p className={`font-display text-[40px] leading-none ${status.healthy ? "text-jade" : "text-persimmon"}`}>{status.healthy ? "Flowing" : "Blocked"}</p>
      <details className="fold mt-5">
        <summary>Details</summary>
        <div className="mt-4 space-y-6">
          <Status icon={outcome.icon} tone={outcome.tone}>{outcome.label}</Status>
          <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[auto_1fr]">
            <dt className="text-jade">Sealed list from</dt>
            <dd>{source}</dd>
            <dt className="text-jade">Packages checked</dt>
            <dd className="font-mono">{report.packagesChecked}</dd>
            <dt className="text-jade">Lockfile</dt>
            <dd className="break-all font-mono">{report.lockfile}</dd>
            <dt className="text-jade">Checked at</dt>
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
              <div key={item.key} className="space-y-1">
                <span className="font-mono text-persimmon">{item.name}@{item.version}</span>
                <div className="break-all font-mono text-jade">{item.lockfilePath}</div>
                {item.alreadyInstalled && <Status icon="warning" tone="accent">Already installed</Status>}
              </div>
            ))}
          />
          <Rows
            title="Non registry sources"
            items={report.nonRegistrySources.map((item) => (
              <div className="space-y-1">
                <span className="font-mono">{item.name}@{item.version}</span>
                <div className="break-all font-mono text-jade">{item.resolved}</div>
                <div className="break-all font-mono text-jade">{item.lockfilePath}</div>
              </div>
            ))}
          />
          <Rows
            title="Editor and agent hook files"
            items={report.hookFiles.map((item) => (
              <div className="space-y-1">
                <span>{item.tool}</span>
                <div className="break-all font-mono text-jade">{item.path}</div>
              </div>
            ))}
          />
          <Rows
            title="Blocked as too new"
            items={report.tooYoung.map((item) => (
              <div className="space-y-1">
                <span className="font-mono">{item.name}@{item.version}</span>
                <div className="text-jade">{item.publishedAt ? `published ${formatDateTime(item.publishedAt)}` : "publish time unknown"}</div>
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
          <p className="text-[12px] text-jade">Updated {formatDateTime(status.updatedAt)}</p>
        </div>
      </details>
    </article>
  );
}
