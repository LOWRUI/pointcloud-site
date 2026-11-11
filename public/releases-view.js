import {
  PLATFORMS, KIND_HINT, KIND_LABEL, assetUrl, dateText, isStable,
  latestDownloads, platformMeta, releaseRows, sizeText, sortedAssets, stampText, validateSnapshot,
} from "./releases-model.js";

/** 所有来自发布清单的文本和属性均以纯文本插入。 */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const e = escapeHtml;

function channelChip(channel) {
  return isStable(channel) ? '<span class="chip">稳定版</span>'
    : '<span class="chip chip--alpha">预览版</span>';
}

function formatLink(asset, meta) {
  return `<a class="picker__item" href="${e(assetUrl(asset.id))}" download aria-label="下载 ${e(meta.label)} ${e(KIND_LABEL[asset.kind] ?? asset.kind)}">
  <span class="picker__text"><span class="picker__label">${e(KIND_LABEL[asset.kind] ?? asset.kind)}</span><span class="picker__hint">${e(KIND_HINT[asset.kind] ?? "安装包")}</span></span>
  <span class="picker__size">${e(sizeText(asset.bytes))}</span>
</a>`;
}

function downloadAction(meta, build, primary) {
  const buttonClass = primary ? "btn btn--primary" : "btn btn--quiet";
  const label = `下载 ${meta.os === "Linux" ? meta.arch : meta.os} 版`;
  if (build.assets.length === 1) {
    return `<a class="${buttonClass}" href="${e(assetUrl(build.assets[0].id))}" download>${e(label)}</a>`;
  }
  return `<details class="picker" name="download-format" data-picker="${e(meta.key)}">
  <summary class="${buttonClass} btn--picker">${e(label)}<span class="btn__caret" aria-hidden="true"></span></summary>
  <div class="picker__menu">${sortedAssets(build.assets).map((asset) => formatLink(asset, meta)).join("\n")}</div>
</details>`;
}

function buildContent(meta, build, primary = false) {
  if (!build) return '<p class="reading__unavailable">暂无已发布的安装包</p>';
  const format = build.assets.length > 1 ? `${build.assets.length} 种格式`
    : `${sizeText(build.assets[0].bytes)} · ${KIND_LABEL[build.assets[0].kind] ?? build.assets[0].kind}`;
  const unsigned = meta.key === "android" && build.assets.some((asset) => /(?:^|[-_.])unsigned(?:[-_.]|$)/i.test(asset.filename));
  return `<div class="reading__value">${e(build.version)}</div>
<div class="reading__when"><span>${e(dateText(build.publishedAt))}</span><span>${e(format)}</span>${!build.stable ? channelChip(build.channel) : ""}</div>
<div class="reading__actions">${downloadAction(meta, build, primary)}</div>
${unsigned ? '<p class="reading__note">文件名标记为未签名，安装前请确认已完成 APK 签名。</p>' : ""}`;
}

function readingCard(meta, build, primary) {
  return `<article class="reading" data-download-platform="${e(meta.key)}" aria-label="${e(meta.label)} 下载">
<div class="reading__os">${e(meta.os)} <span class="reading__arch">${e(meta.arch)}</span></div>
${buildContent(meta, build, primary)}
</article>`;
}

function linuxReadings(best) {
  const builds = PLATFORMS.filter((meta) => meta.os === "Linux").map((meta) => `<article class="linux-build" data-download-platform="${meta.key}" aria-label="${e(meta.label)} 下载">
<h3 class="linux-build__name">${meta.arch}</h3>
<p class="linux-build__hint">${meta.hint}</p>
${buildContent(meta, best.get(meta.key))}
</article>`).join("\n");
  return `<section class="reading reading--linux" aria-label="Linux 下载">
<div class="reading__os">Linux <span class="reading__arch">按处理器架构选择</span></div>
<div class="linux-builds">${builds}</div>
</section>`;
}

/** 首页平台下载区域，与构建时的静态内容共用。 */
export function renderReadings(data) {
  validateSnapshot(data);
  const best = latestDownloads(data.releases);
  const windows = PLATFORMS[0];
  const android = platformMeta("android");
  const macs = PLATFORMS.filter((meta) => meta.os === "macOS" && best.has(meta.key));
  return `<div class="readings" aria-label="各平台最新版本">
${readingCard(windows, best.get(windows.key), true)}
${linuxReadings(best)}
${readingCard(android, best.get(android.key), false)}
${macs.length ? macs.map((meta) => readingCard(meta, best.get(meta.key), false)).join("\n") : '<div class="reading reading--none"><p class="reading__unavailable">macOS 暂无已发布的安装包</p></div>'}
</div>`;
}

function platformBar(rows) {
  const button = (key, label, count) => `<button type="button" class="platform" data-platform="${e(key)}" aria-pressed="${key === "all"}">${e(label)}<span class="platform__count">${count}</span></button>`;
  const filters = PLATFORMS.flatMap((meta) => {
    const count = rows.filter(({ asset }) => asset.platform === meta.key).length;
    return count ? [button(meta.key, meta.label, count)] : [];
  });
  return `<div class="platforms" role="group" aria-label="按平台和架构筛选安装包">
${button("all", "全部", rows.length)}
${filters.join("\n")}
</div>`;
}

function releaseRow({ release, asset }) {
  const meta = platformMeta(asset.platform);
  const label = meta.os === "Android" ? "Android APK" : `${meta.os} ${meta.arch}`.trim();
  return `<tr data-platform="${e(asset.platform)}">
<td data-th="版本"><span class="releases__version">${e(release.version)}</span> ${channelChip(release.channel)}</td>
<td data-th="更新要点">${e(release.summary ?? "—")}</td>
<td data-th="文件"><span class="releases__os">${e(label)}</span><span class="releases__file">${e(asset.filename)}</span></td>
<td data-th="大小" class="releases__num">${e(sizeText(asset.bytes))}</td>
<td data-th="发布日期" class="releases__num">${e(dateText(release.publishedAt))}</td>
<td data-th="下载"><a class="releases__get" href="${e(assetUrl(asset.id))}" download aria-label="下载 ${e(asset.filename)}">下载</a></td>
</tr>`;
}

/** 文件记录及其平台筛选，筛选栏随 HTML 直接显示。 */
export function renderReleases(data) {
  validateSnapshot(data);
  const rows = releaseRows(data);
  if (!rows.length) return '<p class="releases-empty">暂无已发布的安装包，发布后会显示在这里。</p>';
  return `${platformBar(rows)}
<div class="table-wrap"><table class="releases">
<thead><tr><th scope="col">版本</th><th scope="col">更新要点</th><th scope="col">文件</th><th scope="col">大小</th><th scope="col">发布日期</th><th scope="col"><span class="visually-hidden">下载</span></th></tr></thead>
<tbody>${rows.map(releaseRow).join("\n")}</tbody>
</table></div>
<p class="table-hint" role="status" aria-live="polite" data-filter-status>共 ${rows.length} 个安装包；窄屏下按文件竖排。</p>`;
}

/** 带清单同步日期的页脚内容。 */
export function renderStamp(data) {
  return `<div class="stamp mono">${e(stampText(data))}</div>`;
}
