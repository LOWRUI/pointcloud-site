#!/usr/bin/env node
// Regenerates public/releases.json from the CrabNebula Cloud directory API.
//
// Pass an organisation API key. It is exchanged for a short-lived access token
// before the directory API is queried:
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
import { createCloudClient } from "./crabnebula-client.mjs";
import { renderPageHtml } from "./render-page.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const dataPath = join(repoRoot, "public", "releases.json");
const pagePath = join(repoRoot, "public", "index.html");
let snapshotWritten = false;

const ORG = process.env.CN_ORG ?? "hbzsy";
const APP = process.env.CN_APP ?? "pointcloud-studio";
const API = process.env.CN_API ?? "https://api.crabnebula.app/directory/rspc";
const TOKEN = [process.env.CRABNEBULA_TOKEN, process.env.CRABNEBULA_API_KEY, process.env.CN_API_KEY]
  .map((value) => value?.trim())
  .find(Boolean) ?? "";

const args = new Set(process.argv.slice(2));
const offline = args.has("--offline") || args.has("--dry-run");
const verbose = args.has("--verbose");

function log(...parts) {
  if (verbose) console.log(...parts);
}

/** Explicit filename architecture takes precedence over Cloud's updater metadata. */
function platformOf(asset) {
  const declared = asset.publicPlatform ?? asset.updatePlatform ?? asset.platform;
  const name = (asset.name ?? asset.filename ?? "").toLowerCase();
  const explicitArm = /(?:^|[._-])(?:aarch64|arm64)(?=[._-]|$)/.test(name);
  const explicitX64 = /(?:^|[._-])(?:x86_64|amd64|x64)(?=[._-]|$)/.test(name);
  if (name.endsWith(".apk") || declared === "android-apk") return "android";
  if (explicitArm || explicitX64) {
    const arch = explicitArm ? "aarch64" : "x86_64";
    if (/\.(appimage|deb|rpm)$/.test(name)) return `linux-${arch}`;
    if (/\.(exe|msi)$/.test(name)) return `windows-${arch}`;
    if (/\.(dmg|app\.tar\.gz)$/.test(name)) return `darwin-${arch}`;
  }
  if (typeof declared === "string" && declared.includes("-")) return declared;
  if (name.endsWith(".exe") || name.endsWith(".msi")) return "windows-x86_64";
  if (name.endsWith(".appimage") || name.endsWith(".deb") || name.endsWith(".rpm")) return "linux-x86_64";
  if (name.endsWith(".dmg") || name.endsWith(".app.tar.gz")) {
    return /aarch64|arm64/.test(name) ? "darwin-aarch64" : "darwin-x86_64";
  }
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

function releaseRecord(detail, summary, previous) {
  const version = detail.version ?? summary.version;
  if (typeof version !== "string" || !version || !Array.isArray(detail.assets)) {
    throw new Error("distribution.release.get: 发布详情格式不符合预期");
  }
  const notes = plainNotes(detail.notes ?? detail.changelog, previous?.notes);
  return {
    id: detail.id ?? summary.id,
    version,
    channel: detail.channel ?? summary.channel ?? "prod",
    status: detail.status ?? summary.status,
    publishedAt: detail.pubDate ?? detail.publishedAt ?? detail.published_at ?? summary.pubDate ?? summary.publishedAt ?? null,
    summary: previous?.summary ?? summaryFromNotes(notes),
    notes,
    assets: detail.assets.map((asset) => ({
      id: asset.id,
      platform: platformOf(asset),
      kind: kindOf(asset),
      filename: asset.name ?? asset.filename ?? version,
      bytes: Number(asset.size ?? asset.bytes ?? 0),
    })),
  };
}

async function readPublishedReleases(cloud, existing) {
  const listed = await cloud.query("distribution.release.list", { org: ORG, app: APP });
  const all = Array.isArray(listed) ? listed : listed?.releases;
  if (!Array.isArray(all)) throw new Error("distribution.release.list: 发布列表格式不符合预期");
  const releases = all.filter((release) => release?.status === "Published");
  log(`${releases.length} releases listed`);
  const previous = new Map((existing.releases ?? []).map((release) => [release.version, release]));
  const out = [];
  for (const summary of releases) {
    let detail = summary;
    if (!Array.isArray(summary.assets) || summary.assets.length === 0) {
      detail = await cloud.query("distribution.release.get", String(summary.id));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    if ((detail?.status ?? summary.status) !== "Published") continue;
    out.push(releaseRecord(detail, summary, previous.get(detail.version ?? summary.version)));
  }
  return out.sort((a, b) => compareVersionDesc(a.version, b.version));
}

function makeSnapshot(releases, existing) {
  const latestByPlatform = {};
  for (const release of releases) {
    for (const asset of release.assets) {
      if (!latestByPlatform[asset.platform]) {
        latestByPlatform[asset.platform] = { version: release.version, assetId: asset.id };
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    generator: "scripts/fetch-releases.mjs",
    app: existing.app ?? {
      name: "PointCloud Studio",
      org: ORG,
      slug: APP,
      cloudUrl: `https://web.crabnebula.cloud/${ORG}/${APP}`,
    },
    latestByPlatform,
    releases,
  };
}

async function main() {
  const existing = await loadExisting();
  if (offline || !TOKEN) {
    console.log(offline
      ? "离线模式：public/releases.json 保持不变。"
      : "未设置 CRABNEBULA_TOKEN / CRABNEBULA_API_KEY / CN_API_KEY，public/releases.json 保持不变。");
    report(existing);
    return;
  }
  const cloud = await createCloudClient({ apiKey: TOKEN, directoryApi: API });
  const releases = await readPublishedReleases(cloud, existing);
  const next = makeSnapshot(releases, existing);
  const page = renderPageHtml(await readFile(pagePath, "utf8"), next);

  await writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  snapshotWritten = true;
  await writeFile(pagePath, page, "utf8");
  console.log(`wrote public/releases.json: ${next.releases.length} releases, ${countAssets(next)} assets`);
  console.log("已同步更新 public/index.html 中的默认下载内容。");
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
  console.error(snapshotWritten
    ? "public/releases.json 已更新，但静态页面写入失败。修复文件写入问题后运行 npm run build。"
    : "public/releases.json was not modified.");
  process.exitCode = 1;
});
