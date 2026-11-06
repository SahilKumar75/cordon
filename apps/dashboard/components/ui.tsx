import type { ReactNode } from "react";
import type { Address } from "viem";
import type { SealStatusName } from "@cordon/shared";
import { chain, explorerUrl, registryAddress } from "@/lib/env";
import { shortHash } from "@/lib/format";
import { Icon, type IconName } from "./icon";

type Tone = "ink" | "accent" | "muted" | "clean" | "sealed" | "blocked" | "pending";

const toneClass: Record<Tone, string> = {
  ink: "text-fg",
  accent: "text-fg [&>svg]:text-signal",
  muted: "text-dim",
  clean: "text-clean",
  sealed: "text-signal",
  blocked: "text-signal",
  pending: "text-dim",
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
    <span className="inline-flex items-center gap-1 border border-dim px-1.5 py-px font-mono text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-dim">
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
  ink: "text-fg",
  muted: "text-dim",
  accent: "text-fg [&>span>svg]:text-signal",
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
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm ${noticeClass[tone]}`} role="status">
      {art ?? (
        <span className="self-start pt-1">
          <Icon name={icon} />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-60">{children}</div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-10">
      <h1 className="text-[32px] font-semibold leading-[38px] tracking-[-0.02em]">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-[15px] text-dim">{children}</p>}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-12 text-sm font-medium text-dim">{children}</h2>;
}

export function BrokenLine({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <svg viewBox="0 0 160 48" width="160" height="48" fill="none" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <g className="stroke-fg">
        <rect x="6" y="6" width="6" height="26" />
        <rect x="148" y="6" width="6" height="26" />
      </g>
      {loading ? (
        <path d="M12 13H148M12 25H148" strokeDasharray="4 6" className="loadingDash stroke-dim" />
      ) : (
        <>
          <path d="M12 13H70M12 25H70M90 13H148M90 25H148" className="stroke-fg" />
          <rect x="66" y="13" width="4" height="12" fill="url(#hatch)" className="stroke-fg" />
          <rect x="90" y="13" width="4" height="12" fill="url(#hatch)" className="stroke-fg" />
          <path d="M74 10l4 6-4 6 4 6M86 10l-4 6 4 6-4 6" strokeWidth="2" className="stroke-signal" />
        </>
      )}
      <text x="80" y="45" textAnchor="middle" fontSize="11" className="fill-dim font-mono">
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
      className="inline-flex items-center gap-1 font-mono text-sm underline decoration-hair underline-offset-4 hover:text-fg"
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
