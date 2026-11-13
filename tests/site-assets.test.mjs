import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { checkSite } from "../scripts/check-site.mjs";

test("页面引用缺失脚本时阻止发布，补齐后通过", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pointcloud-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public/index.html"), '<script src="motion.js"></script>');
  await assert.rejects(checkSite({ root }), /motion\.js/);
  await writeFile(join(root, "public/motion.js"), '"use strict";');
  assert.deepEqual(await checkSite({ root }), ["public/index.html", "public/motion.js"]);
});

test("CSS 内联 SVG 中的滤镜引用不是外部文件", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pointcloud-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public/index.html"), '<link href="style.css" rel="stylesheet">');
  await writeFile(join(root, "public/style.css"), `.noise { background: url("data:image/svg+xml,<svg><rect filter='url(%23n)'/></svg>"); }`);
  assert.deepEqual(await checkSite({ root }), ["public/index.html", "public/style.css"]);
});

test("仅存在于磁盘而未纳入 Git 的动效脚本不能发布", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pointcloud-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public/index.html"), '<script src="motion.js"></script>');
  await writeFile(join(root, "public/motion.js"), '"use strict";');
  execFileSync("git", ["init", "--quiet", root]);
  const config = ["-c", `safe.directory=${(await realpath(root)).replaceAll("\\", "/")}`];
  execFileSync("git", [...config, "add", "public/index.html"], { cwd: root });
  await assert.rejects(checkSite({ root, tracked: true }), /资源未纳入 Git：public\/motion\.js/);
  execFileSync("git", [...config, "add", "public/motion.js"], { cwd: root });
  assert.equal((await checkSite({ root, tracked: true })).length, 2);
});

test("脚本加载的本地版本清单也必须存在且非空", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pointcloud-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "public"));
  await writeFile(join(root, "public/index.html"), '<script src="refresh.js"></script>');
  await writeFile(join(root, "public/refresh.js"), 'fetch("releases.json");');
  await assert.rejects(checkSite({ root }), /releases\.json/);
  await writeFile(join(root, "public/releases.json"), "{}");
  assert.equal((await checkSite({ root })).length, 3);
});
