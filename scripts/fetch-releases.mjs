#!/usr/bin/env node
// Regenerates public/releases.json from the CrabNebula Cloud directory API.
//
// The directory API is authenticated: pass a Cloud session token or an API key
// that can read this organisation:
//
//   PowerShell:  $env:CRABNEBULA_TOKEN = "<token>"; npm run sync
//   bash:        CRABNEBULA_TOKEN=<token> npm run sync
//
// Without a token the script merges nothing and exits 0 after writing nothing:
// the checked-in public/releases.json stays the source of truth, which is what
// the static page needs at runtime. Notes that a new release does not carry are
// copied from the existing file so history is never lost.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const dataPath = join(repoRoot, "public", "releases.json");

const ORG = process.env.CN_ORG ?? "hbzsy";
const APP = process.env.CN_APP ?? "pointcloud-studio";
const API = process.env.CN_API ?? "https://api.crabnebula.app/directory/rspc";
const TOKEN = process.env.CRABNEBULA_TOKEN ?? process.env.CRABNEBULA_API_KEY ?? "";
const ASSET_BASE = "https://cdn.crabnebula.app/asset/";

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline") || args.has("--dry-run");
const verbose = args.has("--verbose");

function log(...parts) {
  if (verbose) console.log(...parts);
}

/** rspc over the directory API: POST-ish GET with the input as a JSON query param. */
async function rpc(method, input) {
  const url = new URL(`${API}/${method}`);
  url.searchParams.set("input", JSON.stringify(input));
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${method}: not JSON (HTTP ${res.status}): ${text.slice(0, 160)}`);
  }
  if (body?.result?.type === "error") {
    const { code, message } = body.result.data ?? {};
    throw new Error(`${method}: ${code ?? "?"} ${message ?? "error"}`);
  }
  const data = body?.result?.data;
  if (data === undefined) throw new Error(`${method}: unexpected envelope ${text.slice(0, 160)}`);
  return data;
}

/** Platform comes from Cloud's updater platform, or from the file name as a fallback. */
function platformOf(asset) {
  const declared = asset.publicPlatform ?? asset.updatePlatform ?? asset.platform;
  if (typeof declared === "string" && declared.includes("-")) return declared;
  const name = (asset.name ?? asset.filename ?? "").toLowerCase();
  if (name.endsWith(".exe") || name.endsWith(".msi")) return "windows-x86_64";
  if (name.endsWith(".appimage") || name.endsWith(".deb") || name.endsWith(".rpm")) return "linux-x86_64";
  if (name.endsWith(".dmg") || name.endsWith(".app.tar.gz")) {
    return /aarch64|arm64/.test(name) ? "darwin-aarch64" : "darwin-x86_64";
  }
  if (name.endsWith(".apk")) return "android";
  return "unknown";
}

function kindOf(asset) {
  const name = (asset.name ?? asset.filename ?? "").toLowerCase();
  if (name.endsWith(".exe")) return "exe";
  if (name.endsWith(".msi")) return "msi";
  if (name.endsWith(".deb")) return "deb";
  if (name.endsWith(".rpm")) return "rpm";
  if (name.endsWith(".appimage")) return "appimage";
  if (name.endsWith(".dmg")) return "dmg";
  if (name.endsWith(".apk")) return "apk";
  if (name.endsWith(".tar.gz")) return "tarball";
  return "file";
}

/** Release notes arrive as Markdown; the page prints them as plain paragraphs. */
function plainNotes(markdown, fallback) {
  if (!markdown || !markdown.trim()) return fallback ?? null;
  return markdown.replace(/\r\n/g, "\n").trim();
}

function summaryFromNotes(notes) {
  if (!notes) return null;
  const heading = notes
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("v") && line.includes(" - "));
  if (heading) return heading.split(" - ")[1].replace(/\s*\(.*\)$/, "").trim();
  return null;
}

function compareVersionDesc(a, b) {
  const parse = (v) => v.split(/[.\-+]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i];
    const y = pb[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return y - x;
    if (typeof x === "number") return -1; // 0.3.27 stable sorts above 0.3.27-alpha.1
    if (typeof y === "number") return 1;
    return String(y).localeCompare(String(x));
  }
  return 0;
}

async function loadExisting() {
  if (!existsSync(dataPath)) return { releases: [] };
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch (err) {
    throw new Error(`public/releases.json is not valid JSON: ${err.message}`);
  }
}

async function main() {
  const existing = await loadExisting();

  if (offline) {
    console.log("offline: public/releases.json left unchanged.");
    report(existing);
    return;
  }
  if (!TOKEN) {
    console.log("no CRABNEBULA_TOKEN / CRABNEBULA_API_KEY set: public/releases.json left unchanged.");
    console.log("Set a Cloud token (Settings → API keys, read access) and re-run to refresh.");
    report(existing);
    return;
  }

  const listed = await rpc("distribution.release.list", { org: ORG, app: APP });
  const releases = Array.isArray(listed) ? listed : (listed?.releases ?? []);
  log(`${releases.length} releases listed`);

  const notesByVersion = new Map();
  for (const release of existing.releases ?? []) {
    if (release?.version && release?.notes) notesByVersion.set(release.version, release.notes);
  }
  const summaryByVersion = new Map();
  for (const release of existing.releases ?? []) {
    if (release?.version && release?.summary) summaryByVersion.set(release.version, release.summary);
  }

  const out = [];
  for (const summary of releases) {
    // The list may already carry assets; otherwise ask for the full release.
    let detail = summary;
    if (!Array.isArray(summary.assets) || summary.assets.length === 0) {
      detail = await rpc("distribution.release.get", String(summary.id));
      await new Promise((r) => setTimeout(r, 120)); // keep the API comfortable
    }
    const version = detail.version ?? summary.version;
    const assets = (detail.assets ?? []).map((asset) => ({
      id: asset.id,
      platform: platformOf(asset),
      kind: kindOf(asset),
      filename: asset.name ?? asset.filename ?? `${version}`,
      bytes: Number(asset.size ?? asset.bytes ?? 0),
    }));
    const notes = plainNotes(detail.notes ?? detail.changelog, notesByVersion.get(version));
    out.push({
      id: detail.id ?? summary.id,
      version,
      channel: detail.channel ?? summary.channel ?? "prod",
      status: detail.status ?? summary.status ?? "Published",
      publishedAt: detail.publishedAt ?? detail.published_at ?? summary.publishedAt ?? null,
      summary: summaryByVersion.get(version) ?? summaryFromNotes(notes),
      notes,
      assets,
    });
  }

  out.sort((a, b) => compareVersionDesc(a.version, b.version));

  const latestByPlatform = {};
  for (const release of out) {
    for (const asset of release.assets) {
      if (!latestByPlatform[asset.platform]) {
        latestByPlatform[asset.platform] = { version: release.version, assetId: asset.id };
      }
    }
  }

  const next = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/fetch-releases.mjs",
    app: existing.app ?? {
      name: "PointCloud Studio",
      org: ORG,
      slug: APP,
      cloudUrl: `https://web.crabnebula.cloud/${ORG}/${APP}`,
    },
    // The page shows a plain release history and filters by platform, so the
    // per-channel head (prod / alpha) is not carried any more; "channel" on each
    // release still says which one it came from.
    latestByPlatform,
    releases: out,
  };

  await writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`wrote public/releases.json: ${next.releases.length} releases, ${countAssets(next)} assets`);
  report(next);
}

function countAssets(data) {
  return (data.releases ?? []).reduce((n, r) => n + (r.assets?.length ?? 0), 0);
}

function report(data) {
  const byPlatform = data.latestByPlatform ?? {};
  for (const [platform, info] of Object.entries(byPlatform)) {
    console.log(`  ${platform.padEnd(16)} ${info.version}`);
  }
  const missing = ["darwin-aarch64", "darwin-x86_64"].filter((p) => !byPlatform[p]);
  if (missing.length) console.log(`  not published: ${missing.join(", ")}`);
}

main().catch((err) => {
  console.error(`release:sync failed: ${err.message}`);
  console.error("public/releases.json was not modified.");
  process.exitCode = 1;
});
