import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const packageDir = join(here, "..", "poisonedPackage");
let registry;
let registryUrl;

before(async () => {
  if (!existsSync(join(packageDir, "dist", "bulkheaddemo-colorkit-1.4.1.tgz"))) execFileSync("sh", [join(packageDir, "pack.sh")]);
  const storage = mkdtempSync(join(tmpdir(), "bulkheadRegistryTest"));
  registry = spawn(process.execPath, [join(here, "server.js")], {
    env: { PATH: process.env.PATH, MOCK_REGISTRY_PORT: "0", MOCK_REGISTRY_STORAGE: storage },
  });
  const line = await new Promise((resolve) => registry.stdout.once("data", (data) => resolve(String(data))));
  registryUrl = `http://127.0.0.1:${line.trim().split(":").pop()}`;
});

after(() => registry.kill());

const getJson = (path) => fetch(`${registryUrl}${path}`).then((response) => response.json());

const post = (path, body) =>
  fetch(`${registryUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const sriOf = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

test("startup publishes only 1.4.0, backdated, with a tarball matching its integrity", async () => {
  const changes = await getJson("/_changes?since=0");
  assert.equal(changes.length, 1);
  const [change] = changes;
  assert.equal(change.name, "@bulkheaddemo/colorkit");
  assert.equal(change.version, "1.4.0");
  assert.ok(Date.now() - Date.parse(change.publishedAt) > 7 * 86_400_000);
  assert.match(change.integrity, /^sha512-/);
  const tarball = Buffer.from(await fetch(change.tarballUrl).then((response) => response.arrayBuffer()));
  assert.equal(sriOf(tarball), change.integrity);
});

test("packument answers on the encoded scoped path in the shape npm reads", async () => {
  const packument = await getJson("/@bulkheaddemo%2fcolorkit");
  assert.equal(packument.name, "@bulkheaddemo/colorkit");
  assert.equal(packument["dist-tags"].latest, "1.4.0");
  assert.deepEqual(Object.keys(packument.versions), ["1.4.0"]);
  assert.equal(packument.versions["1.4.0"].version, "1.4.0");
  assert.match(packument.versions["1.4.0"].dist.tarball, /\/@bulkheaddemo\/colorkit\/-\/bulkheaddemo-colorkit-1\.4\.0\.tgz$/);
  assert.ok(packument.time["1.4.0"]);
});

test("unknown packages answer 404 and are never proxied", async () => {
  const response = await fetch(`${registryUrl}/left-pad`);
  assert.equal(response.status, 404);
});

test("publish adds 1.4.1 to the changes feed and packument, reset removes it and seq keeps rising", async () => {
  const [startup] = await getJson("/_changes?since=0");
  const published = await post("/_demo/publish", { name: "@bulkheaddemo/colorkit", version: "1.4.1" });
  assert.equal(published.status, 201);
  const fresh = await getJson(`/_changes?since=${startup.seq}`);
  assert.deepEqual(fresh.map((change) => change.version), ["1.4.1"]);
  assert.ok(fresh[0].seq > startup.seq);
  const packument = await getJson("/@bulkheaddemo%2Fcolorkit");
  assert.equal(packument["dist-tags"].latest, "1.4.1");
  assert.equal(packument.versions["1.4.1"].scripts.postinstall, "node postinstall.js");
  assert.equal((await post("/_demo/publish", { name: "@bulkheaddemo/colorkit", version: "1.4.1" })).status, 409);

  assert.equal((await post("/_demo/reset", {})).status, 200);
  const afterReset = await getJson("/_changes?since=0");
  assert.deepEqual(afterReset.map((change) => change.version), ["1.4.0"]);
  assert.equal((await fetch(fresh[0].tarballUrl)).status, 404);

  await post("/_demo/publish", { name: "@bulkheaddemo/colorkit", version: "1.4.1" });
  const republished = await getJson(`/_changes?since=${fresh[0].seq}`);
  assert.deepEqual(republished.map((change) => change.version), ["1.4.1"]);
});

test("publish refuses other packages, unknown versions and bad bodies", async () => {
  assert.equal((await post("/_demo/publish", { name: "left-pad", version: "1.4.1" })).status, 400);
  assert.equal((await post("/_demo/publish", { name: "@bulkheaddemo/colorkit", version: "../../x" })).status, 400);
  assert.equal((await post("/_demo/publish", { name: "@bulkheaddemo/colorkit", version: "9.9.9" })).status, 404);
  assert.equal((await post("/_demo/publish", { name: "@bulkheaddemo/colorkit" })).status, 400);
});
