# 平台下载细分 — 任务分解

## 拆分原则
各任务交付可验收行为；AFK 由代理完成，外部发布不属于本次范围。

## 任务列表
- [√] Linux 架构分离：不同版本的 x86_64 和 ARM64 独立选择，格式链接不混用。tests/downloads.test.mjs 验证独立版本与同版合并；桌面及手机实际筛选仅保留所属架构文件。
- [√] Android 与静态内容同步：0.3.28 APK 的链接、版本和日期包含在动态与无脚本页面。npm run build 复用浏览器渲染；同步集成测试验证 HTML 一并更新，失败保留原文件。
- [√] 安装说明与交付验证：已补 Android 与 Linux 架构说明；1280×800、375×812 无横向溢出；格式选择、Escape、外点收起、筛选、直接打开 HTML 均通过浏览器验收。

## Codex /goal 执行入口
需要续跑时按本目录 tasks.md 执行，遵守 requirements.md、plan.md 与 contract.json；/goal → ~auto → ~qa。所有任务为 AFK，远程推送和修改 Cloud 发布不在范围内。

## 进度
19 项单元与集成测试通过，npm run build 成功，语法检查和 git diff --check 通过。真实清单包含 25 次发布、33 个文件；最新 Windows、两个 Linux 架构、Android 均为 0.3.28。
慢清单、503、模块不可用、空清单、禁用脚本和直接打开本地 HTML 已验证；清单更新保持筛选与键盘焦点。浏览器证据位于当前会话 artifacts/。
Android 文件名带 unsigned，页面如实提示签名要求，未声称已验证安装。远程推送和 Cloud 发布仍不在此次范围内。
