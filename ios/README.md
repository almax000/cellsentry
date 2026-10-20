# iPhone 16e 最小端侧测试

最小工程已通过 GitHub macOS CI 的 iPhone 设备与模拟器测试编译。2026-10-20 已完成 Release 签名、IPA 导出和 App Store Connect 上传。本 Windows 开发机不执行 Apple 编译；尚未进行真机运行与性能测试。

## Windows 开发机通过 TestFlight 安装

2026-10-20 已在 Apple Team `922LFX6FZ8` 注册测试应用：

- Bundle ID：`com.cellsentry.phone.test`。
- App Store Connect：[CellSentry Phone Test](https://appstoreconnect.apple.com/apps/6824777154/distribution)，Apple ID `6824777154`。
- 专用 App Store 描述文件：`cellsentry-phone-appstore`，绑定本次新增的 Apple Distribution 证书。

`.github/workflows/testflight-ios.yml` 为手动签名发布流程，使用 GitHub 托管的 macOS 26 构建 Release。
不勾选 `upload` 时只导出签名 IPA；勾选时先验证 IPA，再上传 App Store Connect。
[首次签名上传 CI](https://github.com/almax000/cellsentry-dev/actions/runs/39369118716) 已通过，
使用 Xcode 26.6 构建 `0.1.0 (1.1)`。Apple 上传返回无错误，Delivery UUID：
`aa13f291-2acb-4110-9d0a-ed230bf2f71e`。签名 IPA 为 8,269,237 字节，不含模型。
Apple 构建处理状态已为 `VALID`；已按测试 App 实际实现完成加密问卷（无非豁免加密）。
构建已加入“iPhone 16e 离线测试”内部测试组，账号持有人已授权接收 TestFlight 邀请。
手机安装和断网推理尚待实测，不能将签名上传成功视为真机性能验证。

仓库 Variables：`APPLE_TEAM_ID`、`ASC_KEY_ID`、`ASC_ISSUER_ID`。
仓库 Secrets：

| 名称 | 内容 |
| --- | --- |
| `APPLE_DISTRIBUTION_P12_BASE64` | 含私钥的 Distribution P12 的 Base64 |
| `APPLE_DISTRIBUTION_P12_PASSWORD` | P12 密码 |
| `APPLE_APPSTORE_PROFILE_BASE64` | 此 Bundle ID 的 App Store 描述文件的 Base64 |
| `ASC_API_KEY_BASE64` | App Store Connect 上传 P8 的 Base64，仅上传步骤使用 |

签名资料不进入 Git。CI 使用临时钥匙串，校验描述文件的 Team、显式 Bundle ID、分发类型和有效期，
运行结束清理证书及密钥；只保留签名 IPA，下载有效期 7 天。App 图标从现有桌面图标在 macOS 构建时生成。

上传成功后，等待 Apple 处理，再在此 App 的 TestFlight 页面添加内部测试组和自己的测试账号。
用 iPhone 上的 TestFlight 安装。模型需要另行放到手机“文件”App 并导入；安装和模型准备好后再断网运行，
将测试界面的 JSON 记录分享回 Windows 分析。TestFlight 安装分发本身需要联网。

PII mmBERT 内置版 `0.1.0 (2.1)` 已完成签名上传，Apple 处理状态为 `VALID`，
已分配到原内部测试组；外部测试组已提交 Beta 审核，状态为“正在等待审核”。
[内置模型构建 CI](https://github.com/almax000/cellsentry-dev/actions/runs/39381507796) 全部通过，
Delivery UUID：`2b81c586-4643-4cdc-9c6e-13bc73564e26`。
默认页面加载包内 `pii-mmbert-v2-q8_0.gguf`，无需单独下载模型。
此模型为原始 step400 编码器重新导出的标准 GGUF Q8_0，341,096,480 字节；不是此前自定义 Q8 safetensors。
原始 FP32 8 类线性分类头保存在 `Resources/PII/pii-head.json`；运行时使用未归一化的均值池化向量计算分类概率，阈值保持 0.95。
候选输入超过 512 token 明确报错。所有手机推理使用原生 llama.cpp，不调用 Python。

Windows CPU 上对独立 dev 固定选择的 128 条候选检查了分词和分类：分词全部一致，
Q8 GGUF 与原始 PyTorch 的 top1 类别无变化，最大概率差 `4.7982e-5`。
这仅验证格式转换和接口对齐，不是新的准确率 benchmark，也不代表 iPhone Metal 的数值或性能已验证。
没有使用 64 份挑战数据训练、校准或挑选量化参数。

PII 页面是候选分类的最小测试，内置 8 类合成样例，可编辑输入、查看类别/概率/耗时并导出记录。
它不包含完整候选提取、Excel 解析、自动脱敏；模型已有漏报问题，不能作为自动脱敏验收。
原来的 MiniCPM 公式测试保留在“公式”页，仍需自行导入指定的 1.56 GB GGUF。

签名 CI 调用 `node scripts/prepare-pii-ios.mjs` 从本私有仓库的 `pii-mmbert-v2-ios-q8` Release 获取模型，
校验大小和 SHA256 后嵌入 App。下载凭据只在 CI 使用，不进入 App。普通未签名编译无需下载大模型。
本机已有模型时可设置 `CELLSENTRY_PII_GGUF` 指向它，再运行同一脚本。

离线导出复现：`scripts/export-pii-mobile.py` 准备原始 HF 编码器及 FP32 分类头；
使用固定 llama.cpp `d81235049384534c167caea52b85a694f6103d14` 的 `convert_hf_to_gguf.py --outtype f32` 导出，
再用同版本 `llama-quantize ... Q8_0` 量化。`scripts/verify-pii-mobile.py` 对照本机 18767 端口的
`llama-server --embedding --pooling mean --embd-normalize -1` 检查 128 条 dev 候选。
Python 仅用于电脑上的离线转换/验证，不是产品运行依赖。

本地可验证签名配置检查：`node --test scripts/test-ios-signing.mjs`。
参考：[GitHub CI 证书管理](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)、
[Apple 上传构建](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)。

## 在 Mac 上准备

1. 安装可支持目标手机系统的 Xcode，以及 Node.js 20+；Xcode 工程部署目标为 iOS 17.0。
2. 在仓库根目录执行 `node scripts/prepare-ios.mjs`。脚本下载固定的 llama.cpp b11429 官方 XCFramework，验证 SHA256 后用 ditto 解压，保留 Apple 框架符号链接。框架位于 `ios/Vendor/llama.xcframework`。

   官方 b11429 下载包仅含设备与 macOS 库。需要模拟器或 XCTest 时，改为执行 `node scripts/prepare-ios.mjs --simulator`：需要 Mac 上的 Git/CMake/Xcode，从固定提交 `d81235049384534c167caea52b85a694f6103d14` 构建并补入模拟器库，保留官方设备库。CI 使用这一选项。
3. 打开 `ios/CellSentryPhone.xcodeproj`，选择 `CellSentryPhone` scheme。
4. 在 Signing & Capabilities 中设置自己的 Team；如 Bundle ID 冲突，更换 `com.cellsentry.phone.test`。
5. 连接 iPhone 16e，信任此 Mac，按系统提示开启开发者模式，选择该真机后 Run。日常性能测量使用 Release 配置；首次 Metal 编译和加载应单独记录。

模型不随应用打包。将 Windows 本机 `models/cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf` 通过文件传输放入手机“文件”App，然后在测试 App 点击“从文件导入 GGUF”。需要保存约 1.56 GB 的应用内副本；请为来源文件、副本和临时空间预留足够存储。

固定模型 SHA256：

```
61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a
```

模型来自私有 Release，不能把 GitHub Token 写入 App。最小版本使用离线文件导入；面向普通用户发布时再接入具备访问权限的模型分发服务。导入后的副本保存在 Application Support/Models，并排除 iCloud 备份。

## 测试流程

- 点击“加载模型”，记录校验后的原生加载耗时及加载完成内存。
- 依次运行三个内置公式样例；默认关闭思考、上下文 1024、最多 420 个生成 token，单条串行推理。
- 每条完成后导出 JSON，检查 `protocolValid`、`correct`、`prefillSeconds`、`totalSeconds`、`generatedTokens` 和 `sampledPeakMemoryMiB`。
- “采样峰值内存”只是在预填充块和 token 边界采样的应用内存 footprint，不代表系统精确峰值；最终内存和能耗应以 Xcode Instruments 为准。
- 可编辑公式、告警和上下文；编辑后的样例不再使用原标签统计正确率。
- 测试取消、后台切换和内存告警。取消在加载进度、预填充或 token 边界响应；进入后台或收到内存告警时取消并在串行队列卸载模型。
- 断网后重复运行，确认无需访问服务器。卸载 App 会删除导入的模型副本。

输出无效、地址不匹配、超过 1024 上下文或达到生成上限时，保留告警并显示失败原因。模型判为误报时同样只显示建议，不自动撤销。

## 结构与对齐

- `CellSentryPhone/Native/CSLlamaEngine.mm`：llama.cpp C API；真机 Metal、模拟器 CPU，mmap，4 个 CPU 工作线程。
- `PhoneModel.swift`：流式 SHA256 校验、提示词、结果协议校验。
- `PhoneViewModel.swift`：串行工作队列、取消、模型管理及测试记录。
- `Resources/`：模型清单、桌面生成的提示词模板及三条样例。
- `CellSentryPhoneTests/`：提示词、输出身份和模型清单测试。

模型不变时，`<s>` BOS、system/user 边界及空思考前缀保持与 GGUF 聊天模板一致。桌面真实模型测试通过 `/apply-template` 和 `/tokenize` 比较了手机包装与服务端生成的实际 token IDs。框架、模型或模板升级后应重新运行这项检查。

在桌面修改提示词后，从根目录执行 `node scripts/generate-phone-assets.cjs`（需要先安装 app 依赖）。生成的资源需要提交。工程可通过 `node scripts/generate-ios-project.mjs` 重建，无需 XcodeGen 或 CocoaPods。

## Mac 编译检查

```sh
xcodebuild -project ios/CellSentryPhone.xcodeproj -scheme CellSentryPhone \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

这条命令只验证未签名构建，不能产生可直接装手机的签名包。Xcode 的 Product > Test 可运行协议测试；模拟器的性能不能用于推断 iPhone 16e 真机性能。

`.github/workflows/build-ios.yml` 提供设备构建及模拟器测试编译检查，[2026-10-16 CI 已全部通过](https://github.com/almax000/cellsentry-dev/actions/runs/38854062092)。XCTest 只完成编译，尚未执行。这个最小版本暂不包含 Excel 文件解析和完整表格界面。
