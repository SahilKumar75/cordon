import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ServiceStatus } from "@cordon/shared";
import { checkLockfile, sendReport, type GuardSettings } from "./check.ts";

export type SidecarSettings = GuardSettings & { service: string; port: number; intervalSeconds: number };

export type Sidecar = { url: string; refresh: () => Promise<ServiceStatus>; close: () => Promise<void> };

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

export async function startSidecar(settings: SidecarSettings): Promise<Sidecar> {
  let status: ServiceStatus | null = null;
  const refresh = async () => {
    const report = await checkLockfile({ ...settings, assumeInstalled: true });
    const changed = status?.report.outcome !== report.outcome;
    status = { service: settings.service, healthy: report.outcome === "allowed", report, updatedAt: report.checkedAt };
    if (changed) await sendReport(report, settings);
    return status;
  };
  const server = createServer((request, response) => {
    const healthy = status?.healthy === true;
    if (request.url === "/health") return response.writeHead(healthy ? 200 : 503).end(healthy ? "ok" : "blocked or unavailable");
    if (request.url === "/status" && status) return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(status));
    return response.writeHead(request.url === "/status" ? 503 : 404).end();
  });
  const timer = setInterval(() => refresh().catch((error: Error) => settings.warn(`sidecar check failed: ${error.message}`)), settings.intervalSeconds * 1000);
  const port = await listen(server, settings.port);
  await refresh();
  return {
    url: `http://127.0.0.1:${port}`,
    refresh,
    close: () => {
      clearInterval(timer);
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
