import type { ReactNode } from "react";
import type { Address } from "viem";
import type { SealStatusName } from "@cordon/shared";
import { chain, explorerUrl, registryAddress } from "@/lib/env";
import { shortHash } from "@/lib/format";
import { Icon, type IconName } from "./icon";

type Tone = "ink" | "accent" | "muted" | "clean" | "sealed" | "blocked" | "pending";

const toneClass: Record<Tone, string> = {
  ink: "text-ink",
  accent: "text-ink [&>svg]:text-accent",
  muted: "text-muted",
  clean: "text-clean",
  sealed: "bg-accentSoft px-2 py-0.5 text-accent",
  blocked: "bg-accent px-2 py-0.5 text-paper",
  pending: "border border-dashed border-line px-2 py-0.5 text-muted",
};

export function Status({ icon, tone = "ink", children }: { icon: IconName; tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${toneClass[tone]}`}>
      <Icon name={icon} />
      {children}
    </span>
  );
}

export function Tag({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 border border-current px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em]">
      <Icon name={icon} />
      {children}
    </span>
  );
}

export const SimulatedTag = () => <Tag icon="flask">Simulated</Tag>;

const sealStatusView: Record<SealStatusName, { icon: IconName; tone: Tone; label: string }> = {
  Sealed: { icon: "sealed", tone: "sealed", label: "Sealed" },
  Unsealed: { icon: "unsealed", tone: "ink", label: "Unsealed by guardian" },
  None: { icon: "pending", tone: "pending", label: "Not sealed" },
};

export function SealStatus({ status }: { status: SealStatusName }) {
  const view = sealStatusView[status];
  return (
    <Status icon={view.icon} tone={view.tone}>
      {view.label}
    </Status>
  );
}

const noticeClass: Record<"ink" | "accent" | "muted", string> = {
  ink: "border border-line text-ink",
  muted: "border border-dashed border-line text-muted",
  accent: "border border-line border-l-2 border-l-accent text-ink",
};

export function Notice({
  icon,
  tone = "ink",
  art,
  children,
}: {
  icon: IconName;
  tone?: "ink" | "accent" | "muted";
  art?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 bg-panel p-4 text-sm ${noticeClass[tone]}`} role="status">
      {art ?? (
        <span className="self-start pt-1">
          <Icon name={icon} />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-60">{children}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <p className="mb-2 font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-muted">{eyebrow}</p>
      <h1 className="text-[32px] font-semibold leading-[38px] tracking-[-0.02em]">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4 mt-12">
      <h2 className="text-xl font-semibold leading-7">{children}</h2>
      {note && <p className="mt-1 text-[13px] leading-5 text-muted">{note}</p>}
    </div>
  );
}

export function Tape({ tone, className }: { tone: "ink" | "accent"; className: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={`tape${tone}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="16" height="16" className="fill-paper" />
          <rect width="8" height="16" className={tone === "ink" ? "fill-ink" : "fill-accent"} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#tape${tone})`} />
    </svg>
  );
}

export function BrokenLine({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <svg viewBox="0 0 160 48" width="160" height="48" fill="none" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <g className="stroke-ink">
        <rect x="6" y="6" width="6" height="26" />
        <rect x="148" y="6" width="6" height="26" />
      </g>
      {loading ? (
        <path d="M12 13H148M12 25H148" strokeDasharray="4 6" className="loadingDash stroke-muted" />
      ) : (
        <>
          <path d="M12 13H70M12 25H70M90 13H148M90 25H148" className="stroke-ink" />
          <rect x="66" y="13" width="4" height="12" fill="url(#hatch)" className="stroke-ink" />
          <rect x="90" y="13" width="4" height="12" fill="url(#hatch)" className="stroke-ink" />
          <path d="M74 10l4 6-4 6 4 6M86 10l-4 6 4 6-4 6" strokeWidth="2" className="stroke-accent" />
        </>
      )}
      <text x="80" y="45" textAnchor="middle" fontSize="11" className="fill-muted font-mono">
        {label}
      </text>
    </svg>
  );
}

export function ChainLink({ kind, value, label }: { kind: "tx" | "address"; value: string; label?: string }) {
  const text = label ?? shortHash(value);
  if (!explorerUrl) return <span className="font-mono text-sm" title={value}>{text}</span>;
  return (
    <a
      href={`${explorerUrl}/${kind}/${value}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${value} in the explorer`}
      className="inline-flex items-center gap-1 font-mono text-sm underline decoration-line underline-offset-4 hover:text-accent"
    >
      {text}
      <Icon name="external" />
    </a>
  );
}

export function ChainGate({ children }: { children: (registry: Address) => ReactNode }) {
  if (!chain || !registryAddress)
    return (
      <Notice icon="warning" tone="accent" art={<BrokenLine label="rpc" />}>
        Chain settings are missing, so this page cannot read SealRegistry. Set NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_RPC_URL,
        NEXT_PUBLIC_EXPLORER_URL, NEXT_PUBLIC_NATIVE_SYMBOL and NEXT_PUBLIC_REGISTRY_ADDRESS, then rebuild.
      </Notice>
    );
  return children(registryAddress);
}

type LoadError = { message: string; shortMessage?: string };

type QueryLike<T> = { status: "pending" | "error" | "success"; error: LoadError | null; data: T | undefined };

export function errorText(error: LoadError | null | undefined): string {
  const text = error?.shortMessage ?? error?.message ?? "Something went wrong while loading.";
  return text === "HTTP request failed." ? `The chain RPC at ${chain?.rpcUrls.default.http[0] ?? "NEXT_PUBLIC_RPC_URL"} did not answer.` : text;
}

export function QueryState<T>({
  query,
  loading,
  empty,
  isEmpty,
  emptyArt,
  children,
}: {
  query: QueryLike<T>;
  loading: string;
  empty?: string;
  isEmpty?: (data: T) => boolean;
  emptyArt?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const source = query.error?.shortMessage === undefined ? "service" : "rpc";
  if (query.status === "pending")
    return (
      <Notice icon="clock" tone="muted" art={<BrokenLine label="loading" loading />}>
        {loading}
      </Notice>
    );
  if (query.status === "error")
    return (
      <Notice icon="warning" tone="accent" art={<BrokenLine label={source} />}>
        {errorText(query.error)}
      </Notice>
    );
  const data = query.data as T;
  if (empty && isEmpty?.(data))
    return (
      <Notice icon="info" tone="muted" art={emptyArt}>
        {empty}
      </Notice>
    );
  return children(data);
}
