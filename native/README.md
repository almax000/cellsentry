# 原生 llama.cpp 运行时

产品推理使用 GGUF + llama.cpp b11429，不调用 Python。桌面由 Electron 的 Node 主进程直接启动本机 llama-server，通过带临时访问密钥的 127.0.0.1 HTTP 请求交互；iOS 在进程内链接同版本 XCFramework。

## 桌面准备

在实际目标平台运行：

```
node scripts/prepare-native.mjs
```

也可以指定 `win32-x64`、`darwin-arm64` 或 `darwin-x64`。Windows 上准备 Mac 产物时只下载并校验，解压必须在 Mac 上执行以保留 dylib 符号链接。产物位于 `native/<平台>-<架构>/`，`runtime.json` 记录相对可执行路径。安装器按平台只复制对应目录，模型另行下载或离线导入。

官方 Windows 产物为 CPU 版本，无需 CUDA SDK。Apple Silicon Mac 启用 Metal，Intel Mac 默认 CPU。准备脚本保留上游目录结构和动态库相对路径；安装器的签名、公证与实际运行仍需在相应目标系统验证。

固定下载地址和 SHA256 在 `scripts/native-artifacts.mjs`；所有下载在解压前验证哈希。第三方许可见 `LLAMA-LICENSE`，下载包内其他许可也随目录保留。

## 产品接口

- `app/electron/llm/native.ts`：SHA256 校验、原生进程、启动探测、串行推理、超时和退出清理。
- `app/electron/llm/protocol.ts`：严格 JSON、地址及规则身份校验；无效输出保留原规则结果。
- `app/electron/model/importer.ts`：离线导入到临时副本，验证后替换；失败不覆盖原模型。
- `app/electron/model/paths.ts`：区分开发模型目录、安装后的可写模型目录和按平台分发的原生运行时。

训练与历史评测 Python 脚本仅用于研究，不进入 Electron 安装包。原 `scripts/llm_server.py` 已移除。

官方参考：[构建](https://github.com/ggml-org/llama.cpp/blob/b11429/docs/build.md)、[XCFramework](https://github.com/ggml-org/llama.cpp/blob/b11429/docs/xcframework.md)。
