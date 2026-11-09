// Local preview only: serves public/ over http so the page can be checked in a browser.
// Not part of the deploy path (GitHub Pages serves the directory directly).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.argv[2] ?? "public";
const port = Number(process.argv[3] ?? 5180);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const file = normalize(join(root, rel));
    if (file.includes("..")) {
      res.writeHead(400).end("bad path");
      return;
    }
    const body = await readFile(file);
    await stat(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`preview: http://127.0.0.1:${port}/`);
});
