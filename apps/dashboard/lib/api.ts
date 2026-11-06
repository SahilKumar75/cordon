"use client";

import { useQuery } from "@tanstack/react-query";

type Service = "watcher" | "detectors" | "registry";

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

const upstreams: Record<Service, { url: string | undefined; setting: string; label: string }> = {
  watcher: { url: process.env.NEXT_PUBLIC_WATCHER_URL, setting: "NEXT_PUBLIC_WATCHER_URL", label: "watcher" },
  detectors: { url: process.env.NEXT_PUBLIC_DETECTORS_URL, setting: "NEXT_PUBLIC_DETECTORS_URL", label: "detectors service" },
  registry: { url: process.env.NEXT_PUBLIC_MOCK_REGISTRY_URL, setting: "NEXT_PUBLIC_MOCK_REGISTRY_URL", label: "demo registry" },
};

export const anyJson: Schema<unknown> = { safeParse: (data) => ({ success: true, data }) };

export async function request<T>(service: Service, path: string, schema: Schema<T>, body?: unknown): Promise<T> {
  const { url, setting, label } = upstreams[service];
  if (!url) throw new Error(`The ${label} address is not set. Add ${setting} to the dashboard environment and rebuild.`);
  const response = await fetch(
    `/proxy/${service}${path}`,
    body === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (!response.ok) {
    const reason = (payload as { error?: string } | null)?.error;
    throw new Error(
      reason
        ? `The ${label} refused the request: ${reason}`
        : `The ${label} answered ${response.status}. It may be offline or still starting.`,
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(`The ${label} sent data in a shape this dashboard does not understand.`);
  return parsed.data;
}

export function usePolled<T>(service: Service, path: string, schema: Schema<T>, interval: number | false = 2000) {
  return useQuery({ queryKey: [service, path], queryFn: () => request(service, path, schema), refetchInterval: interval });
}
