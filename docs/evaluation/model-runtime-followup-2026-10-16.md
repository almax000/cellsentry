# 本地 Qwen runtime 协议与 v2 独立验证交接（2026-10-16）

## 本轮范围与结论

本轮只使用本机已缓存的旧 Qwen GGUF，未下载、导入或替换任何权重，也未修改代理。目标是验证桌面 native runtime 的协议链路，并不测量模型准确率或 MiniCPM v2 表现。

缓存文件 `~/Library/Application Support/CellSentry/models/cellsentry-1.5b-v3-q4km.gguf` 的 SHA-256 为 `4ae17b3886e4a5089671bf16aa133eaa6d8917a118bde6c75a54c1c3610f7cd3`。已知受限位置中，Application Support 仅见该文件；`~/Documents/cellsentry-model/` 同名文件只有 134 bytes、SHA-256 不同，不能作为模型。

### v2 远端存在与本机可用性必须分开

用户提供的 Hugging Face artifact 已核验存在：revision `ffaa261f5d7732848fb726dd15224035b8e63c8d` 下的 `gguf/cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf`，约 1.56 GB，声明 SHA-256 `61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a`，与 `DEFAULT_MODEL` 一致。这证明远端 artifact 可见，不证明本机已经取得或验证了该文件。

同一次下载尝试超时，本机没有取得该文件。因此当前没有可作本地 SHA/GGUF 校验的 v2 文件；这次定向检查不等价于全盘搜索，也不能证明 v2 在其他位置不存在。

此前 smoke 的 `Invalid audit judgment or identity` 有可核查的历史原因：`benchmark-results/cellsentry-500/responses.jsonl` 的合成审计响应采用 `Sheet1!D5` 和 `[division_zero]`，而产品协议要求裸 `D5` 和 `division_zero`。这不是把错误身份接受为成功的理由。`parseAudit` 现只将**恰好等于当前输入**的 `Sheet!cell` 与 `[rule]` 规范化为内部表示；任何其他 sheet、cell 或 rule 仍拒绝，且返回的 sheetName 仍由源 issue 绑定。

## 实际 native smoke

在 Mac arm64 上，使用官方缓存的 llama.cpp b11429、独立 Electron profile、随机 loopback 端口和一条合成公式 issue 运行。冻结证据为 `tmp/model-runtime-evidence-20261016/old-qwen-native-smoke-2026-10-16T18-57-21-168Z.json`，其文件 SHA-256 见同目录 `.sha256`。该 run 的记录时间为 `2026-10-16T18:57:21.168Z`，结果：

- native runtime 启动成功：2153.25 ms；
- 返回一条已通过严格身份校验的 judgment：`C2`、`division_by_zero`、`sheetName=Demo`；
- 请求：1082.64 ms；
- 取消并关闭：928.05 ms；
- 该 smoke 不构成准确率、稳定性、能耗或 v2 对比结论。

可复跑命令（只在本地已有对应旧 Qwen 文件时）：

```bash
CELLSENTRY_NATIVE_SMOKE=1 \
CELLSENTRY_SMOKE_MODEL="$HOME/Library/Application Support/CellSentry/models/cellsentry-1.5b-v3-q4km.gguf" \
CELLSENTRY_SMOKE_SHA256='4ae17b3886e4a5089671bf16aa133eaa6d8917a118bde6c75a54c1c3610f7cd3' \
npm --prefix app run test:native
```

`test-native-runtime.cjs` 只在 opt-in smoke 时兼容离线 Electron 包缺少 `path.txt`、但平台二进制已存在的情况；不下载、不安装 Electron。运行产生的日志和报告在项目 `.runtime/tests/`，不是评测材料。

## v2 独立验证的最小前置清单

1. 取得已授权、可校验的 v2 GGUF，保存来源角色、字节数、SHA-256 与许可证；不得把旧 Qwen 或 134-byte 占位文件命名为 v2。
2. 建立新的冻结输入 corpus 与 manifest，记录条目 ID、输入 SHA、标签与标签依据、去标识策略、代码提交、prompt/chat-template SHA、runtime 版本和生成参数。当前应用运行时以 `--ctx-size 1024` 启动；这是产品当前限制，不是模型最大上下文。远端 HF GGUF 页面显示 131072，只有取得并实际运行该 v2 文件后才能把该声明与本地 `/props`／run metadata 对照。
3. 对同一冻结 corpus 分别跑旧 Qwen 与 v2，每次保留原始输入、原始响应、协议/身份失败、评分和运行元数据；区分语义判断、协议通过和产品实际保留/呈现。
4. 在标签冻结前把保留集与训练、prompt/阈值选择按来源和公式骨架隔离；若只能从已提供 archive 转换，应标为 `development_non_heldout`。
5. 先用离线证据审计核对 hashes、ID 与分母，再讨论比较或发布；超时、无效 JSON、身份不符、取消、缺上下文均必须保留规则结果。

原 `external580` 输入 JSONL 仍缺失，现有 v1/v2 corpus hashes 也不同。因此任何新保留集都不能声称“复跑或改善了 external580”，最多是一个新的、独立的运行；达到上述材料链前不得作相对改进或 release 结论。
