import type { ReactNode } from "react";
import type { Address } from "viem";
import type { EntryStatusName, SealStatusName } from "@cordon/shared";
import { chain, explorerUrl, registryAddress } from "@/lib/env";
import { shortHash } from "@/lib/format";
import { Icon, type IconName } from "./icon";
import { WordReveal } from "./wordReveal";

type Tone = "ink" | "accent" | "muted" | "clean" | "sealed" | "blocked" | "pending";

const toneClass: Record<Tone, string> = {
  ink: "text-bone",
  accent: "text-bone [&>svg]:text-persimmon",
  muted: "text-jade",
  clean: "text-jade",
  sealed: "text-persimmon",
  blocked: "text-persimmon",
  pending: "text-jade",
};

export function Status({ icon, tone = "ink", children }: { icon: IconName; tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] ${toneClass[tone]}`}>
      <Icon name={icon} />
      {children}
    </span>
  );
}

export function Tag({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[2px] border border-jade/60 px-1.5 py-px text-[11px] uppercase leading-4 tracking-[0.1em] text-jade">
      <Icon name={icon} />
      {children}
    </span>
  );
}

export const SimulatedTag = () => <Tag icon="flask">Simulated</Tag>;

const sealStatusView: Record<SealStatusName | EntryStatusName, { icon: IconName; tone: Tone; label: string }> = {
  Sealed: { icon: "sealed", tone: "sealed", label: "Sealed" },
  Unsealed: { icon: "unsealed", tone: "ink", label: "Unsealed by guardian" },
  None: { icon: "pending", tone: "pending", label: "Not sealed" },
  Suspect: { icon: "warning", tone: "accent", label: "Suspect, below quorum" },
  Cleared: { icon: "check", tone: "clean", label: "Cleared by guardian" },
};

export function SealStatus({ status }: { status: SealStatusName | EntryStatusName }) {
  const view = sealStatusView[status];
  return (
    <Status icon={view.icon} tone={view.tone}>
      {view.label}
    </Status>
  );
}

const noticeClass: Record<"ink" | "accent" | "muted", string> = {
  ink: "text-bone",
  muted: "text-jade",
  accent: "text-bone [&>span>svg]:text-persimmon",
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
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-[13px] ${noticeClass[tone]}`} role="status">
      {art ?? (
        <span className="self-start pt-1">
          <Icon name={icon} />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-60">{children}</div>
    </div>
  );
}

export function PageHeader({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  return (
    <header className="headerBand panel mb-10 flex flex-wrap items-end justify-between gap-6 overflow-hidden px-5 py-8 sm:px-8 sm:py-10">
      <div className="min-w-0 max-w-3xl">
        {typeof title === "string" ? (
          <WordReveal text={title} className="break-words font-display text-[34px] leading-[38px] tracking-[-0.01em] sm:text-[44px] sm:leading-[48px]" />
        ) : (
          <h1 className="break-words font-display text-[34px] leading-[38px] tracking-[-0.01em] sm:text-[44px] sm:leading-[48px]">{title}</h1>
        )}
        {children && <p className="mt-3 text-[13px] text-jade">{children}</p>}
      </div>
      {aside}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-5 mt-16 bg-ground/90 px-4 pt-4 sm:-mx-8 sm:px-8">
      <h2 className="pb-3 font-display text-[28px] leading-8">{children}</h2>
      <div className="hairline" />
    </div>
  );
}

export function Stat({ label, value, tone = "text-bone", children }: { label: string; value: ReactNode; tone?: string; children?: ReactNode }) {
  return (
    <div className="panel lift relative overflow-hidden px-5 py-5">
      <div aria-hidden="true" className="glowCopper pointer-events-none absolute -right-10 -top-12 h-36 w-36" />
      <div className="relative text-[12px] text-jade">{label}</div>
      <div className={`relative mt-2 font-display text-[40px] leading-none tabular-nums ${tone}`}>{value}</div>
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}

export function BrokenLine({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <svg viewBox="0 0 160 48" width="160" height="48" fill="none" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <g className="stroke-bone">
        <rect x="6" y="6" width="6" height="26" />
        <rect x="148" y="6" width="6" height="26" />
      </g>
      {loading ? (
        <path d="M12 13H148M12 25H148" strokeDasharray="4 6" className="loadingDash stroke-jade" />
      ) : (
        <>
          <path d="M12 13H70M12 25H70M90 13H148M90 25H148" className="stroke-bone" />
          <rect x="66" y="13" width="4" height="12" fill="url(#hatch)" className="stroke-bone" />
          <rect x="90" y="13" width="4" height="12" fill="url(#hatch)" className="stroke-bone" />
          <path d="M74 10l4 6-4 6 4 6M86 10l-4 6 4 6-4 6" strokeWidth="2" className="stroke-persimmon" />
        </>
      )}
      <text x="80" y="45" textAnchor="middle" fontSize="11" className="fill-jade font-mono">
        {label}
      </text>
    </svg>
  );
}

export function ChainLink({ kind, value, label }: { kind: "tx" | "address"; value: string; label?: string }) {
  const text = label ?? shortHash(value);
  if (!explorerUrl) return <span className="text-[13px] text-jade" title={value}>{text}</span>;
  return (
    <a
      href={`${explorerUrl}/${kind}/${value}`}
      target="_blank"
      rel="noreferrer"
      title={`Open ${value} in the explorer`}
      className="inline-flex items-center gap-1 text-[13px] text-jade underline decoration-plum underline-offset-4 hover:text-bone"
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
