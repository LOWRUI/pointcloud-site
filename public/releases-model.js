export const PLATFORMS = [
  { key: "windows-x86_64", os: "Windows", arch: "x86_64", label: "Windows" },
  { key: "linux-x86_64", os: "Linux", arch: "x86_64", label: "Linux x86_64", hint: "Intel / AMD 64 位" },
  { key: "linux-aarch64", os: "Linux", arch: "ARM64", label: "Linux ARM64", hint: "ARM 64 位 · aarch64" },
  { key: "android", os: "Android", arch: "APK", label: "Android" },
  { key: "darwin-aarch64", os: "macOS", arch: "ARM64", label: "macOS ARM64" },
  { key: "darwin-x86_64", os: "macOS", arch: "x86_64", label: "macOS x86_64" },
];

export const KIND_LABEL = {
  exe: "setup.exe", msi: "msi", deb: "deb", rpm: "rpm", appimage: "AppImage",
  dmg: "dmg", apk: "APK", tarball: "tar.gz",
};

export const KIND_HINT = {
  exe: "Windows 安装版", msi: "Windows 安装版", deb: "Debian、Ubuntu 系",
  rpm: "Fedora、openEuler 系", appimage: "单文件运行，需系统兼容",
  dmg: "macOS 安装包", apk: "Android 安装包", tarball: "tar.gz 压缩包",
};

const KIND_ORDER = ["exe", "msi", "deb", "appimage", "rpm", "apk", "dmg", "tarball"];

/** 校验清单结构，避免格式异常时替换已有的静态下载内容。 */
export function validateSnapshot(data) {
  if (!data || !Array.isArray(data.releases)) throw new Error("版本清单缺少 releases 数组");
  for (const release of data.releases) {
    if (typeof release?.version !== "string" || !Array.isArray(release.assets)) {
      throw new Error("版本清单中的发布记录不完整");
    }
    for (const asset of release.assets) {
      if (!["id", "platform", "filename", "kind"].every((key) => typeof asset?.[key] === "string" && asset[key])) {
        throw new Error("版本清单中的安装包记录不完整");
      }
    }
  }
  return data;
}

/** 返回平台的显示名称与处理器架构。 */
export function platformMeta(key) {
  return PLATFORMS.find((platform) => platform.key === key) ?? { key, os: key, label: key, arch: "" };
}

/** 仅生成固定 CDN 的资源地址，外部值不能改变主机名或注入属性。 */
export function assetUrl(id) {
  return `https://cdn.crabnebula.app/asset/${encodeURIComponent(id)}`;
}

/** 将字节数转换为便于比较的文件大小。 */
export function sizeText(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const mib = bytes / 1048576;
  if (mib < 10) return `${mib.toFixed(2)} MB`;
  if (mib < 1000) return `${mib.toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/** 使用 UTC 日期，保证浏览器和静态生成的结果一致。 */
export function dateText(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.valueOf()) ? "—" : date.toISOString().slice(0, 10);
}

/** Cloud 的正式发布通道。 */
export function isStable(channel) {
  return ["prod", "stable", "release"].includes(String(channel ?? "").toLowerCase());
}

function versionParts(version) {
  const [main, ...pre] = String(version).replace(/^v/, "").split("+")[0].split("-");
  return { main: main.split(".").map(Number), pre: pre.join("-").split(".").filter(Boolean) };
}

function comparePrerelease(a, b) {
  if (!a.length || !b.length) return Number(!a.length) - Number(!b.length);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const numericA = /^\d+$/.test(a[i]);
    const numericB = /^\d+$/.test(b[i]);
    if (numericA && numericB) return Number(a[i]) - Number(b[i]);
    if (numericA !== numericB) return numericA ? -1 : 1;
    return a[i].localeCompare(b[i]);
  }
  return 0;
}

/** 返回正数时 a 更新；构建元数据不参与版本优先级。 */
export function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.main.length, right.main.length); i += 1) {
    const difference = (left.main[i] ?? 0) - (right.main[i] ?? 0);
    if (Number.isFinite(difference) && difference) return difference;
  }
  return comparePrerelease(left.pre, right.pre);
}

function mergeBuilds(current, candidate) {
  const assets = [...new Map([...current.assets, ...candidate.assets].map((asset) => [asset.id, asset])).values()];
  const publishedAt = Date.parse(candidate.publishedAt) > Date.parse(current.publishedAt)
    ? candidate.publishedAt : current.publishedAt;
  return { ...current, assets, publishedAt };
}

/** 每种架构独立选最新稳定版；没有稳定版时才使用预览版。 */
export function latestDownloads(releases) {
  const best = new Map();
  for (const release of releases) {
    for (const platform of new Set(release.assets.map((asset) => asset.platform))) {
      const candidate = {
        ...release,
        stable: isStable(release.channel),
        assets: release.assets.filter((asset) => asset.platform === platform),
      };
      const current = best.get(platform);
      if (!current || (candidate.stable && !current.stable)) {
        best.set(platform, candidate);
      } else if (candidate.stable === current.stable) {
        const order = compareVersions(candidate.version, current.version);
        if (order > 0) best.set(platform, candidate);
        if (order === 0) best.set(platform, mergeBuilds(current, candidate));
      }
    }
  }
  return best;
}

/** 下载格式按常用格式排列，不改变输入数据。 */
export function sortedAssets(assets) {
  const rank = (kind) => KIND_ORDER.includes(kind) ? KIND_ORDER.indexOf(kind) : KIND_ORDER.length;
  return [...assets].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** 展开版本文件，按发布时间倒序；没有日期时以版本号排序。 */
export function releaseRows(data) {
  return [...data.releases]
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || compareVersions(b.version, a.version))
    .flatMap((release) => release.assets.map((asset) => ({ release, asset })));
}

/** 页脚的清单数量与同步日期。 */
export function stampText(data) {
  const count = data.releases.reduce((total, release) => total + release.assets.length, 0);
  return `${count} 个安装包，${data.releases.length} 次发布，同步于 ${dateText(data.generatedAt)}`;
}
