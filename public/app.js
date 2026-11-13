// 静态下载交互独立于清单刷新；直接打开 HTML 时也能筛选平台、查看版本详情。
"use strict";

{
  let selectedPlatform = "all";
  let openDetail = "";

  function closePickers({ restoreFocus = false } = {}) {
    for (const picker of document.querySelectorAll("details.picker[open]")) {
      const focusInside = picker.contains(document.activeElement);
      picker.open = false;
      if (restoreFocus && focusInside) picker.querySelector("summary")?.focus();
    }
  }

  function applyFilter(value) {
    selectedPlatform = value;
    let shown = 0;
    for (const row of document.querySelectorAll(".releases tbody tr[data-platform]")) {
      row.hidden = value !== "all" && row.dataset.platform !== value;
      if (!row.hidden) shown += 1;
    }
    for (const button of document.querySelectorAll(".platforms .platform")) {
      button.setAttribute("aria-pressed", String(button.dataset.platform === value));
    }
    const status = document.querySelector("[data-filter-status]");
    if (status) status.textContent = `显示 ${shown} 个安装包；窄屏下按文件竖排。`;
  }

  function initializeFilters(event) {
    const buttons = [...document.querySelectorAll(".platforms .platform")];
    const available = buttons.some((button) => button.dataset.platform === selectedPlatform);
    applyFilter(available ? selectedPlatform : "all");
    if (event?.detail?.focusedFilter) {
      buttons.find((button) => button.dataset.platform === event.detail.focusedFilter)?.focus();
    }
  }

  function positionPicker(picker) {
    if (!picker.open) return;
    const menu = picker.querySelector(".picker__menu");
    const trigger = picker.querySelector("summary").getBoundingClientRect();
    const below = window.innerHeight - trigger.bottom - 16;
    const above = trigger.top - 16;
    const showAbove = below < Math.min(menu.scrollHeight, 320) && above > below;
    picker.classList.toggle("picker--above", showAbove);
    picker.style.setProperty("--picker-max-height", `${Math.max(96, Math.min(320, showAbove ? above : below))}px`);
  }

  /** 以模态弹层显示某个版本的更新说明；返回弹层是否已打开。 */
  function showDetail(id) {
    const dialog = id ? document.getElementById(id) : null;
    if (!dialog?.matches?.("dialog.release-detail") || typeof dialog.showModal !== "function") return false;
    if (!dialog.open) {
      closePickers();
      dialog.showModal();
    }
    openDetail = id;
    return true;
  }

  function showLinkedDetail() {
    if (typeof location !== "object") return;
    try { showDetail(decodeURIComponent(location.hash.slice(1))); }
    catch { /* 无法解码的锚点不对应任何版本 */ }
  }

  function bindControls() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.(".platform");
      if (button) applyFilter(button.dataset.platform);
      if (!event.target.closest?.(".picker") || event.target.closest?.(".picker__item")) closePickers();
      const trigger = event.target.closest?.("[data-release-detail]");
      if (trigger && showDetail(trigger.dataset.releaseDetail)) event.preventDefault();
      // 点击弹层自身即点在遮罩上；关闭链接在无脚本时回到版本记录。
      const dialog = event.target.closest?.("dialog.release-detail[open]");
      if (dialog && (event.target === dialog || event.target.closest("[data-release-close]"))) {
        event.preventDefault();
        dialog.close();
      }
    });
    document.addEventListener("close", (event) => {
      if (event.target.id === openDetail) openDetail = "";
    }, true);
    window.addEventListener("hashchange", showLinkedDetail);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePickers({ restoreFocus: true });
    });
    document.addEventListener("toggle", (event) => {
      if (event.target.matches?.("details.picker")) positionPicker(event.target);
    }, true);
    window.addEventListener("resize", () => {
      for (const picker of document.querySelectorAll("details.picker[open]")) positionPicker(picker);
    });
  }

  bindControls();
  initializeFilters();
  showLinkedDetail();
  document.addEventListener("releases:updated", (event) => {
    initializeFilters(event);
    // 清单刷新会替换整段内容，正在阅读的版本说明需要重新打开。
    if (openDetail && !showDetail(openDetail)) openDetail = "";
  });
}
