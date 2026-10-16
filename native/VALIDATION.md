# 原生端侧接入验证

日期：2026-10-16。开发主机：Windows x64。本次保留现有 v2 Q4_K_M 模型，不重新训练或重跑完整能力评测。

## 已完成

- `npm run typecheck`：Node 和界面 TypeScript 均通过。
- `npm run build`：Electron 主进程、预加载和界面构建通过。
- `CELLSENTRY_NATIVE_SMOKE=1 node --test scripts/test-native-runtime.cjs`：7 项通过，包括实际 GGUF 推理、并发启动合并、取消、进程回收、错误身份拒绝和离线导入失败保护。
- 手机包装提示词与原生服务 `/apply-template`、`/tokenize` 的实际 token IDs 一致，包括仅一个 BOS 与关闭思考的前缀。
- 已构建未签名 Windows 打包目录 `app/dist/win-unpacked/`，确认运行时资源齐全，无 Python 脚本或解释器资源。
- `node scripts/smoke-native-electron.cjs --packaged`：PATH 仅包含 Windows 系统目录，首次设置窗口离线导入真实 GGUF，主界面成功报告 `backend=llama.cpp`、`modelLoaded=true`。测试退出后原生进程结束，测试模型副本已清理。
- 官方 Windows CPU、Mac arm64/x64 归档与 iOS XCFramework 的 SHA256 均已校验。Mac 归档及 XCFramework 需要在 Mac 解压以保留符号链接。
- Xcode 工程经过 OpenStep 工程解析，包含应用与 XCTest 两个 target；手机样例、模型清单和提示词资源已生成。

## 尚未验证

- 当前主机无 Xcode，未完成 Mac 应用编译、签名、公证或运行。
- 未编译 iOS Swift/Objective-C++，未执行 XCTest，未生成签名 IPA，也未进行 iPhone 16e 真机测试。工程解析和 token 对齐检查不能代替这些步骤。
- 新增的 GitHub Actions iOS 构建流程尚未运行。Windows 打包验证为未签名目录构建，不是签名安装器验收。
- 尚无 iPhone 内存峰值、耗时、能耗或热稳定性结论；测试 App 提供导出这些测量记录的入口。

在 Mac 完成 `ios/README.md` 的准备、构建和真机步骤后，才能确认手机运行表现。原始历史模型能力报告仍保留其适用范围与限制。
