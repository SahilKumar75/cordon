import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const localSinkHosts = new Set(["localhost", "127.0.0.1", "canarysink"]);
const token = process.env.CANARY_TOKEN;
const sinkUrl = process.env.CANARY_SINK_URL;
const sinkIsLocal = sinkUrl && URL.canParse(sinkUrl) && localSinkHosts.has(new URL(sinkUrl).hostname);

if (token && sinkIsLocal) {
  writeFileSync(join(tmpdir(), "bulkheadDemoCanary.txt"), token);
  await fetch(new URL("/collect", sinkUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
