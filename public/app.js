// Progressive enhancement: the page ships complete without this script, and this
// script replaces the seeded markup with whatever releases.json currently holds,
// so a refresh only ever means re-running scripts/fetch-releases.mjs.

(() => {
  const LIST_URL = "releases.json";

  // One card per operating system, so an OS with no build is said once, not twice.
  const GROUPS = [
    { key: "windows", label: "Windows", arch: "x86_64" },
    { key: "linux", label: "Linux", arch: "x86_64" },
    { key: "macos", label: "macOS", arch: "arm64 与 x86_64" },
    { key: "android", label: "Android", arch: "arm64" },
  ];
  const GROUP_OF = {
    "windows-x86_64": "windows",
    "linux-x86_64": "linux",
    "linux-aarch64": "linux",
    "darwin-aarch64": "macos",
    "darwin-x86_64": "macos",
    android: "android",
  };
  const PLATFORM_ARCH = {
    "windows-x86_64": "x86_64",
    "linux-x86_64": "x86_64",
    "linux-aarch64": "arm64",
    "darwin-aarch64": "arm64",
    "darwin-x86_64": "x86_64",
    android: "arm64",
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
  // Said under each format in the picker, so nobody downloads a .deb to a
  // distribution that cannot install it.
  const KIND_HINT = {
    exe: "Windows 安装版",
    msi: "Windows 安装版",
    deb: "Debian、Ubuntu 系",
    rpm: "Fedora、openEuler 系",
    appimage: "免安装，任意发行版",
    dmg: "macOS 安装包",
    apk: "Android 安装包",
    tarball: "tar.gz 压缩包",
  };

  const assetUrl = (id) => `https://cdn.crabnebula.app/asset/${id}`;
  const groupMeta = (key) => GROUPS.find((g) => g.key === key) ?? null;
  const groupOf = (platform) => GROUP_OF[platform] ?? null;

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

  /** The newest stable build per OS; a preview is picked only when nothing stable exists. */
  function latestPerGroup(releases) {
    const best = new Map();
    for (const release of releases) {
      const assets = release.assets ?? [];
      if (!assets.length) continue;
      const stable = isStable(release.channel);
      for (const key of new Set(assets.map((a) => groupOf(a.platform)).filter(Boolean))) {
        const candidate = {
          version: release.version,
          publishedAt: release.publishedAt,
          assets: assets.filter((a) => groupOf(a.platform) === key),
          stable,
        };
        const current = best.get(key);
        if (!current) best.set(key, candidate);
        else if (candidate.stable !== current.stable) {
          if (candidate.stable) best.set(key, candidate);
        } else if (compareVersion(candidate.version, current.version) > 0) {
          best.set(key, candidate);
        }
      }
    }
    return best;
  }

  // A platform with a single build is one link; a platform that ships several
  // formats gets a picker, so the download button never has to choose for the
  // visitor between a .deb and an AppImage. It is a <details>, so it also opens
  // without the script.
  function actionFor(meta, group, filled) {
    if (group.assets.length === 1) {
      const asset = group.assets[0];
      const link = el("a", filled ? "btn btn--primary" : "btn btn--quiet");
      link.href = assetUrl(asset.id);
      link.setAttribute("download", "");
      link.textContent = `下载 ${meta.label} 版`;
      return link;
    }

    const picker = el("details", "picker");
    picker.dataset.picker = group.assets[0].platform ?? meta.key;

    const summary = el("summary", filled ? "btn btn--primary btn--picker" : "btn btn--quiet btn--picker");
    summary.append(`下载 ${meta.label} 版`);
    summary.append(el("span", "btn__caret"));
    picker.append(summary);

    const menu = el("div", "picker__menu");
    // A disclosure with plain links, not an ARIA menu: there is no roving focus
    // here, and the links are reachable with Tab like any other link.
    for (const asset of group.assets) {
      const item = el("a", "picker__item");
      item.href = assetUrl(asset.id);
      item.setAttribute("download", "");

      const text = el("span", "picker__text");
      text.append(el("span", "picker__label", KIND_LABEL[asset.kind] ?? asset.kind));
      text.append(el("span", "picker__hint", KIND_HINT[asset.kind] ?? ""));

      item.append(text);
      item.append(el("span", "picker__size", sizeText(asset.bytes)));
      menu.append(item);
    }
    picker.append(menu);
    return picker;
  }

  function readingCard(meta, group, withPrimary) {
    const card = el("div", "reading");

    const head = el("div", "reading__os");
    head.append(meta.label);
    head.append(el("span", "reading__arch", meta.arch ?? ""));
    card.append(head);
    card.append(el("div", "reading__value", group.version));

    const when = el("div", "reading__when");
    when.append(el("span", "", dateText(group.publishedAt)));
    when.append(el("span", "", group.assets.length > 1 ? `${group.assets.length} 种格式` : `${sizeText(group.assets[0]?.bytes)} ${KIND_LABEL[group.assets[0]?.kind] ?? ""}`));
    card.append(when);

    const actions = el("div", "reading__actions");
    // One filled action on the whole page: the first build of the first OS.
    actions.append(actionFor(meta, group, withPrimary));
    card.append(actions);
    return card;
  }

  // Whatever has no build is said once, in one quiet row, rather than as an
  // empty panel per platform.
  function pendingCard(labels) {
    const card = el("div", "reading reading--none");
    const head = el("div", "reading__os");
    head.append(labels.join(" 与 "));
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
    const best = latestPerGroup(data.releases ?? []);

    const ready = GROUPS.map((meta) => ({ meta, group: best.get(meta.key) })).filter((x) => x.group);
    const pending = GROUPS.filter((meta) => !best.has(meta.key)).map((meta) => meta.label);

    const cards = ready.map(({ meta, group }, index) => readingCard(meta, group, index === 0));
    if (pending.length) cards.push(pendingCard(pending));

    holder.replaceChildren(...cards);
  }

  function releaseRow(release, asset) {
    const tr = el("tr");
    const group = groupOf(asset.platform);
    if (group) tr.dataset.platform = group;

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
    fileCell.dataset.th = "文件";
    const meta = groupMeta(group);
    const arch = PLATFORM_ARCH[asset.platform];
    const os = meta?.label ?? asset.platform;
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

  const FILTER_ALL = "all";

  function applyFilter(bar, value) {
    let shown = 0;
    for (const row of document.querySelectorAll(".releases tbody tr[data-platform]")) {
      const match = value === FILTER_ALL || row.dataset.platform === value;
      row.hidden = !match;
      if (match) shown += 1;
    }
    for (const button of bar.querySelectorAll(".platform")) {
      button.setAttribute("aria-pressed", String(button.dataset.platform === value));
    }
    return shown;
  }

  function renderPlatformBar(data) {
    const bar = document.querySelector(".platforms");
    if (!bar) return;

    const rows = [];
    for (const release of data.releases ?? []) {
      for (const asset of release.assets ?? []) {
        const group = groupOf(asset.platform);
        if (group) rows.push({ release, asset, group });
      }
    }

    // Only platforms that actually have a file become a filter, so no button
    // ever leads to an empty table; the ones without a build are said in words.
    const buttons = [];
    const makeButton = (value, label, count) => {
      const button = el("button", "platform");
      button.type = "button";
      button.dataset.platform = value;
      button.append(label);
      button.append(el("span", "platform__count", String(count)));
      return button;
    };

    buttons.push(makeButton(FILTER_ALL, "全部", rows.length));
    for (const meta of GROUPS) {
      const count = rows.filter((r) => r.group === meta.key).length;
      if (count > 0) buttons.push(makeButton(meta.key, meta.label, count));
    }
    bar.replaceChildren(...buttons);

    const silent = GROUPS.filter((meta) => !rows.some((r) => r.group === meta.key)).map((m) => m.label);
    if (silent.length) {
      bar.append(el("span", "platforms__note", `${silent.join(" 与 ")} 暂无安装包`));
    }

    bar.addEventListener("click", (event) => {
      const button = event.target.closest?.(".platform");
      if (!button) return;
      applyFilter(bar, button.dataset.platform);
    });

    bar.hidden = false;
    applyFilter(bar, FILTER_ALL);
    return rows;
  }

  // Close on a click elsewhere, on Escape, and right after a format is chosen,
  // so the menu never lingers over the next section. Every format link is a real
  // link, so a chosen item closes the menu and the download starts anyway.
  function closePickers() {
    for (const picker of document.querySelectorAll("details.picker[open]")) picker.open = false;
  }

  function collapsePickers(event) {
    const inside = event.target.closest?.(".picker");
    const chosen = event.target.closest?.(".picker__item");
    if (inside && !chosen) return;
    closePickers();
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

  async function main() {
    try {
      const res = await fetch(LIST_URL, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      renderReadings(data);
      renderReleases(data);
      renderPlatformBar(data);
      renderStamp(data);
      document.addEventListener("click", collapsePickers);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closePickers();
      });
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
