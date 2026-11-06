"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { defineAppChain } from "@cordon/shared";
import { chain } from "@/lib/env";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const unsetChain = defineAppChain({ id: 31337, rpcUrl: "http://127.0.0.1:8545", explorerUrl: "http://127.0.0.1:8545", nativeSymbol: "ETH" });
const activeChain = chain ?? unsetChain;

const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http(activeChain.rpcUrls.default.http[0]) },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
