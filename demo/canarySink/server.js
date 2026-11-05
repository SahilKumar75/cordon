import { createServer } from "node:http";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.CANARY_SINK_PORT ?? 8080);
const received = new Map();

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function collect(request, response) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  let token;
  try {
    token = JSON.parse(raw).token;
  } catch {
    token = null;
  }
  if (typeof token !== "string" || token.length === 0) {
    return send(response, 400, { error: "Body must be JSON with a string token" });
  }
  received.set(token, new Date().toISOString());
  send(response, 201, { stored: true, simulated: true });
}

function report(url, response) {
  const token = url.searchParams.get("token");
  if (token !== null) return send(response, 200, { received: received.has(token), at: received.get(token) ?? null });
  const entries = [...received].map(([value, at]) => ({ token: value, at }));
  send(response, 200, { simulated: true, entries });
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://sink");
  if (request.method === "POST" && url.pathname === "/collect") return void collect(request, response);
  if (request.method === "GET" && url.pathname === "/received") return report(url, response);
  send(response, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  process.stdout.write(`canary sink (simulated exfiltration) listening on ${host}:${server.address().port}\n`);
});
