import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareVersions, latestDownloads } from "../public/releases-model.js";
import { renderReadings, renderReleases } from "../public/releases-view.js";
import { renderPageHtml } from "../scripts/render-page.mjs";

const asset = (id, platform, kind = "deb", filename = `${id}.${kind}`) => ({
  id, platform, kind, filename, bytes: 10485760,
});
const release = (version, assets, channel = "prod", publishedAt = "2026-11-11T04:00:00Z") => ({
  version, assets, channel, publishedAt, summary: "点云采集与回放更新",
});
const snapshot = (releases) => ({ generatedAt: "2026-11-11T06:00:00Z", releases });
const linuxPanel = (html, platform) => {
  const match = html.match(new RegExp(`<article[^>]+data-download-platform="${platform}"[^>]*>([\\s\\S]*?)</article>`));
  assert.ok(match, `${platform} 有独立下载区域`);
  return match[1];
};

test("两个 Linux 架构独立选择稳定版，不会被另一个架构的新版本隐藏", () => {
  const data = snapshot([
    release("0.4.0", [asset("arm-new", "linux-aarch64")]),
    release("0.3.28", [asset("x64-stable", "linux-x86_64")]),
    release("0.5.0-alpha.1", [asset("x64-preview", "linux-x86_64")], "alpha"),
  ]);
  const latest = latestDownloads(data.releases);
  assert.equal(latest.get("linux-x86_64").version, "0.3.28");
  assert.equal(latest.get("linux-aarch64").version, "0.4.0");
  const html = renderReadings(data);
  const x64 = linuxPanel(html, "linux-x86_64");
  const arm = linuxPanel(html, "linux-aarch64");
  assert.match(x64, /0\.3\.28/);
  assert.match(arm, /0\.4\.0/);
  assert.doesNotMatch(x64, /arm-new|x64-preview/);
  assert.doesNotMatch(arm, /x64-stable/);
});

test("同版本分批上传的格式合并到所属架构，重复资产只显示一次", () => {
  const deb = asset("arm-deb", "linux-aarch64");
  const data = snapshot([
    release("0.3.28", [deb]),
    release("0.3.28", [deb, asset("arm-rpm", "linux-aarch64", "rpm")]),
    release("0.3.28", [asset("x64-image", "linux-x86_64", "appimage")]),
  ]);
  assert.equal(latestDownloads(data.releases).get("linux-aarch64").assets.length, 2);
  const arm = linuxPanel(renderReadings(data), "linux-aarch64");
  assert.match(arm, /arm-deb/);
  assert.match(arm, /arm-rpm/);
  assert.doesNotMatch(arm, /x64-image/);
});

test("两个 Linux 架构的 deb 格式标注推荐，其他格式不误标", () => {
  const data = snapshot([release("0.3.28", [
    asset("x64-deb", "linux-x86_64"),
    asset("x64-image", "linux-x86_64", "appimage"),
    asset("arm-deb", "linux-aarch64"),
    asset("arm-rpm", "linux-aarch64", "rpm"),
  ])]);
  const html = renderReadings(data);
  for (const key of ["linux-x86_64", "linux-aarch64"]) {
    const panel = linuxPanel(html, key);
    assert.equal((panel.match(/class="picker__recommendation"/g) ?? []).length, 1);
    assert.match(panel, /deb <span class="picker__recommendation">推荐<\/span>/);
    assert.match(panel, /aria-label="下载 Linux [^"]+ deb（推荐）"/);
  }
});

test("Android APK 有下载入口和独立筛选，Linux 筛选区分架构", () => {
  const data = snapshot([release("0.3.28", [
    asset("x64", "linux-x86_64"),
    asset("arm", "linux-aarch64"),
    asset("phone", "android", "apk", "studio-universal-release.apk"),
  ])]);
  const readings = renderReadings(data);
  assert.match(readings, /下载 Android 版/);
  assert.match(readings, /https:\/\/cdn\.crabnebula\.app\/asset\/phone/);
  assert.doesNotMatch(readings, /Android[^<]*暂无/);
  const history = renderReleases(data);
  assert.match(history, /data-platform="linux-x86_64"[^>]*>Linux x86_64/);
  assert.match(history, /data-platform="linux-aarch64"[^>]*>Linux ARM64/);
  assert.match(history, /data-platform="android"[^>]*>Android/);
  assert.doesNotMatch(history, /<button[^>]+data-platform="macos"/);
  assert.doesNotMatch(history, /<div class="platforms"[^>]+hidden/);
  assert.equal((history.match(/<tr data-platform=/g) ?? []).length, 3);
});

test("没有稳定版时允许预览版，并明确标注；未发布的架构如实显示暂无", () => {
  const html = renderReadings(snapshot([
    release("0.4.0-alpha.2", [asset("preview", "linux-aarch64")], "alpha"),
  ]));
  assert.match(linuxPanel(html, "linux-aarch64"), /预览版/);
  assert.match(linuxPanel(html, "linux-x86_64"), /暂无已发布的安装包/);
  assert.doesNotMatch(linuxPanel(html, "linux-x86_64"), /href=/);
  assert.equal((renderReadings(snapshot([])).match(/href=/g) ?? []).length, 0);
});

test("页面转义外部版本、摘要和文件名，下载地址保持固定 CDN", () => {
  const payload = '<img src=x onerror="alert(1)">';
  const item = release("0.3.28", [asset('file\" onclick=\"alert(1)', "android", "apk", payload)]);
  item.summary = payload;
  const html = renderReadings(snapshot([item])) + renderReleases(snapshot([item]));
  assert.doesNotMatch(html, /<img|href="javascript:|onclick="/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /https:\/\/cdn\.crabnebula\.app\/asset\/file%22/);
});

test("实际未签名的 APK 标注安装限制，已签名文件不显示该提示", () => {
  const unsigned = snapshot([release("0.3.28", [asset("phone", "android", "apk", "studio-universal-release-unsigned.apk")])]);
  assert.match(renderReadings(unsigned), /未签名/);
  const signed = snapshot([release("0.3.28", [asset("phone", "android", "apk", "studio-universal-release.apk")])]);
  assert.doesNotMatch(renderReadings(signed), /未签名/);
});

test("语义版本比较正确处理正式版、预览编号和构建元数据", () => {
  assert.ok(compareVersions("0.3.28", "0.3.28-alpha.9") > 0);
  assert.ok(compareVersions("0.3.28-alpha.10", "0.3.28-alpha.9") > 0);
  assert.ok(compareVersions("0.3.28-beta.1", "0.3.28-alpha.10") > 0);
  assert.equal(compareVersions("0.3.28+build.2", "0.3.28+build.1"), 0);
});

test("静态生成同时更新架构下载、Android、筛选和同步时间，重复构建结果一致", async () => {
  const template = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const data = snapshot([release("0.3.28", [
    asset("x64", "linux-x86_64"), asset("arm", "linux-aarch64"), asset("phone", "android", "apk"),
  ])]);
  const html = renderPageHtml(template, data);
  assert.match(html, /下载 x86_64 版/);
  assert.match(html, /下载 ARM64 版/);
  assert.match(html, /下载 Android 版/);
  assert.match(html, /3 个安装包，1 次发布，同步于 2026-11-11/);
  assert.match(html, /<script src="app\.js" defer><\/script>/);
  assert.equal(renderPageHtml(html, data), html);
  assert.throws(() => renderPageHtml("<html></html>", data), /readings/);
});
