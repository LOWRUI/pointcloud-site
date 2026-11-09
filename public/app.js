// Progressive enhancement: the page ships complete without this script, and this
// script replaces the seeded markup with whatever site/releases.json currently
// holds, so a refresh only ever means re-running scripts/fetch-releases.mjs.

(() => {
  const LIST_URL = "releases.json";
  const PLATFORM_LABEL = {
    "windows-x86_64": "Windows",
    "linux-x86_64": "Linux",
    "linux-aarch64": "Linux",
    "darwin-aarch64": "macOS",
    "darwin-x86_64": "macOS",
    "android": "Android",
  };
  const PLATFORM_ARCH = {
    "windows-x86_64": "x86_64",
    "linux-x86_64": "x86_64",
    "linux-aarch64": "arm64",
    "darwin-aarch64": "arm64",
    "darwin-x86_64": "x86_64",
    "android": "arm64",
  };
  const KIND_LABEL = {
    exe: "setup.exe",
    msi: "msi",
    deb: "deb",
    rpm: "rpm",
    appimage: "AppImage",
    dmg: "dmg",
    apk: "apk",
    tarball: "tar.gz",
  };

  const assetUrl = (id) => `https://cdn.crabnebula.app/asset/${id}`;

  // One card per operating system, so an OS with no build is said once, not twice.
  const GROUP_ORDER = ["Windows", "Linux", "macOS", "Android"];
  const GROUP_OF = {
    "windows-x86_64": "Windows",
    "linux-x86_64": "Linux",
    "linux-aarch64": "Linux",
    "darwin-aarch64": "macOS",
    "darwin-x86_64": "macOS",
    "android": "Android",
  };
  const GROUP_ARCH = {
    Windows: "x86_64",
    Linux: "x86_64",
    macOS: "arm64 与 x86_64",
    Android: "arm64",
  };

  function sizeText(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "—";
    const mib = bytes / 1048576;
    if (mib < 10) return `${mib.toFixed(2)} MB`;
    if (mib < 1000) return `${mib.toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }

  function dateText(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.valueOf())) return "—";
    return d.toISOString().slice(0, 10);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function isStable(channel) {
    const name = String(channel ?? "").toLowerCase();
    return name === "prod" || name === "stable" || name === "release";
  }

  function channelChip(channel) {
    const stable = isStable(channel);
    return el("span", stable ? "chip" : "chip chip--alpha", stable ? "稳定版" : "预览版");
  }

  function groupOf(platform) {
    return GROUP_OF[platform] ?? platform;
  }

  function readingCard(group, withPrimary) {
    const card = el("div", "reading");

    const head = el("div", "reading__os");
    head.append(group.os);
    head.append(el("span", "reading__arch", GROUP_ARCH[group.os] ?? ""));

    card.append(head);
    card.append(el("div", "reading__value", group.version));

    const when = el("div", "reading__when");
    when.append(el("span", "", dateText(group.publishedAt)));
    for (const asset of group.assets) {
      when.append(el("span", "", sizeText(asset.bytes)));
      when.append(el("span", "", KIND_LABEL[asset.kind] ?? asset.kind));
    }
    card.append(when);

    const actions = el("div", "reading__actions");
    group.assets.forEach((asset, index) => {
      // One filled action on the whole page: the first build of the first OS.
      const filled = withPrimary && index === 0;
      const link = el("a", filled ? "btn btn--primary" : "btn btn--quiet");
      link.href = assetUrl(asset.id);
      link.setAttribute("download", "");
      link.textContent = index === 0
        ? `下载 ${group.os} 版`
        : `${KIND_LABEL[asset.kind] ?? asset.kind} 版本`;
      actions.append(link);
    });
    card.append(actions);
    return card;
  }

  // Whatever has no build is said once, in one quiet row, rather than as an
  // empty panel per platform.
  function pendingCard(names) {
    const card = el("div", "reading reading--none");
    const head = el("div", "reading__os");
    head.append(names.join(" 与 "));
    head.append(el("span", "reading__arch", "暂无"));
    card.append(head);
    const when = el("div", "reading__when");
    when.append(el("span", "", "还没有已发布的安装包，发布之后会出现在这里"));
    card.append(when);
    return card;
  }

  function renderReadings(data) {
    const holder = document.querySelector(".readings");
    if (!holder) return;
    const latest = data.latestByPlatform ?? {};
    const releases = data.releases ?? [];

    const groups = GROUP_ORDER.map((os) => {
      const platforms = Object.keys(latest).filter((p) => groupOf(p) === os);
      if (!platforms.length) return { os, version: null, publishedAt: null, assets: [] };

      // The newest stable build for this OS wins over any preview; a preview is
      // shown only when that OS has nothing stable yet.
      let best = null;
      for (const release of releases) {
        const assets = (release.assets ?? []).filter((a) => groupOf(a.platform) === os);
        if (!assets.length) continue;
        const candidate = {
          version: release.version,
          publishedAt: release.publishedAt,
          assets,
          stable: isStable(release.channel),
        };
        if (!best) {
          best = candidate;
          continue;
        }
        if (candidate.stable !== best.stable) {
          if (candidate.stable) best = candidate;
          continue;
        }
        if (compareVersion(candidate.version, best.version) > 0) best = candidate;
      }
      if (!best) {
        const picked = latest[platforms[0]];
        return { os, version: picked.version, publishedAt: null, assets: [] };
      }
      return { os, ...best };
    });

    const ready = groups.filter((g) => g.assets.length > 0);
    const pending = groups.filter((g) => g.assets.length === 0).map((g) => g.os);

    const cards = ready.map((group, index) => readingCard(group, index === 0));
    if (pending.length) cards.push(pendingCard(pending));

    holder.replaceChildren(...cards);
  }

  // Positive when a is the newer version, so the caller can take the maximum.
  function compareVersion(a, b) {
    const parse = (v) => String(v).split(/[.\-+]/);
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const x = pa[i] ?? "";
      const y = pb[i] ?? "";
      const nx = Number(x);
      const ny = Number(y);
      if (x === y) continue;
      if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
      if (Number.isFinite(nx)) return 1; // a bare number outranks a pre-release tag
      if (Number.isFinite(ny)) return -1;
      return y.localeCompare(x);
    }
    return 0;
  }

  function releaseRow(release, asset) {
    const tr = el("tr");

    const versionCell = el("td");
    versionCell.dataset.th = "版本";
    versionCell.append(el("span", "releases__version", release.version));
    versionCell.append(document.createTextNode(" "));
    versionCell.append(channelChip(release.channel));
    tr.append(versionCell);

    const noteCell = el("td", "", release.summary ?? "—");
    noteCell.dataset.th = "更新要点";
    tr.append(noteCell);

    const fileCell = el("td");
    fileCell.dataset.th = "平台与文件";
    const os = PLATFORM_LABEL[asset.platform] ?? asset.platform;
    const arch = PLATFORM_ARCH[asset.platform];
    fileCell.append(el("span", "releases__os", arch ? `${os} ${arch}` : os));
    fileCell.append(el("span", "releases__file", asset.filename));
    tr.append(fileCell);

    const sizeCell = el("td", "releases__num", sizeText(asset.bytes));
    sizeCell.dataset.th = "大小";
    tr.append(sizeCell);

    const dateCell = el("td", "releases__num", dateText(release.publishedAt));
    dateCell.dataset.th = "发布日期";
    tr.append(dateCell);

    const getCell = el("td");
    getCell.dataset.th = "下载";
    const link = el("a", "releases__get", "下载");
    link.href = assetUrl(asset.id);
    link.setAttribute("download", "");
    getCell.append(link);
    tr.append(getCell);

    return tr;
  }

  function renderReleases(data) {
    const body = document.querySelector(".releases tbody");
    if (!body) return;
    const rows = [];
    for (const release of data.releases ?? []) {
      for (const asset of release.assets ?? []) rows.push(releaseRow(release, asset));
    }
    body.replaceChildren(...rows);
  }

  function renderStamp(data) {
    const stamp = document.querySelector(".stamp");
    if (!stamp) return;
    const releases = (data.releases ?? []).length;
    const assets = (data.releases ?? []).reduce((n, r) => n + (r.assets?.length ?? 0), 0);
    const synced = dateText(data.generatedAt);
    stamp.textContent = `${assets} 个安装包，${releases} 次发布，同步于 ${synced}`;
  }

  function renderChannels(data) {
    const cards = document.querySelectorAll(".channel__value");
    const latest = data.latest ?? {};
    const order = Object.keys(latest);
    cards.forEach((card, index) => {
      const channel = order[index];
      if (channel && latest[channel]) card.textContent = latest[channel];
    });
  }

  async function main() {
    try {
      const res = await fetch(LIST_URL, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      renderReadings(data);
      renderReleases(data);
      renderStamp(data);
      renderChannels(data);
    } catch {
      // The seeded markup stays: the page is complete without this step.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, { once: true });
  } else {
    main();
  }
})();
