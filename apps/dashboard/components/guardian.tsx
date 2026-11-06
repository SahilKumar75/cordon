"use client";

import { useState } from "react";
import { keccak256, toBytes, type Address } from "viem";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { hex32Schema, sealRegistryAbi, sealStatusNames, type Hex32 } from "@cordon/shared";
import { chain } from "@/lib/env";
import { Dimension } from "./drawing";
import { formatDateTime, formatGap } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { BrokenLine, ChainLink, errorText, Notice, QueryState, SealStatus, Status } from "./ui";

export function Guardian({ registry, initialKey }: { registry: Address; initialKey: string }) {
  const [key, setKey] = useState(initialKey);
  const valid = hex32Schema.safeParse(key).success;
  return (
    <div className="space-y-6">
      <WalletBar />
      <label className="block space-y-2">
        <span className="text-sm font-medium">Seal key</span>
        <input className="field" value={key} onChange={(event) => setKey(event.target.value.trim())} placeholder="0x…" spellCheck={false} />
      </label>
      {!key && (
        <Notice icon="info" tone="muted" art={<LockDrawing />}>
          Paste a seal key, or open a version on the Sealed page and choose Unseal or reseal.
        </Notice>
      )}
      {key && !valid && (
        <Notice icon="warning" tone="accent">
          That is not a seal key. It should be 0x followed by 64 lowercase hex characters.
        </Notice>
      )}
      {valid && <SealControl registry={registry} sealKey={key as Hex32} />}
    </div>
  );
}

function WalletBar() {
  const { address, chainId, isConnected } = useAccount();
  const connect = useConnect();
  const { disconnect } = useDisconnect();
  const switcher = useSwitchChain();
  const targetId = chain?.id ?? 0;
  const connector = connect.connectors[0];
  if (!isConnected || !address)
    return (
      <div className="flex flex-wrap items-center gap-4 border border-line bg-panel p-4">
        <Status icon="wallet" tone="muted">No wallet connected</Status>
        <button className="button" disabled={!connector || connect.isPending} onClick={() => connector && connect.connect({ connector })}>
          {connect.isPending ? "Waiting for the wallet" : "Connect browser wallet"}
        </button>
        {connect.error && <span className="text-sm text-accent">{connect.error.message}</span>}
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-4 border border-line bg-panel p-4">
      <Status icon="wallet">Connected</Status>
      <ChainLink kind="address" value={address} />
      {chainId === targetId ? (
        <Status icon="check">On chain {targetId}</Status>
      ) : (
        <>
          <Status icon="warning" tone="accent">Wallet is on chain {chainId}</Status>
          <button className="button" onClick={() => switcher.switchChain({ chainId: targetId })} disabled={switcher.isPending}>
            Switch to chain {targetId}
          </button>
        </>
      )}
      <button className="button buttonQuiet" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}

function SealControl({ registry: address, sealKey }: { registry: Address; sealKey: Hex32 }) {
  const seal = useReadContract({ address, abi: sealRegistryAbi, functionName: "getSeal", args: [sealKey], query: { refetchInterval: 4000 } });
  const disputeWindow = useReadContract({ address, abi: sealRegistryAbi, functionName: "disputeWindow" });
  const { isConnected, chainId } = useAccount();
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data });
  const [reason, setReason] = useState("");
  const now = useNow(1000);
  return (
    <QueryState query={seal} loading="Reading this seal from SealRegistry.">
      {(current) => {
        const status = sealStatusNames[current.status] ?? "None";
        if (status === "None")
          return (
            <Notice icon="info" tone="muted">
              This version has never been sealed, so there is nothing to unseal or reseal.
            </Notice>
          );
        const action = status === "Sealed" ? "unseal" : "reseal";
        const opensAt = disputeWindow.data === undefined ? null : (Number(current.sealedAt) + Number(disputeWindow.data)) * 1000;
        const waiting = action === "unseal" && (opensAt === null || opensAt > now);
        const blocker = !isConnected
          ? "Connect the guardian wallet first."
          : chainId !== chain?.id
            ? "Switch the wallet to the configured chain first."
            : waiting
              ? "The dispute window is still open."
              : reason.trim() === ""
                ? "Write a reason first."
                : null;
        return (
          <div className="space-y-6 border border-line bg-panel p-6">
            <div className="flex flex-wrap items-center gap-6">
              <SealStatus status={status} />
              <span className="text-sm text-muted">{current.votes} detector votes</span>
              {current.sealedAt > 0n && <span className="text-sm text-muted">Sealed {formatDateTime(Number(current.sealedAt) * 1000)}</span>}
            </div>
            {action === "unseal" &&
              (disputeWindow.error ? (
                <Notice icon="warning" tone="accent">
                  Could not read the dispute window, so unseal stays disabled:{" "}
                  {errorText(disputeWindow.error)}
                </Notice>
              ) : opensAt === null ? (
                <Status icon="clock" tone="muted">Reading the dispute window</Status>
              ) : opensAt > now ? (
                <Status icon="clock" tone="accent">
                  Dispute window open. Unseal possible in {formatGap(opensAt - now)}, at {formatDateTime(opensAt)}.
                </Status>
              ) : (
                <Status icon="check">Dispute window closed at {formatDateTime(opensAt)}. Unseal is possible.</Status>
              ))}
            <label className="block space-y-2">
              <span className="text-sm font-medium">Reason</span>
              <textarea className="field min-h-24 font-sans" value={reason} onChange={(event) => setReason(event.target.value)} />
              <span className="block text-sm text-muted">Only the keccak256 hash of this text goes on chain. Keep the full text in your incident notes.</span>
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <button
                className="button"
                disabled={blocker !== null || write.isPending}
                onClick={() =>
                  write.writeContract({ address, abi: sealRegistryAbi, functionName: action, args: [sealKey, keccak256(toBytes(reason.trim()))] })
                }
              >
                {action === "unseal" ? "Unseal this version" : "Reseal this version"}
              </button>
              {blocker && <span className="text-sm text-muted">{blocker}</span>}
            </div>
            {write.isPending && <Status icon="wallet" tone="muted">Confirm the transaction in your wallet.</Status>}
            {write.error && (
              <Notice icon="warning" tone="accent" art={<BrokenLine label="rpc" />}>
                {errorText(write.error)}
              </Notice>
            )}
            {write.data && (
              <div className="flex flex-wrap items-center gap-4">
                <ChainLink kind="tx" value={write.data} label="Guardian transaction" />
                {receipt.isPending ? (
                  <Status icon="clock" tone="muted">Waiting for the block</Status>
                ) : receipt.data?.status === "success" ? (
                  <Status icon="check">Confirmed in block {receipt.data.blockNumber.toString()}</Status>
                ) : (
                  <Status icon="warning" tone="accent">Transaction failed or was dropped</Status>
                )}
              </div>
            )}
          </div>
        );
      }}
    </QueryState>
  );
}

function LockDrawing() {
  const { isConnected, chainId } = useAccount();
  const state = !isConnected ? "none" : chainId === chain?.id ? "seated" : "wrong";
  return (
    <svg viewBox="0 0 320 120" width="240" height="90" fill="none" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <rect x="110" y="34" width="100" height="60" fill="url(#hatch)" className="stroke-ink" />
      <circle cx="160" cy="58" r="7" className="fill-paper stroke-ink" />
      <path d="M156 63l-3 14h14l-3-14" className="fill-paper stroke-ink" />
      {state === "seated" ? (
        <g className="stroke-ink">
          <circle cx="160" cy="10" r="7" />
          <path d="M160 17v41M160 40h6M160 47h5" />
        </g>
      ) : (
        <g className={state === "none" ? "stroke-muted" : "stroke-ink"} strokeDasharray={state === "none" ? "4 4" : undefined}>
          <circle cx="118" cy="16" r="8" />
          <path d="M126 16h64M178 16v7M186 16v5" />
        </g>
      )}
      {state === "wrong" && <path d="M152 50l16 16M168 50l-16 16" strokeWidth="2.5" className="stroke-accent" />}
      <Dimension x1={70} x2={250} y={108} label="dispute window" />
    </svg>
  );
}
