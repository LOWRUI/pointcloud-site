// 静态下载交互独立于清单刷新；直接打开 HTML 时也能筛选平台。
(() => {
  let selectedPlatform = "all";

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

  function bindControls() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.(".platform");
      if (button) applyFilter(button.dataset.platform);
      if (!event.target.closest?.(".picker") || event.target.closest?.(".picker__item")) closePickers();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePickers({ restoreFocus: true });
    });
  }

  bindControls();
  initializeFilters();
  document.addEventListener("releases:updated", initializeFilters);
})();
