import { createServer } from "node:http";

const uncheckedReason = "the guard could not check this service";

function stopReasonOf(report) {
  const [sealed] = report.blocked;
  const [young] = report.tooYoung;
  if (report.outcome === "unavailable") return uncheckedReason;
  if (sealed) return `${sealed.name}@${sealed.version} is sealed`;
  if (report.gitDependencies.length > 0) return "a git dependency is installed";
  if (young) return `${young.name}@${young.version} is newer than the age limit and the sealed list is unavailable`;
  return uncheckedReason;
}

async function stopReason(sidecarUrl) {
  try {
    const response = await fetch(`${sidecarUrl}/status`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return uncheckedReason;
    const status = await response.json();
    return status.healthy ? null : stopReasonOf(status.report);
  } catch (error) {
    const unreachable = error instanceof TypeError || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name));
    if (!unreachable) throw error;
    return uncheckedReason;
  }
}

export function serve(service, answer) {
  const port = Number(process.env.SERVICE_PORT);
  const sidecarUrl = process.env.GUARD_SIDECAR_URL;
  if (!Number.isInteger(port) || !sidecarUrl) throw new Error(`${service} needs SERVICE_PORT and GUARD_SIDECAR_URL`);
  const server = createServer(async (request, response) => {
    const reason = await stopReason(sidecarUrl);
    if (reason !== null) {
      response.writeHead(503, { "content-type": "text/plain" });
      return response.end(`Stopped by the guard: ${reason}\n`);
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ service, ...answer(request) }));
  });
  server.listen(port, "127.0.0.1", () => process.stdout.write(`${service} listening on 127.0.0.1:${server.address().port}\n`));
}
