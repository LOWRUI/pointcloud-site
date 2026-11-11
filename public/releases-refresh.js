import { renderReadings, renderReleases, renderStamp } from "./releases-view.js";
import { validateSnapshot } from "./releases-model.js";

function replaceContent(data) {
  const readings = renderReadings(data);
  const releases = renderReleases(data);
  const stamp = renderStamp(data);
  const focusedFilter = document.activeElement?.closest(".platform")?.dataset.platform;
  document.querySelector("[data-downloads] .readings").outerHTML = readings;
  document.querySelector("[data-release-list]").innerHTML = releases;
  document.querySelector("[data-stamp]").innerHTML = stamp;
  document.dispatchEvent(new CustomEvent("releases:updated", { detail: { focusedFilter } }));
}

async function refreshReleases() {
  const status = document.querySelector("[data-sync-status]");
  const holder = document.querySelector("[data-downloads]");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  holder.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("releases.json", { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`版本清单 HTTP ${response.status}`);
    replaceContent(validateSnapshot(await response.json()));
    status.textContent = "";
  } catch (error) {
    status.textContent = "暂时无法刷新版本清单，当前仍可下载页面中列出的安装包。";
    console.warn("版本清单刷新失败：", error.message);
  } finally {
    clearTimeout(timeout);
    holder.setAttribute("aria-busy", "false");
  }
}

// 本地 HTML 使用完整的静态内容，避免 file:// 的模块请求跨域限制。
if (location.protocol !== "file:") refreshReleases();
