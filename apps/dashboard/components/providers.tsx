"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { chain } from "@/lib/env";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const wagmiConfig = chain
  ? createConfig({
      chains: [chain],
      connectors: [injected()],
      transports: { [chain.id]: http(chain.rpcUrls.default.http[0]) },
      ssr: true,
    })
  : null;

export function Providers({ children }: { children: ReactNode }) {
  const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return wagmiConfig ? <WagmiProvider config={wagmiConfig}>{tree}</WagmiProvider> : tree;
}
