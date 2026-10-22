# Electron E2E

在 `app/` 下运行 `npm run test:e2e`。测试默认使用隐藏窗口，单 worker、零重试，首次失败即停止。

macOS 上的外层工具沙箱可能阻止 Electron 向系统注册应用，导致启动前 SIGABRT，Playwright 只显示 `Process failed to launch!`。隐藏窗口无法抑制系统生成的崩溃对话框。遇到这个错误立即停止，检查日志；需要宿主权限时通过运行工具的正常审批执行，不在同一沙箱里反复重试，不修改代理或系统崩溃报告设置。

需要可见窗口时先取得 jojo 同意；CI 自有 runner 沿用工作流里的可见窗口配置。

只检查配置或用例发现时使用 `npx playwright test --list`，这不会启动 Electron。测试日志和报告保存在本项目的 `tmp/` 中。
