# Jev-style 公式告警回归基准 v1

针对“已发现的公式告警是真错还是误报”的二选一决策，覆盖本项目与隔壁 cellsentry 的既有合成测试。与 PII 任务无关。共五组、2,196 行：基础规则 180、旧业务场景 960、v5 表达变化 288、v6 变化 480、v7 薄弱规则 288。全部作为研发回归集，不能宣称独立泛化能力；没有引入来源不明的外部归档，也没有修改模型或训练。

`manifest.json` 记录每组来源、原文件 SHA256、类别分布和精确输入重复数量，以及每份预测的来源和 SHA256。各组独立出分，不按简单平均形成总榜。精确输入无重复不能证明模板或语义独立。沿用原合成标签，未新增人工工作簿审查。

模型输入文件为 `*.inputs.jsonl`，只含 id/state/question/options；gold 文件另含 label/is_error/oracle 等信息，禁止送入模型。候选文本格式由 `candidateText` 保持与原 CPM-JEV 一致，选项顺序依数据保留。mmBERT 原生二分类使用其原 state/question 协议；字段/辅助组必须使用原来的字段提取，不强行改成候选打分。

## 复现

在仓库根目录运行，只需 Node.js，无 Python 或模型依赖：

```powershell
node --test scripts/test-formula-benchmark.mjs
node scripts/formula-benchmark.mjs replay
node scripts/formula-benchmark.mjs score test-cases/jev-formula-v1/v7_test.jsonl test-cases/jev-formula-v1/predictions/cpm-jev/v7_test.jsonl .runtime/jev-score.json
```

建立新版本快照：`node scripts/formula-benchmark.mjs snapshot D:/git/cellsentry test-cases/jev-formula-v2`。已有 manifest 的目录拒绝覆盖。回放时先核对数据和预测哈希，数据变化即失败。

新模型输出 JSONL 每行 `{id, predicted_error: boolean, error_probability?: number}`。每个 gold ID 必须恰好一条；空缺、重复、额外 ID、无效概率和已有 expected_error/state_sha256 不一致均报错。后者仅对预测携带的字段校验；旧预测没有完整输入哈希绑定，来源关系依原实验记录，不能追认成独立推理证据。

`score` 默认保留原预测，不重新根据概率改变判定。可在末尾显式指定一个已在开发集确定的固定阈值，例如 `0.5`；不得按测试结果选择阈值。报告记录判定规则。概率未校准，不能直接称为可信置信度。

## 指标口径

- 真错误为正类：TP 真错保留、TN 误报撤销、FP 误报保留、FN 真错被撤销。
- 真错召回 = TP/(TP+FN)；**误撤销率 = FN/(TP+FN)**。
- 撤销精确率 = TN/(TN+FN)；误报撤销率 = TN/(TN+FP)；撤销覆盖率 = (TN+FN)/全部告警。
- 报告 accuracy、macro-F1、按规则混淆矩阵、包含正反例的整组全对比例、NLL/Brier，以及逐条错误 ID。没有撤销时撤销精确率为 null。

预测快照用于重算和核验旧实验，不代表本次重新运行模型。CPM-JEV 与 mmBERT 的训练预算和输入协议不同，不是控制变量实验。旧 CPM 基础/业务预测和 v7 新题预测来源不同，均在 manifest 记录；不能用旧榜单文字替代当前预测计分。未覆盖端到端告警发现、解释质量、真实 Excel 执行或 iPhone 速度/内存。

## 可选的模型重新推理

另提供 `scripts/benchmark-formula-encoder.py`，复用隔壁已有的离线训练环境与 encoder 构建代码。它是实验适配器，不属于产品运行依赖；数据生成、冻结和计分仍只依赖 Node。无需下载模型，也不占 GPU。

```powershell
& D:/git/cellsentry/.runtime/cpm-jev-training/Scripts/python.exe scripts/benchmark-formula-encoder.py --encoder-scripts D:/git/cellsentry/scripts --checkpoint D:/git/cellsentry/benchmark-results/formula-multitask-v7/paired/fp16 --inputs test-cases/jev-formula-v1/v7_test.inputs.jsonl --output benchmark-results/jev-formula-v1/cpu-v7-paired.jsonl
node scripts/formula-benchmark.mjs score test-cases/jev-formula-v1/v7_test.jsonl benchmark-results/jev-formula-v1/cpu-v7-paired.jsonl benchmark-results/jev-formula-v1/cpu-v7-paired-score.json
```

适配器拒绝带 gold 字段的输入，拒绝直接使用字段/辅助任务 checkpoint，不静默截断超长输入。记录实际参数精度、输入/预测/权重/脚本哈希、加载耗时与批量为 1 的 CPU 推理耗时。原 builder 会将 FP16 存储的主干加载为 FP32，故其概率可能与 GPU FP16 结果不同，单独计分。
