import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function references(text, extension) {
  const patterns = extension === ".html"
    ? [/(?:src|href)\s*=\s*["']([^"']+)["']/g]
    : extension === ".css"
      ? [/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g, /@import\s+["']([^"']+)["']/g]
      : [/(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.[^"']+)["']/g, /\bfetch\s*\(\s*["']([^"']+)["']/g];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3]));
}

function localPath(reference, parent, publicRoot) {
  if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(reference)) return null;
  const path = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!path) return null;
  const resolved = resolve(path.startsWith("/") ? publicRoot : dirname(parent), path.replace(/^\//, ""));
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${sep}`)) {
    throw new Error(`资源路径超出 public：${reference}`);
  }
  return resolved;
}

function trackedFiles(root) {
  const directory = realpathSync(root).replaceAll("\\", "/");
  return new Set(execFileSync("git", ["-c", `safe.directory=${directory}`, "ls-files", "-z", "--", "public"], {
    cwd: root, encoding: "utf8",
  }).split("\0").filter(Boolean));
}

/** 检查页面及其脚本/样式引用；发布模式同时拒绝未纳入 Git 的资源。 */
export async function checkSite({ root = repoRoot, tracked = false } = {}) {
  const publicRoot = resolve(root, "public");
  const pending = [resolve(publicRoot, "index.html")];
  const visited = new Set();
  const trackedSet = tracked ? trackedFiles(root) : null;
  while (pending.length) {
    const file = pending.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const name = relative(root, file).split(sep).join("/");
    if (trackedSet && !trackedSet.has(name)) throw new Error(`资源未纳入 Git：${name}`);
    const info = await stat(file).catch((error) => {
      throw new Error(`页面资源不存在：${name}`, { cause: error });
    });
    if (!info.isFile() || info.size === 0) throw new Error(`页面资源为空或不是文件：${name}`);
    const extension = extname(file);
    if (![".html", ".css", ".js", ".mjs"].includes(extension)) continue;
    const text = await readFile(file, "utf8");
    for (const reference of references(text, extension)) {
      const child = localPath(reference, file, publicRoot);
      if (child) pending.push(child);
    }
  }
  return [...visited].map((file) => relative(root, file).split(sep).join("/")).sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkSite({ tracked: process.argv.includes("--tracked") }).then((files) => {
    console.log(`页面资源检查通过：${files.length} 个本地文件。`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
