# PointCloud Studio 下载站

一个独立的纯静态站点，把 CrabNebula Cloud 上已发布的 PointCloud Studio 安装包公开给任何访客下载。
不需要后端、不需要登录、不需要 Cloud 账号；页面上的每个下载链接都直连 `cdn.crabnebula.app/asset/<id>`。

与 Tauri 应用仓库分开维护：应用照常打包上传，这里只负责「对外能下载」这一件事。

## 页面里有什么

- **首屏**：Windows、Linux 各自的最新版本，版本号、发布日期、文件大小与下载入口；只有一个安装包的系统直接给一个下载按钮，像 Linux 这样同时有 deb 与 AppImage 的，「下载 Linux 版」是个下拉栏，点开选 `.deb` 还是 `AppImage`（每项标注适用发行版与文件大小）；没有安装包的系统单独说一句「还没有已发布的安装包」，而不是留一个点不动的按钮。
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
  crabnebula-client.mjs 以 API key 换取访问令牌，再请求目录接口
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
$env:CRABNEBULA_TOKEN = '<Cloud API key>'; npm run sync

# bash
CRABNEBULA_TOKEN='<Cloud API key>' npm run sync
```

- API key 在 Cloud 组织的 **Settings → API keys** 创建，给这个组织读权限即可。沿用环境变量名 `CRABNEBULA_TOKEN`，也支持 `CRABNEBULA_API_KEY` 或官方 CLI 的 `CN_API_KEY`；按此顺序取第一个非空值。
- API key 需要先通过 `apiKeys.authenticate` 换取短期 `accessToken`，再请求发布目录。脚本自动完成这一步；直接把 API key 当目录接口的 Bearer 会收到 `401 InvalidToken`，不能据此判断 key 已过期。密钥和访问令牌都不会写入清单或日志。
- 不给 key 时脚本不写文件、正常退出（`npm run sync:offline` 等价），签入的清单继续生效。CI 里不配 key 时，推送触发的部署会警告；定时或手动刷新会失败，避免「没刷新也报成功」。
- 脚本会保留旧版本已有的更新说明，不会因为新版本没带 notes 就把历史清空。
- 只同步 `Published` 状态的版本，使用 Cloud 的 `pubDate` 作为发布日期。安装包文件名中明确的 ARM64 / x86_64 优先于更新平台字段，避免上传时填错平台造成下载误标。

`npm test` 使用 Node 内置测试框架，验证认证、失败时保留原清单、发布状态与安装包映射；不需要安装依赖或提供真实 key。

## 发布到 GitHub Pages

1. 新建仓库，把本目录推上去（默认分支 `main`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 定时或手动刷新需要 **Settings → Secrets and variables → Actions** 里的仓库级 secret `CRABNEBULA_TOKEN`，值填 Cloud API key（对 `hbzsy` 组织有读权限）。没配也能推送部署，但刷新任务会失败并标红。
4. 推送后工作流会发布 `public/` 目录。

## 要让外部访客真正下得了，还需要在 Cloud 上做三件事

1. **把应用设为公开**。当前 `pointcloud-studio` 的可见性是 Private，Cloud 页面对未登录访客会跳转到登录页。`/asset/<id>` 链接本身不需要登录（实测 206 且带 `Content-Disposition: attachment`），但把应用设为 Public 才能让访客自己也能在 Cloud 上看到版本页。
2. **给 Windows 安装包补上更新平台与签名**。0.3.24–0.3.27 的 Windows 包上传时没有带 `--update-platform windows-x86_64` 与签名，因此 `/update/windows-x86_64/<version>?channel=prod` 返回 400 `Unknown update platform`，应用内的「检查更新」看不到 Windows 正式版。下次上传时：

   ```bash
   cn release upload hbzsy/pointcloud-studio "<版本>" \
     --update-platform windows-x86_64 \
     --file "PointCloud Studio_<版本>_x64-setup.exe" \
     --signature "PointCloud Studio_<版本>_x64-setup.exe.sig"
   ```

   `--signature` 接收 `.sig` 文件路径；同目录存在“安装包完整文件名 + `.sig`”时可以省略，CLI 会自动读取。ARM64 Linux 安装包的更新平台应填 `linux-aarch64`，x86_64 包填 `linux-x86_64`。

   CI 里用 `crabnebula-dev/cloud-release@v0`、`command: release upload <APP> --framework tauri` 时，CLI 会自动读取 Tauri 产物的签名，平台也会按 bundle 类型自动填。
3. **发 macOS 包**（如果要支持 macOS）。目前清单里没有 `darwin-aarch64` / `darwin-x86_64` 的任何文件，页面如实写「还没有已发布的安装包」。

## 维护约定

- 换版本只改 `public/releases.json`（或跑 `npm run sync`）。页面里 `<!-- begin:readings -->` 与 `<!-- begin:releases -->` 之间是可以被 `app.js` 整段替换的种子内容，保持结构一致即可。
- 文件编号（`01M6...` 这样的 ULID）是 Cloud 上的资产 id，换版本时整段换掉，不要改写。
- 页面上所有数字都来自清单：文件名、字节数、发布日期。不要手写「下载量」「用户数」这类没有出处的数字。
