import { createServer } from "node:http";

const sealedMessage = "Stopped by Bulkhead: a sealed dependency version is installed\n";
const unreachableMessage = "Stopped by Bulkhead: the guard sidecar is unreachable, so this service fails closed\n";

async function sidecarState(sidecarUrl) {
  try {
    const response = await fetch(`${sidecarUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok ? "healthy" : "sealed";
  } catch {
    return "unreachable";
  }
}

export function serve(service, answer) {
  const port = Number(process.env.SERVICE_PORT);
  const sidecarUrl = process.env.GUARD_SIDECAR_URL;
  if (!Number.isInteger(port) || !sidecarUrl) throw new Error(`${service} needs SERVICE_PORT and GUARD_SIDECAR_URL`);
  const server = createServer(async (request, response) => {
    const state = await sidecarState(sidecarUrl);
    if (state !== "healthy") {
      response.writeHead(503, { "content-type": "text/plain" });
      return response.end(state === "sealed" ? sealedMessage : unreachableMessage);
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service, ...answer(request) }));
  });
  server.listen(port, "127.0.0.1", () => process.stdout.write(`${service} listening on 127.0.0.1:${server.address().port}\n`));
}
