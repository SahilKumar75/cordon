import type { ReactNode } from "react";
import type { Address } from "viem";
import type { SealStatusName } from "@bulkhead/shared";
import { chain, explorerUrl, registryAddress } from "@/lib/env";
import { shortHash } from "@/lib/format";
import { Icon, type IconName } from "./icon";

type Tone = "ink" | "accent" | "muted";

const toneClass: Record<Tone, string> = { ink: "text-ink", accent: "text-accent", muted: "text-muted" };

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
    <span className="inline-flex items-center gap-1 border border-ink px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide">
      <Icon name={icon} />
      {children}
    </span>
  );
}

export const SimulatedTag = () => <Tag icon="flask">Simulated</Tag>;

const sealStatusView: Record<SealStatusName, { icon: IconName; tone: Tone; label: string }> = {
  Sealed: { icon: "sealed", tone: "accent", label: "Sealed" },
  Unsealed: { icon: "unsealed", tone: "ink", label: "Unsealed by guardian" },
  None: { icon: "pending", tone: "muted", label: "Not sealed" },
};

export function SealStatus({ status }: { status: SealStatusName }) {
  const view = sealStatusView[status];
  return (
    <Status icon={view.icon} tone={view.tone}>
      {view.label}
    </Status>
  );
}

export function Notice({ icon, tone = "ink", children }: { icon: IconName; tone?: Tone; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-3 border border-line bg-panel p-4 text-sm ${toneClass[tone]}`} role="status">
      <span className="mt-0.5">
        <Icon name={icon} />
      </span>
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-muted">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4 mt-12">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
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
      <Notice icon="warning" tone="accent">
        Chain settings are missing, so this page cannot read SealRegistry. Set NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_RPC_URL,
        NEXT_PUBLIC_EXPLORER_URL, NEXT_PUBLIC_NATIVE_SYMBOL and NEXT_PUBLIC_REGISTRY_ADDRESS, then rebuild.
      </Notice>
    );
  return children(registryAddress);
}

type QueryLike<T> = { status: "pending" | "error" | "success"; error: { message: string; shortMessage?: string } | null; data: T | undefined };

export function QueryState<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: {
  query: QueryLike<T>;
  loading: string;
  empty?: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.status === "pending")
    return (
      <Notice icon="clock" tone="muted">
        {loading}
      </Notice>
    );
  if (query.status === "error")
    return (
      <Notice icon="warning" tone="accent">
        {query.error?.shortMessage ?? query.error?.message ?? "Something went wrong while loading."}
      </Notice>
    );
  const data = query.data as T;
  if (empty && isEmpty?.(data))
    return (
      <Notice icon="info" tone="muted">
        {empty}
      </Notice>
    );
  return children(data);
}
