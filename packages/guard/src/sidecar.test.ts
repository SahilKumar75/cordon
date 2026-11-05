import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceStatusSchema } from "@bulkhead/shared";
import { generatePrivateKey } from "viem/accounts";
import { startSidecar } from "./sidecar.ts";
import { chainTransport, sealedKey, sealedName, sealedVersion, settingsFor, stubFetch, tempDir, writeLockfile, type FetchCall } from "./testFixtures.ts";

test("sidecar health follows the lockfile and reports only changes", async () => {
  const dir = tempDir();
  const lockfile = writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: "1.4.0" } });
  const reportUrl = "http://watcher.test/reports";
  const calls: FetchCall[] = [];
  const settings = settingsFor(lockfile, {
    transport: chainTransport([{ key: sealedKey, status: 1 }]),
    reportUrl,
    reporterPrivateKey: generatePrivateKey(),
    fetchFn: stubFetch({ [reportUrl]: { recorded: 1 } }, calls),
  });
  const sidecar = await startSidecar({ ...settings, service: "ordersApi", port: 0, intervalSeconds: 3600 });
  try {
    assert.equal((await fetch(`${sidecar.url}/health`)).status, 200);
    await sidecar.refresh();
    assert.equal(calls.length, 1);
    writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
    await sidecar.refresh();
    assert.equal((await fetch(`${sidecar.url}/health`)).status, 503);
    const status = serviceStatusSchema.parse(await (await fetch(`${sidecar.url}/status`)).json());
    assert.equal(status.service, "ordersApi");
    assert.equal(status.healthy, false);
    assert.equal(status.report.blocked[0]?.alreadyInstalled, true);
    assert.equal(calls.length, 2);
  } finally {
    await sidecar.close();
  }
});
