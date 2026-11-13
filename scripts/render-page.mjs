#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderReadings, renderReleases, renderStamp } from "../public/releases-view.js";
import { checkSite } from "./check-site.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function replaceBlock(html, name, content) {
  const start = `<!-- begin:${name} -->`;
  const end = `<!-- end:${name} -->`;
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from < 0 || to < from) throw new Error(`index.html 缺少 ${name} 生成区块`);
  return `${html.slice(0, from + start.length)}\n${content}\n    ${html.slice(to)}`;
}

/** 使用同一份渲染逻辑更新静态 HTML；标记缺失时停止，防止发布残缺页面。 */
export function renderPageHtml(template, data) {
  let html = replaceBlock(template, "readings", renderReadings(data));
  html = replaceBlock(html, "releases", renderReleases(data));
  return replaceBlock(html, "stamp", renderStamp(data));
}

/** 从版本清单生成页面，只在内容变化时写入。 */
export async function renderPage({ root = repoRoot, data } = {}) {
  const pagePath = join(root, "public", "index.html");
  const snapshot = data ?? JSON.parse(await readFile(join(root, "public", "releases.json"), "utf8"));
  const template = await readFile(pagePath, "utf8");
  const html = renderPageHtml(template, snapshot);
  if (html !== template) await writeFile(pagePath, html, "utf8");
  return html !== template;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  renderPage().then(async (changed) => {
    const files = await checkSite();
    console.log(changed ? "已根据版本清单更新 public/index.html。" : "public/index.html 与版本清单一致。");
    console.log(`页面资源检查通过：${files.length} 个本地文件。`);
  }).catch((error) => {
    console.error(`页面生成失败：${error.message}`);
    process.exitCode = 1;
  });
}
