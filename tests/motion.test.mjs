import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const script = await readFile(new URL("../public/motion.js", import.meta.url), "utf8");

function page({ reduced = false, animationFails = false } = {}) {
  const classes = new Set(["motion"]);
  const errors = [];
  let preferenceChanged;
  let played = 0;
  let cancelled = 0;
  const media = { matches: reduced, addEventListener(_, fn) { preferenceChanged = fn; } };
  const element = {
    animate() {
      if (animationFails) throw new Error("模拟动画接口失败");
      played += 1;
      return { finished: new Promise(() => {}), cancel() { cancelled += 1; } };
    },
  };
  const document = {
    readyState: "complete", documentElement: { classList: { remove: (name) => classes.delete(name) }, scrollHeight: 1000 },
    querySelector: () => null,
    querySelectorAll: (selector) => selector === ".hero__text > *" ? [element] : [],
    addEventListener() {},
  };
  runInNewContext(script, {
    document, matchMedia: () => media,
    window: { addEventListener() {}, innerHeight: 800, scrollY: 0 },
    clearTimeout() {}, console: { warn: (...args) => errors.push(args) },
  });
  return {
    classes, errors,
    get played() { return played; }, get cancelled() { return cancelled; },
    reduce() { media.matches = true; preferenceChanged(); },
  };
}

test("下载面板缺失或入场动画异常时，仍解除页面隐藏", () => {
  const normal = page();
  assert.equal(normal.classes.has("motion"), false);
  assert.equal(normal.errors.length, 0);
  const failed = page({ animationFails: true });
  assert.equal(failed.classes.has("motion"), false);
  assert.equal(failed.errors.length, 1);
});

test("减弱动效时不播放入场动画，运行时切换会取消现有动画", () => {
  const reduced = page({ reduced: true });
  assert.equal(reduced.played, 0);
  const normal = page();
  assert.equal(normal.played, 1);
  normal.reduce();
  assert.equal(normal.cancelled, 1);
  assert.equal(normal.classes.has("motion"), false);
});
