# 平台下载细分 — 实施规划

## 目标与范围
Linux 下载区域展示 x86_64 和 ARM64 独立选项；补全 Android 下载、筛选和安装说明；使静态种子内容随同步生成。

## 架构与实现策略
原 app.js 的分组模型与 DOM 渲染拆为独立模型和 HTML 渲染模块。app.js 保持普通脚本，独立处理静态筛选与格式交互；releases-refresh.js 模块仅增强清单刷新。scripts/render-page.mjs 使用相同渲染更新 index.html 中标记的种子区块；同步成功后和 CI 构建时都执行生成。

## 领域语言
Linux x86_64 对应 amd64 / x86_64；Linux ARM64 对应 arm64 / aarch64。Android 展示 APK，不推断文件未声明的指令集。

## 完成定义
qaMode 为 standard；聚焦平台选择、真实资源、静态回退、转义和响应式。每个 Linux 子区域仅有自身架构的格式；Android 下载指向当前已发布资源；无 JS 仍有相同安装包；375px 无溢出。

## 文件结构
public/releases-model.js、public/releases-view.js、public/app.js、public/downloads.css；scripts/render-page.mjs；现有同步脚本、工作流和 README；tests/downloads.test.mjs。

## UI / 设计约束
延续 .helloagents/DESIGN.md。Linux 一个总区域、内部双列，在手机上纵排。复用 details 选择格式、显式架构文字和 aria-pressed 筛选。加载保留种子、失败就地提示、无包显示暂无。

## 风险与验证
数据必须 HTML 转义，资源 URL 只使用固定 CDN；同版不同架构不能互相覆盖。单元测试验证模型与渲染，真实 Cloud 同步核对链接；浏览器验证桌面、375px、筛选、Escape 与键盘。

## 决策记录
- [2026-11-11] 按用户明确的修改要求直接实施；两个 Linux 架构使用独立版本和格式，Android 纳入同一下载链路。
- [2026-11-11] 实测重传后清单包含 0.3.28 的 Windows、两个 Linux 架构和 Android，共 33 个安装包。
- [2026-11-11] 用户强调保留平台筛选。筛选栏直接包含在 HTML 中，筛选事件不依赖模块加载或网络成功；异步刷新后保持用户选择和焦点。
- [2026-11-11] 浏览器覆盖两种视口、五个筛选、原生格式选择与键盘、慢请求、失败、空清单、无脚本和文件打开。首屏收紧后四种下载入口在桌面同时可见。
