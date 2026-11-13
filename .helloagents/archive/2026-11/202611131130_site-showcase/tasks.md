# 官网截图与点云背景 — 任务分解

## 拆分原则
按独立可验证的行为推进；AFK 为代理执行，HITL 为确需人工决策。

## 任务列表
- [√] 任务1（AFK）：发布包含全部页面资源（依赖：无；文件：scripts/check-site.mjs、tests/site-assets.test.mjs、package.json、工作流；完成标准：缺失/未跟踪资源被拒绝，全部资源存在时通过；验证：node --test 与 npm run check:assets）。
- [√] 任务2（AFK）：点云背景与页面交互稳定运行（依赖：任务1；文件：public/radar-scene.js、public/motion.js、public/index.html；完成标准：Canvas 有像素并随时间变化，减弱动效时静态，页面兜底可见，筛选和菜单保持可用；验证：单元测试与浏览器检查）。
- [√] 任务3（AFK）：真实软件截图展示（依赖：无；文件：public/assets/、public/showcase.css、public/index.html、README.md；完成标准：真实主界面和设置细节图片无本地路径，375px 无横向溢出，点击图片可直接查看原图；验证：截图审查、资源检查与浏览器检查）。
- [√] 任务4（AFK）：质量闭环与本地提交（依赖：任务1–3；完成标准：测试、构建、Git 差异检查通过，QA 与视觉证据写入，完成本地提交且不推送；验证：命令输出及 git status）。

## Codex /goal 执行入口
仅在用户显式启动长程目标时使用：/goal 按 `.helloagents/plans/202611131130_site-showcase/tasks.md` 执行；链路 `/goal -> ~auto -> ~qa`。按 AFK 顺序执行，HITL 仅为真实缺失决策；本次不创建 goal。

## 进度
30 项测试、构建、15 个已跟踪资源、桌面/手机截图与交互检查通过。file:// 被浏览器协议策略阻止，未实测；减弱动效的初始状态与切换通过单元测试。QA、视觉和收尾证据已写入，随本次本地提交归档，不推送远程。
