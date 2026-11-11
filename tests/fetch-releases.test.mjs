import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshot = {
  generatedAt: "2026-11-09T03:55:00.000Z",
  releases: [],
};
const published = {
  id: "release-new",
  version: "0.3.28",
  channel: "prod",
  status: "Published",
  publishedAt: "2026-11-11T02:49:12.080Z",
  assets: [{ id: "asset-new", filename: "Studio_0.3.28_x64-setup.exe", size: "6730155" }],
};

async function workspace(t, { releases = [published], authError = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "pointcloud-sync-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
  await mkdir(join(dir, "public"));
  const dataPath = join(dir, "public", "releases.json");
  await writeFile(dataPath, JSON.stringify(snapshot));
  const mockPath = join(dir, "mock-cloud.mjs");
  await writeFile(mockPath, `
    import assert from "node:assert/strict";
    const releases = ${JSON.stringify(releases)};
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith("/apiKeys.authenticate")) {
        assert.equal(url.origin, "https://auth.crabnebula.cloud");
        assert.equal(init.method, "POST");
        assert.equal(JSON.parse(init.body), "test-api-key");
        return Response.json({ result: ${JSON.stringify(authError
          ? { type: "error", data: { code: 401, message: "unauthenticated" } }
          : { type: "response", data: { accessToken: "test-access-token" } })} });
      }
      if (new Headers(init.headers).get("authorization") !== "Bearer test-access-token") {
        return Response.json({ result: { type: "error", data: { code: 401, message: "InvalidToken" } } });
      }
      if (url.pathname.endsWith("/distribution.release.list")) {
        return Response.json({ result: { type: "response", data: releases } });
      }
      throw new Error("Unexpected Cloud request");
    };
  `);
  return { dir, dataPath, mockPath };
}

async function sync(files, args = [], env = {}) {
  return run(process.execPath, ["--import", pathToFileURL(files.mockPath).href, join(files.dir, "scripts", "fetch-releases.mjs"), ...args], {
    cwd: files.dir,
    env: { ...process.env, CRABNEBULA_TOKEN: "test-api-key", CRABNEBULA_API_KEY: "", CN_API_KEY: "", ...env },
    timeout: 15_000,
  });
}

test("有效 API key 先换取访问令牌，再将新版本写入清单", async (t) => {
  const files = await workspace(t);
  const result = await sync(files);
  const data = JSON.parse(await readFile(files.dataPath, "utf8"));
  assert.equal(data.latestByPlatform["windows-x86_64"].version, "0.3.28");
  assert.equal(data.releases[0].assets[0].bytes, 6730155);
  assert.match(result.stdout, /wrote public\/releases.json/);
  assert.doesNotMatch(result.stdout + result.stderr + JSON.stringify(data), /test-api-key|test-access-token/);
});

test("按 Cloud 的 pubDate 保存发布日期，只展示已发布的版本", async (t) => {
  const release = { ...published, publishedAt: undefined, pubDate: published.publishedAt };
  const files = await workspace(t, { releases: [
    { ...release, id: "draft", status: "Draft", version: "0.3.30" },
    { ...release, id: "purged", status: "Purged", version: "0.3.29" },
    release,
  ] });
  await sync(files);
  const data = JSON.parse(await readFile(files.dataPath, "utf8"));
  assert.deepEqual(data.releases.map((r) => r.id), ["release-new"]);
  assert.equal(data.releases[0].publishedAt, release.pubDate);
  assert.equal(data.latestByPlatform["windows-x86_64"].version, "0.3.28");
});

test("安装包架构以明确的文件名为准，Android 平台归一化为页面可识别的值", async (t) => {
  const files = await workspace(t, { releases: [{ ...published, assets: [
    { id: "deb", filename: "Studio_0.3.28_arm64.deb", updatePlatform: "linux-x86_64", size: "100" },
    { id: "appimage", filename: "Studio_0.3.28_aarch64.AppImage", updatePlatform: "linux-x86_64", size: "200" },
    { id: "apk", filename: "studio-universal.apk", publicPlatform: "android-apk", size: "300" },
  ] }] });
  await sync(files);
  const data = JSON.parse(await readFile(files.dataPath, "utf8"));
  assert.deepEqual(data.releases[0].assets.map((a) => a.platform), ["linux-aarch64", "linux-aarch64", "android"]);
  assert.equal(data.latestByPlatform["linux-aarch64"].version, "0.3.28");
  assert.equal(data.latestByPlatform.android.version, "0.3.28");
});

test("认证失败时返回非零状态并完整保留原清单", async (t) => {
  const files = await workspace(t, { authError: true });
  const before = await readFile(files.dataPath, "utf8");
  await assert.rejects(sync(files), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /apiKeys\.authenticate: 401 unauthenticated/);
    assert.doesNotMatch(err.stderr, /test-api-key|test-access-token/);
    return true;
  });
  assert.equal(await readFile(files.dataPath, "utf8"), before);
});

test("离线模式跳过认证并保留原清单", async (t) => {
  const files = await workspace(t, { authError: true });
  await sync(files, ["--offline"]);
  assert.deepEqual(JSON.parse(await readFile(files.dataPath, "utf8")), snapshot);
});

test("未知的发布列表响应不会覆盖已有清单", async (t) => {
  const files = await workspace(t, { releases: { unexpected: true } });
  const before = await readFile(files.dataPath, "utf8");
  await assert.rejects(sync(files), (err) => {
    assert.equal(err.code, 1);
    assert.match(err.stderr, /发布列表格式不符合预期/);
    return true;
  });
  assert.equal(await readFile(files.dataPath, "utf8"), before);
});
