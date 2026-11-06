"use client";

import { useReadContract } from "wagmi";
import { sealRegistryAbi } from "@cordon/shared";
import { registryAddress } from "./env";

export function useQuorum() {
  const read = useReadContract({
    address: registryAddress,
    abi: sealRegistryAbi,
    functionName: "quorum",
    query: { enabled: Boolean(registryAddress), staleTime: 60000 },
  });
  return read.data;
}
