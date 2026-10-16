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

- 当前主机无 Xcode；Mac 桌面应用仍未完成编译、签名、公证或运行。
- iOS Swift/Objective-C++ 已在 GitHub macOS CI 编译通过；XCTest 仅完成编译，未执行；未生成签名 IPA，也未进行 iPhone 16e 真机测试。
- Windows 打包验证为未签名目录构建，不是签名安装器验收。
- 尚无 iPhone 内存峰值、耗时、能耗或热稳定性结论；测试 App 提供导出这些测量记录的入口。

在 Mac 完成签名及 `ios/README.md` 的真机步骤后，才能确认手机运行表现。原始历史模型能力报告仍保留其适用范围与限制。

## iOS 云端编译补充验证

- 首轮 CI：设备 Release 编译通过，模拟器测试编译因官方 b11429 XCFramework 不含 Simulator 库而失败。
- 修复提交：`aa47256393fd7849aec818146d2cb4b8e7a73ba8`。通过 `prepare-ios.mjs --simulator` 从固定 b11429 源码提交构建模拟器库，并与已校验的官方设备库组合。
- [第二轮 CI](https://github.com/almax000/cellsentry-dev/actions/runs/38854062092)：2026-10-16 全部通过，总作业用时 2 分 7 秒；包括 iPhone 未签名 Release 构建、模拟器 XCTest 编译和未签名 App 产物上传。
- 仍有非阻塞警告：Swift 非 Sendable 对象捕获、旧 onChange 接口、重复 C++ 链接库以及未使用 AppIntents 元数据提取。
- 这次验证没有执行 XCTest、没有加载模型进行模拟器推理，也不能代替手机签名安装和真机性能测试。
