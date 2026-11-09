# PointCloud Studio 下载站

一个独立的纯静态站点，把 CrabNebula Cloud 上已发布的 PointCloud Studio 安装包公开给任何访客下载。
不需要后端、不需要登录、不需要 Cloud 账号；页面上的每个下载链接都直连 `cdn.crabnebula.app/asset/<id>`。

与 Tauri 应用仓库分开维护：应用照常打包上传，这里只负责「对外能下载」这一件事。

## 页面里有什么

- **首屏**：Windows、Linux 各自的最新版本，版本号、发布日期、文件大小与直接下载按钮；没有安装包的系统单独说一句「还没有已发布的安装包」，而不是留一个点不动的按钮。
- **界面截图**：`public/assets/live-main.png`，取自软件真实运行画面。
- **版本记录**：顶部按平台筛选（全部 / Windows / Linux，只有真有安装包的平台才出按钮），选一个平台就只显示这个平台的安装包；下面是按发布时间倒序的文件行（版本、更新要点、文件、大小、发布日期、下载）。
- **安装**：Windows 的 SmartScreen 提示怎么放行，Linux 的 deb / AppImage 两种装法。

页面不展示 Cloud 发布页入口、更新通道和来源说明：软件内本来就不显示「检查更新」按钮，通道名对访客也没有意义。

页面在 1280×800 与 375 宽度下都检查过：窄屏时安装包列表每行改为竖排，不横向滚动。

## 目录

```
public/                 部署上去的就是这个目录
  index.html            页面（自带一份完整的静态内容）
  style.css tokens.css  样式与设计令牌
  app.js                可选增强：读取 releases.json 后刷新上面的数字
  releases.json         版本与文件清单（唯一数据源）
  favicon.svg
  assets/live-main.png  软件界面截图
scripts/
  fetch-releases.mjs    从 Cloud 拉清单，重写 public/releases.json
  preview-server.mjs    本地预览（Node 自带模块，无依赖）
.github/workflows/
  pages.yml             推送到 GitHub Pages，每天刷新一次清单
```

## 本地预览

```bash
npm run preview      # http://127.0.0.1:5180/
```

不需要 `npm install`：预览服务器只用 Node 内置模块。页面本身也可以直接用浏览器打开 `public/index.html`。

## 刷新清单

`public/releases.json` 是页面唯一的数据源。重新发布软件之后，跑一次：

```bash
# PowerShell
$env:CRABNEBULA_TOKEN = "<Cloud token>"; npm run sync

# bash
CRABNEBULA_TOKEN=<Cloud token> npm run sync
```

- Token 在 Cloud 的 **Settings → API keys** 建，给这个组织读权限即可。
- 不给 token 时脚本什么都不写、正常退出（`npm run sync:offline` 等价），签入的清单继续生效——静态页本来就不需要联网调 API。
- 脚本会保留旧版本已有的更新说明，不会因为新版本没带 notes 就把历史清空。

## 发布到 GitHub Pages

1. 新建仓库，把本目录推上去（默认分支 `main`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 需要每天自动刷新清单时，在 **Settings → Secrets and variables → Actions** 加 `CRABNEBULA_TOKEN`；不加也能正常部署，只是清单保持签入时的内容。
4. 推送后工作流会发布 `public/` 目录。

## 要让外部访客真正下得了，还需要在 Cloud 上做三件事

1. **把应用设为公开**。当前 `pointcloud-studio` 的可见性是 Private，Cloud 页面对未登录访客会跳转到登录页。`/asset/<id>` 链接本身不需要登录（实测 206 且带 `Content-Disposition: attachment`），但把应用设为 Public 才能让访客自己也能在 Cloud 上看到版本页。
2. **给 Windows 安装包补上更新平台与签名**。0.3.24–0.3.27 的 Windows 包上传时没有带 `--update-platform windows-x86_64` 与签名，因此 `/update/windows-x86_64/<version>?channel=prod` 返回 400 `Unknown update platform`，应用内的「检查更新」看不到 Windows 正式版。下次上传时：

   ```bash
   cn release upload pointcloud-studio \
     --update-platform windows-x86_64 \
     --file "PointCloud Studio_<版本>_x64-setup.exe" \
     --signature "<同名 .sig 文件内容>"
   ```

   CI 里用 `crabnebula-dev/cloud-release@v0`、`command: release upload <APP> --framework tauri` 时，Tauri 的 updater 产物（`.sig`）会被一并上传，平台也会按 bundle 类型自动填。
3. **发 macOS 包**（如果要支持 macOS）。目前清单里没有 `darwin-aarch64` / `darwin-x86_64` 的任何文件，页面如实写「还没有已发布的安装包」。

## 维护约定

- 换版本只改 `public/releases.json`（或跑 `npm run sync`）。页面里 `<!-- begin:readings -->` 与 `<!-- begin:releases -->` 之间是可以被 `app.js` 整段替换的种子内容，保持结构一致即可。
- 文件编号（`01M6...` 这样的 ULID）是 Cloud 上的资产 id，换版本时整段换掉，不要改写。
- 页面上所有数字都来自清单：文件名、字节数、发布日期。不要手写「下载量」「用户数」这类没有出处的数字。
