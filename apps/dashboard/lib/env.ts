import { isAddress, type Address } from "viem";
import { addressSchema, defineAppChain } from "@cordon/shared";

const settings = {
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL,
  NEXT_PUBLIC_NATIVE_SYMBOL: process.env.NEXT_PUBLIC_NATIVE_SYMBOL,
  NEXT_PUBLIC_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
  NEXT_PUBLIC_WATCHER_URL: process.env.NEXT_PUBLIC_WATCHER_URL,
  NEXT_PUBLIC_DETECTORS_URL: process.env.NEXT_PUBLIC_DETECTORS_URL,
};

export const missingSettings = Object.entries(settings)
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const explorerUrl = (settings.NEXT_PUBLIC_EXPLORER_URL ?? "").replace(/\/$/, "");
const asAddress = (value: string | undefined): Address | undefined =>
  value && addressSchema.safeParse(value).success && isAddress(value, { strict: false }) ? value : undefined;

export const registryAddress = asAddress(settings.NEXT_PUBLIC_REGISTRY_ADDRESS);
export const snapshotSigner = asAddress(process.env.NEXT_PUBLIC_SNAPSHOT_SIGNER);
export const demoEnabled = process.env.NEXT_PUBLIC_DEMO === "true";

const chainId = Number(settings.NEXT_PUBLIC_CHAIN_ID);

export const chain =
  chainId > 0 && settings.NEXT_PUBLIC_RPC_URL && explorerUrl && settings.NEXT_PUBLIC_NATIVE_SYMBOL
    ? defineAppChain({
        id: chainId,
        rpcUrl: settings.NEXT_PUBLIC_RPC_URL,
        explorerUrl,
        nativeSymbol: settings.NEXT_PUBLIC_NATIVE_SYMBOL,
      })
    : null;
