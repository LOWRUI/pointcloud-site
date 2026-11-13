/* 页面交互增强；点云绘制独立于本文件，任一增强失败都不能隐藏下载内容。 */
"use strict";

(() => {
  const root = document.documentElement;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer: fine)").matches && matchMedia("(hover: hover)").matches;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const animations = new Set();
  const tilts = new Map();

  function safely(label, action) {
    try { action(); }
    catch (error) { console.warn(`${label}不可用：`, error.message); }
  }

  function reveal() {
    clearTimeout(window.__motionGuard);
    root.classList.remove("motion");
  }

  function animate(element, delay, panel = false) {
    if (!element || media.matches || typeof element.animate !== "function") return;
    const start = panel ? "perspective(1400px) rotateX(4deg) translateY(22px)" : "translateY(18px)";
    const animation = element.animate([
      { opacity: 0, transform: start }, { opacity: 1, transform: "none" },
    ], { duration: 650, delay, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "backwards" });
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  }

  function entrance() {
    if (media.matches) return;
    $$(".hero__text > *").forEach((element, index) => animate(element, index * 85));
    animate($("[data-downloads] .readings"), 120, true);
    // 版本号始终为真实值，不用随机数字作为装饰动画。
  }

  function bindTilt(element) {
    if (!finePointer || tilts.has(element)) return;
    const state = { x: 0, y: 0, tx: 0, ty: 0, frame: 0 };
    const reset = () => {
      cancelAnimationFrame(state.frame);
      Object.assign(state, { x: 0, y: 0, tx: 0, ty: 0, frame: 0 });
      element.style.transform = "";
      element.classList.remove("is-tilting");
    };
    const tick = () => {
      state.frame = 0;
      if (!element.isConnected || media.matches || element.querySelector("details[open]")) return reset();
      state.x += (state.tx - state.x) * 0.16;
      state.y += (state.ty - state.y) * 0.16;
      element.style.transform = `perspective(920px) rotateX(${state.x}deg) rotateY(${state.y}deg)`;
      if (Math.abs(state.x - state.tx) + Math.abs(state.y - state.ty) > 0.02) {
        state.frame = requestAnimationFrame(tick);
      } else if (state.tx === 0 && state.ty === 0) reset();
    };
    element.addEventListener("pointermove", (event) => {
      if (media.matches || element.querySelector("details[open]")) return reset();
      const rect = element.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      state.tx = (0.5 - y) * 4;
      state.ty = (x - 0.5) * 4;
      element.style.setProperty("--glare-x", `${x * 100}%`);
      element.style.setProperty("--glare-y", `${y * 100}%`);
      element.classList.add("is-tilting");
      if (!state.frame) state.frame = requestAnimationFrame(tick);
    }, { passive: true });
    element.addEventListener("pointerleave", () => {
      state.tx = 0;
      state.ty = 0;
      if (!state.frame) state.frame = requestAnimationFrame(tick);
    });
    element.addEventListener("toggle", reset, true);
    tilts.set(element, reset);
  }

  function cards() {
    for (const [element, reset] of tilts) {
      if (element.isConnected) continue;
      reset();
      tilts.delete(element);
    }
    $$("[data-downloads] .reading").forEach(bindTilt);
  }

  function moveIndicator(instant = false) {
    const bar = $(".platforms");
    const indicator = $(".platforms__indicator");
    const active = bar && $('.platform[aria-pressed="true"]', bar);
    if (!indicator || !active) return;
    indicator.classList.toggle("is-instant", instant || media.matches);
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    if (instant && !media.matches) requestAnimationFrame(() => indicator.classList.remove("is-instant"));
  }

  function filters() {
    const bar = $(".platforms");
    if (!bar) return;
    if (!$(".platforms__indicator", bar)) {
      const indicator = document.createElement("span");
      indicator.className = "platforms__indicator";
      indicator.setAttribute("aria-hidden", "true");
      bar.prepend(indicator);
    }
    moveIndicator(true);
  }

  function legacyCopy(text) {
    const area = document.createElement("textarea");
    const previousFocus = document.activeElement;
    area.value = text;
    area.readOnly = true;
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(area);
    try {
      area.select();
      return document.execCommand("copy");
    } catch (error) {
      console.warn("命令复制失败：", error.message);
      return false;
    } finally {
      area.remove();
      previousFocus?.focus({ preventScroll: true });
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (error) { console.warn("剪贴板接口不可用，改用本地复制：", error.message); }
    }
    return legacyCopy(text);
  }

  function commands() {
    for (const code of $$(".command")) {
      if ($(".copy-btn", code)) continue;
      const text = [...code.childNodes].map((node) => (
        node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName === "BR" ? "\n" : ""
      )).join("").trim();
      if (!text) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy-btn";
      button.textContent = "复制";
      button.setAttribute("aria-label", "复制命令");
      button.setAttribute("aria-live", "polite");
      let resetTimer;
      button.addEventListener("click", async () => {
        button.disabled = true;
        const ok = await copyText(text);
        button.disabled = false;
        button.textContent = ok ? "已复制" : "复制失败";
        button.classList.toggle("is-copied", ok);
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          button.textContent = "复制";
          button.classList.remove("is-copied");
        }, 1600);
      });
      code.appendChild(button);
    }
  }

  function updateScroll() {
    const nav = $(".site-nav");
    const progress = $(".scroll-progress");
    const max = root.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max, 0, 1) : 0})`;
    nav?.classList.toggle("is-scrolled", window.scrollY > 12);
    const links = $$(".site-nav__links a");
    let current = "";
    for (const link of links) {
      const section = document.getElementById(link.hash.slice(1));
      if (section && section.getBoundingClientRect().top <= window.innerHeight * 0.35) current = link.hash;
    }
    links.forEach((link) => link.classList.toggle("is-active", link.hash === current));
    const shot = $(".shot img");
    if (!shot) return;
    const rect = shot.getBoundingClientRect();
    const shift = media.matches ? 0 : clamp((window.innerHeight / 2 - rect.top - rect.height / 2) * 0.03, -10, 10);
    shot.style.setProperty("--shot-shift", `${shift}px`);
  }

  function bindPageEvents() {
    let scrollFrame = 0;
    const schedule = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; updateScroll(); });
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", () => { schedule(); moveIndicator(true); });
    document.addEventListener("click", (event) => {
      if (event.target.closest(".platform")) requestAnimationFrame(() => moveIndicator());
    });
    document.addEventListener("releases:updated", () => {
      safely("筛选指示器", filters);
      safely("卡片反馈", cards);
    });
    media.addEventListener("change", () => {
      if (media.matches) {
        animations.forEach((animation) => animation.cancel());
        tilts.forEach((reset) => reset());
      }
      reveal();
      updateScroll();
      moveIndicator(true);
    });
    document.fonts?.ready.then(() => moveIndicator(true));
  }

  function init() {
    try {
      safely("入场动画", entrance);
      safely("滚动效果", updateScroll);
      safely("筛选指示器", filters);
      safely("命令复制", commands);
      safely("卡片反馈", cards);
      safely("页面事件", bindPageEvents);
    } finally { reveal(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
