import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

function page() {
  const keys = ["all", "windows-x86_64", "linux-x86_64", "linux-aarch64", "android"];
  const buttons = keys.map((key) => ({
    dataset: { platform: key },
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    closest(selector) { return selector === ".platform" ? this : null; },
  }));
  const rows = keys.slice(1).flatMap((key) => Array.from({ length: key === "android" ? 1 : 3 }, () => ({
    dataset: { platform: key }, hidden: false,
  })));
  const status = { textContent: "" };
  const handlers = new Map();
  const document = {
    querySelectorAll(selector) {
      if (selector === ".platforms .platform") return buttons;
      if (selector === ".releases tbody tr[data-platform]") return rows;
      if (selector === "details.picker[open]") return [];
      throw new Error(`未识别的选择器：${selector}`);
    },
    querySelector(selector) {
      assert.equal(selector, "[data-filter-status]");
      return status;
    },
    addEventListener(type, handler) { handlers.set(type, handler); },
  };
  // 仅运行静态交互脚本，模拟清单模块完全无法加载。
  runInNewContext(script, { document });
  return {
    rows, buttons, status,
    click(key) { handlers.get("click")({ target: buttons.find((button) => button.dataset.platform === key) }); },
    updated() { handlers.get("releases:updated")({}); },
  };
}

test("清单模块未加载时，原有平台筛选仍可用且两个 Linux 架构分开筛选", () => {
  const view = page();
  for (const key of ["windows-x86_64", "linux-x86_64", "linux-aarch64", "android"]) {
    view.click(key);
    const shown = view.rows.filter((row) => !row.hidden);
    assert.ok(shown.length > 0);
    assert.ok(shown.every((row) => row.dataset.platform === key));
    assert.equal(view.buttons.find((button) => button.dataset.platform === key).attributes["aria-pressed"], "true");
  }
  assert.equal(view.status.textContent, "显示 1 个安装包；窄屏下按文件竖排。");
  view.click("all");
  assert.ok(view.rows.every((row) => !row.hidden));
});

test("清单异步更新后保留用户已经选择的平台", () => {
  const view = page();
  view.click("linux-aarch64");
  view.updated();
  assert.ok(view.rows.filter((row) => !row.hidden).every((row) => row.dataset.platform === "linux-aarch64"));
  assert.equal(view.buttons.find((button) => button.dataset.platform === "linux-aarch64").attributes["aria-pressed"], "true");
});
