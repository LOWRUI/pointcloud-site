import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../public/radar-scene.js", import.meta.url), "utf8");

function scenePage({ reduced = false, contextMissing = false } = {}) {
  const frames = new Map();
  const events = {};
  const pixels = [];
  let nextId = 0;
  let preferenceChanged;
  let intersectionChanged;
  const media = { matches: reduced, addEventListener(_, fn) { preferenceChanged = fn; } };
  const context = new Proxy({}, {
    get(_, key) {
      if (key === "fillRect") return (...args) => pixels.push(args);
      if (key.startsWith("create")) return () => ({ addColorStop() {} });
      return () => {};
    },
  });
  const canvas = { getContext: () => contextMissing ? null : context };
  const hero = { addEventListener() {} };
  const scene = {
    querySelector: () => canvas, closest: () => hero,
    getBoundingClientRect: () => ({ width: 960, height: 600, left: 0, top: 0 }),
  };
  const document = {
    readyState: "complete", hidden: false, querySelector: () => scene,
    addEventListener(type, fn) { events[type] = fn; },
  };
  const window = { devicePixelRatio: 2, addEventListener() {} };
  runInNewContext(script, {
    document, window, console, performance: { now: () => 0 },
    matchMedia: () => media,
    requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { constructor(fn) { intersectionChanged = fn; } observe() {} },
  });
  return {
    frames, pixels, canvas,
    frame(now) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(now));
    },
    reduce(value) { media.matches = value; preferenceChanged({ matches: value }); },
    visible(value) { intersectionChanged([{ isIntersecting: value }]); },
    hidden(value) { document.hidden = value; events.visibilitychange(); },
  };
}

test("点云首帧可见，后续帧随时间变化", () => {
  const page = scenePage();
  assert.ok(page.pixels.length > 100);
  const first = page.pixels[0];
  page.pixels.length = 0;
  page.frame(50);
  assert.notDeepEqual(page.pixels[0], first);
  assert.equal(page.frames.size, 1);
  assert.ok(page.canvas.width <= 1920);
});

test("减弱动效只绘制静态帧，运行时切换也会停止并可恢复", () => {
  const page = scenePage({ reduced: true });
  assert.ok(page.pixels.length > 100);
  assert.equal(page.frames.size, 0);
  page.reduce(false);
  assert.equal(page.frames.size, 1);
  page.reduce(true);
  assert.equal(page.frames.size, 0);
});

test("离屏和后台暂停点云，重新可见才恢复", () => {
  const page = scenePage();
  page.visible(false);
  assert.equal(page.frames.size, 0);
  page.hidden(false);
  assert.equal(page.frames.size, 0);
  page.visible(true);
  assert.equal(page.frames.size, 1);
  page.hidden(true);
  assert.equal(page.frames.size, 0);
});

test("Canvas 不可用时不启动动画或影响页面", () => {
  const page = scenePage({ contextMissing: true });
  assert.equal(page.frames.size, 0);
  assert.equal(page.pixels.length, 0);
});
