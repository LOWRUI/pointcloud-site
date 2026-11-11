# PointCloud Studio 下载站

一个独立的纯静态站点，把 CrabNebula Cloud 上已发布的 PointCloud Studio 安装包公开给任何访客下载。
不需要后端、不需要登录、不需要 Cloud 账号；页面上的每个下载链接都直连 `cdn.crabnebula.app/asset/<id>`。

与 Tauri 应用仓库分开维护：应用照常打包上传，这里只负责「对外能下载」这一件事。

## 页面里有什么

- **下载区**：Windows、Linux、Android 的最新版本、发布日期、文件大小与下载入口。Linux 分 x86_64 和 ARM64 两栏，各自选择最新稳定版、各自提供 deb / AppImage / rpm 格式；某个架构更新较慢时仍保留它自己的最新版本。Android 提供 APK；没有安装包的平台如实显示暂无。
- **界面截图**：`public/assets/live-main.png`，取自软件真实运行画面。
- **版本记录**：全部 / Windows / Linux x86_64 / Linux ARM64 / Android，只有实际有安装包的平台才出现筛选按钮；文件按发布时间倒序列出，显示版本、更新要点、文件名、大小、发布日期和下载链接。
- **安装**：Windows 的 SmartScreen 提示、Linux 的架构识别和 deb / AppImage / rpm 安装、Android 的安装来源与 APK 签名要求。文件名标记为 unsigned 的 Android 包在下载区提示需先签名。

页面不展示 Cloud 发布页入口、更新通道和来源说明：软件内本来就不显示「检查更新」按钮，通道名对访客也没有意义。

页面在 1280×800 与 375 宽度下都检查过：窄屏时安装包列表每行改为竖排，不横向滚动。

## 目录

```
public/                 部署上去的就是这个目录
  index.html            页面（自带一份完整的静态内容）
  style.css tokens.css  现有样式与设计令牌
  downloads.css         Linux 分架构布局与下载控件
  releases-model.js     架构分组、版本选择与格式化
  releases-view.js      浏览器与静态生成共用的 HTML 渲染
  app.js                平台筛选与格式选择，不依赖清单请求或模块加载
  releases-refresh.js   可选增强：刷新清单与失败提示
  releases.json         版本与文件清单（唯一数据源）
  favicon.svg
  assets/live-main.png  软件界面截图
scripts/
  fetch-releases.mjs    从 Cloud 拉清单，同时更新清单和默认下载内容
  render-page.mjs       按清单生成 index.html 中标记的区块
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
通过文件打开时使用生成的静态内容，平台筛选和格式选择仍可用；通过 HTTP 预览时，还会尝试刷新清单。平台筛选栏直接包含在 HTML 中，不依赖清单刷新成功后才显示。

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
- 同步成功后自动生成 HTML 默认内容；不加载脚本时也能看到相同的 Linux 架构和 Android 下载。手工改清单后执行 `npm run build`，GitHub Pages 部署前也会执行该命令。
- 页面先显示构建时的安装包，再尝试读取清单。刷新失败时保留下载入口并显示提示，已加载的筛选和格式选择仍然可用。

`npm test` 使用 Node 内置测试框架，验证认证、失败保留、发布状态、架构映射、独立版本、Android、HTML 转义和静态生成；不需要安装依赖或提供真实 key。

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

- 换版本运行 `npm run sync`；手动修改 `public/releases.json` 后运行 `npm run build`。页面里 readings / releases / stamp 标记之间的内容由共享渲染模块生成，不手工维护第二份版本信息。
- 文件编号（`01M6...` 这样的 ULID）是 Cloud 上的资产 id，换版本时整段换掉，不要改写。
- 页面上所有数字都来自清单：文件名、字节数、发布日期。不要手写「下载量」「用户数」这类没有出处的数字。
