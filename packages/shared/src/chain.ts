import { defineChain } from "viem";

export type ChainSettings = {
  id: number;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
};

export function defineBulkheadChain({ id, rpcUrl, explorerUrl, nativeSymbol }: ChainSettings) {
  return defineChain({
    id,
    name: `Chain ${id}`,
    nativeCurrency: { name: nativeSymbol, symbol: nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Explorer", url: explorerUrl } },
  });
}
