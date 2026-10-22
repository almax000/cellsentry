# 公式撤销对照运行器

`scripts/run-formula-comparison.cjs` 在 Electron 中启动与产品相同参数的本地 `llama-server`，通过产品的 `buildAuditPrompt` 和 `parseAudit` 发送、校验每个候选告警。它不下载模型，不修改代理配置，也不改变应用运行时或 UI。

## 不可伪造的输入边界

输入为 JSONL，每一行必须有 `id`、`role`、`issue` 与 `label`。相邻 manifest 必须声明 `role`，仅允许 `diagnostic_smoke`、`frozen_evaluation` 或 `provided_synthetic_test`；每一条记录的 role 必须与 manifest 完全相同。manifest 同时冻结完整 JSONL 的 SHA-256 和有序 `case_ids`。任一字节、角色、顺序或 ID 改变都会拒绝运行。

模型参数形式为 `--model safe-slug=/absolute/path/model.gguf=<64-hex-sha256>`。slug 仅允许小写字母、数字、`_` 与 `-`，并且必须唯一，以防止输出文件覆盖或路径穿越。每个模型启动前重新计算整个文件 SHA-256。

每次成功运行会将精确的 `input.corpus.jsonl` 与 `input.manifest.json` 快照写入输出目录，并在每条响应中写入独立的稳定输入 hash、标签、原始模型响应、完成原因、协议接受／失败原因、模型建议与延迟。

## 运行元数据与产物

每个模型输出以下可审计材料：

- `*.responses.jsonl`：逐条模型建议和协议结果；
- `*.run.json`：UTC 开始／结束时间、基线提交、runner/prompt/protocol/native 源码 hash、模型 SHA、runtime 版本与可执行文件 SHA、原始 chat template 文件及 SHA、本地 runtime 的 1024 context 限制、生成参数、平台、OS release、CPU 型号和内存；
- `*.chat-template.txt`：从正在服务的 runtime 读取的原始模板。模板缺失或空白会使运行失败，不能把空 hash 当作已冻结；实际 `gpu_layers`、`parallel` 与启动／请求超时也会写入 runtime metadata；
- `*.llama-server.log` 与 `comparison-manifest.json`。

以完整 Electron 二进制执行，传入已存在的模型和预先计算的 SHA-256：

```sh
/absolute/path/to/Electron scripts/run-formula-comparison.cjs \
  --corpus app/tests/fixtures/formula-comparison-diagnostic.jsonl \
  --manifest app/tests/fixtures/formula-comparison-diagnostic.manifest.json \
  --output tmp/formula-comparison/example \
  --model baseline=/absolute/path/to/model.gguf=<64-hex-sha256>
```

输出目录必须为空。`--no-cancel-probe` 可关闭默认取消探针；默认探针会在一次真实本地请求后 50ms 中止并记录结果。这是运行器 transport 的证据，不替代产品扫描取消验收。

## 语料与解读边界

`app/tests/fixtures/formula-comparison-diagnostic.jsonl` 是两条合成 `diagnostic_smoke`，只验证端到端协议、元数据和计数。它不是保留集、不是 external580 的替代，也不得被用于训练结论、准确率主张或模型横比。external580 的原始 JSONL 尚缺失，运行器不会伪造它。

`frozen_evaluation` 只能用于已有、可合法保存且事先冻结的保留集；每个模型必须使用同一 snapshot。一次独立评测仍必须遵守 `model-evaluation-acceptance-contract.md` 和 `new-holdout-specification.md` 的标签复审、隔离与覆盖率说明。

输出中的 `model_recommendation` 与 `summary.model_recommendations` 只描述模型对既有候选的建议。它们不是产品已执行的撤销。`product_policy.automatic_withdrawals` 固定为 `0`：应用仍不自动撤销发现。无效 JSON、身份不一致、超时、取消或不可用建议均保留规则发现；`summary.product_effect` 会按真实错误／误报标签分别计入 protocol failure 的保留，避免在分母中消失。

## 已过时的 diagnostic 证据

旧目录 `tmp/formula-comparison-runner-20261016/old-qwen-diagnostic-final3-20261016T123224/` 是 schema v1 运行器的 diagnostic 证据，保留作历史调试记录，但没有输入快照、runtime executable SHA、原始 template 文件、库文件 hash 或模型建议／产品效果分离。它不得作为当前四项完整性约束的证据。新 schema v2 diagnostic 已在下述目录重跑；两者都不构成准确率、模型横比或 v2 结论。


## 当前 schema v2 diagnostic 证据

基线提交为 `82ca02fbfb637608e6430a489a132df4ec29bb75`，最终运行器源码 hash 记录于 run metadata。输出目录是 `tmp/formula-comparison-runner-20261016/old-qwen-diagnostic-schema-v2-final-20261016T123526/`。它包含精确 input corpus／manifest 快照、原始 chat template、响应、run metadata、比较 manifest 与本地 server log。该历史目录不含本轮补强的 library hash、已读取 Buffer snapshot 与实际 gpu/parallel/timeout metadata。`old-qwen.run.json` SHA-256 为 `2b43899659106e43fbc2ffda391f5282eff2fbd470d6a20b39c8393ca41a48db`；`old-qwen.responses.jsonl` SHA-256 为 `d621f712dedaef165a81bff9afa35650e659b4144e475d086920e44470cff458`。

这两条仍是合成 diagnostic_smoke：一条真实错误有可接受的模型建议，一条误报候选返回 `finish_reason=stop` 的完整 JSON，但缺失协议必填 `adjustedConfidence`，因此没有模型建议并按产品策略保留。取消探针成功。该记录只验证输出 schema 与当前本地环境的协议行为，不是模型评测结果。

## 仓内提供的 480 条 synthetic test

`scripts/prepare-provided-formula-test.cjs` 只转换仓内 `training-data/formula-cancellation-v2/test.jsonl`。它先核对 source test JSONL SHA-256 与源 manifest，再强制其声明的 480 条、240 条真实错误、唯一 ID 及原有警告：synthetic context templates 在 split 间共享，因此不是独立真实世界评测。转换输出的唯一合法 role 是 `provided_synthetic_test`；它不能被改写成 `frozen_evaluation`。

转换时每个 case 必须只有一个 `case.input.issues` 候选，`expected` 身份必须匹配该候选。运行器当前的 `buildAuditPrompt([issue])` 必须与源 `messages` 的 user 内容逐字节一致；assistant message 从不写入转换输入，也不会送进推理。每条转换记录保留原始 ID、source family、oracle、标签理由和两个 user prompt SHA-256。默认冻结目录为 `tmp/formula-comparison-runner-20261016/provided-test480/`，其中的 manifest 保存 source JSONL/manifest SHA-256、原有 warning 和该限制。

该转换器只准备可复跑的仓内 synthetic test，不重写标签、不创建 holdout，也不构成独立评测。完整模型运行应使用该目录的 `input.corpus.jsonl` 和 `input.manifest.json`。长跑时 runner 在发送第一个样本前保存 template，随后每条 response 立即 append 落盘，并每 20 条仅输出 `{completed,total}` 进度，不输出样本文本或认证材料。
