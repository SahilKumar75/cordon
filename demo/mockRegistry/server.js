import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const here = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.MOCK_REGISTRY_PORT ?? 4873);
const storageDir = process.env.MOCK_REGISTRY_STORAGE ?? join(here, "storage");
const distDir = process.env.MOCK_REGISTRY_DIST ?? join(here, "..", "poisonedPackage", "dist");
const tarballDir = join(storageDir, "tarballs");
const statePath = join(storageDir, "state.json");
const demoPackage = "@cordondemo/colorkit";
const startupVersion = "1.4.0";
const startupVersionAgeDays = 30;
let baseUrl;

function readState() {
  return existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { nextSeq: 1, changes: [] };
}

function writeState(state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function tarballFileOf(name, version) {
  return `${name.slice(1).replace("/", "-")}-${version}.tgz`;
}

function manifestOf(tarball) {
  const archive = gunzipSync(tarball);
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const field = (start, length) => archive.subarray(offset + start, offset + start + length).toString("utf8").replace(/\0.*$/s, "");
    const path = field(0, 100);
    if (path === "") break;
    const size = parseInt(field(124, 12).trim(), 8);
    if (path === "package/package.json") return JSON.parse(archive.subarray(offset + 512, offset + 512 + size).toString("utf8"));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("tarball has no package/package.json");
}

function publish(name, version, publishedAt) {
  if (name !== demoPackage) return { status: 400, body: { error: `only ${demoPackage} can be published here` } };
  if (!/^\d+\.\d+\.\d+$/.test(version)) return { status: 400, body: { error: "version must look like 1.2.3" } };
  const file = tarballFileOf(name, version);
  const source = join(distDir, file);
  if (!existsSync(source)) return { status: 404, body: { error: `no packed tarball ${file}, run demo/poisonedPackage/pack.sh` } };
  const state = readState();
  if (state.changes.some((change) => change.version === version)) return { status: 409, body: { error: `${name}@${version} is already published` } };
  const tarball = readFileSync(source);
  copyFileSync(source, join(tarballDir, file));
  const change = {
    seq: state.nextSeq,
    name,
    version,
    publishedAt: publishedAt.toISOString(),
    file,
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    shasum: createHash("sha1").update(tarball).digest("hex"),
    manifest: manifestOf(tarball),
  };
  writeState({ nextSeq: state.nextSeq + 1, changes: [...state.changes, change] });
  return { status: 201, body: registryChangeOf(change) };
}

function tarballUrlOf(change) {
  return `${baseUrl}/${change.name}/-/${change.file}`;
}

function registryChangeOf(change) {
  const { seq, name, version, publishedAt, integrity } = change;
  return { seq, name, version, publishedAt, tarballUrl: tarballUrlOf(change), integrity };
}

function ensureStartupVersion() {
  mkdirSync(tarballDir, { recursive: true });
  if (readState().changes.some((change) => change.version === startupVersion)) return;
  const result = publish(demoPackage, startupVersion, new Date(Date.now() - startupVersionAgeDays * 86_400_000));
  if (result.status !== 201) throw new Error(result.body.error);
}

function packumentOf(changes) {
  const latest = changes.at(-1);
  return {
    _id: demoPackage,
    name: demoPackage,
    "dist-tags": { latest: latest.version },
    versions: Object.fromEntries(
      changes.map((change) => [
        change.version,
        { ...change.manifest, _id: `${change.name}@${change.version}`, dist: { tarball: tarballUrlOf(change), integrity: change.integrity, shasum: change.shasum } },
      ]),
    ),
    time: {
      created: changes[0].publishedAt,
      modified: latest.publishedAt,
      ...Object.fromEntries(changes.map((change) => [change.version, change.publishedAt])),
    },
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

async function handle(request, response) {
  const url = new URL(request.url, "http://registry");
  const path = decodeURIComponent(url.pathname);
  if (request.method === "POST" && path === "/_demo/publish") {
    const body = await readBody(request);
    if (typeof body?.name !== "string" || typeof body?.version !== "string") return sendJson(response, 400, { error: "Body must be JSON with string name and version" });
    const result = publish(body.name, body.version, new Date());
    return sendJson(response, result.status, result.body);
  }
  if (request.method === "POST" && path === "/_demo/reset") {
    const state = readState();
    const kept = state.changes.filter((change) => change.version === startupVersion);
    state.changes.filter((change) => !kept.includes(change)).forEach((change) => rmSync(join(tarballDir, change.file), { force: true }));
    writeState({ nextSeq: state.nextSeq, changes: kept });
    ensureStartupVersion();
    return sendJson(response, 200, readState().changes.map(registryChangeOf));
  }
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const changes = readState().changes;
  if (path === "/_changes") {
    const since = Number(url.searchParams.get("since") ?? 0);
    return sendJson(response, 200, changes.filter((change) => change.seq > since).map(registryChangeOf));
  }
  if (path === `/${demoPackage}`) return sendJson(response, 200, packumentOf(changes));
  const change = changes.find((candidate) => path === `/${demoPackage}/-/${candidate.file}`);
  if (change) {
    response.writeHead(200, { "content-type": "application/octet-stream" });
    return response.end(readFileSync(join(tarballDir, change.file)));
  }
  sendJson(response, 404, { error: "Not found in the demo registry, which never proxies to a public registry" });
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => sendJson(response, 500, { error: error.message }));
});

server.listen(port, host, () => {
  baseUrl = (process.env.MOCK_REGISTRY_URL || `http://127.0.0.1:${server.address().port}`).replace(/\/$/, "");
  ensureStartupVersion();
  process.stdout.write(`mock registry (demo only, never proxies) listening on ${host}:${server.address().port}\n`);
});
