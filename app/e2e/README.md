# Electron E2E

在 `app/` 下运行 `npm run test:e2e`。测试默认使用隐藏窗口，单 worker、零重试，首次失败即停止。

macOS 上的外层工具沙箱可能阻止 Electron 向系统注册应用，导致启动前 SIGABRT，Playwright 只显示 `Process failed to launch!`。隐藏窗口无法抑制系统生成的崩溃对话框。遇到这个错误立即停止，检查日志；需要宿主权限时通过运行工具的正常审批执行，不在同一沙箱里反复重试，不修改代理或系统崩溃报告设置。

需要可见窗口时先取得 jojo 同意；CI 自有 runner 沿用工作流里的可见窗口配置。

只检查配置或用例发现时使用 `npx playwright test --list`，这不会启动 Electron。测试日志和报告保存在本项目的 `tmp/` 中。

linked worktree 的 Electron.app 可能只有启动文件、缺少 Framework。launcher 会在启动前检查，缺失时直接报错；使用 `CELLSENTRY_E2E_ELECTRON` 显式指定已存在且完整的同版本 Electron 安装，不把损坏的 bundle 当作可运行程序反复重试。宿主执行也不能修复缺失的动态库。
