# 分段提取 mmBERT v1

独立编码器，从 `jhu-clsp/mmBERT-base` 初始化，未复用公式或 PII 微调权重。

输入格式固定为：

```text
提取目标：{target}
当前段：{segment}
```

二分类 `discard / keep`，masked mean pooling + FP32 线性头。分段由调用方提供；命中后保留完整原文、顺序和来源，不生成字段、不提取子字符串。最大 512 token，超限显式报错，不截断。

语料是本地规则生成的八类业务记录。训练 1600 文档 / 41600 对；开发 160 / 4160 对；测试 320 / 8320 对。每段搭配多个目标，包含同段正负配对、无命中目标、索引、历史、撤销、示例与待确认记录。不同 split 的文档、数值与外层呈现模板不重叠，但事实句式和目标改写共享。因此不能视为真实泛化验证。

训练 1000 步，micro batch 4、累积 4，共使用 16000 个样本抽取（不足一个完整 epoch）。验证集选 checkpoint 和阈值，测试不参与选择。额外 192 对手写诊断数据存于 `test-cases/segment-extraction-v1`，不训练、不调参，亦非第三方盲测。既有 64 份 PII 测试数据完全未使用。

复现（Python 仅用于离线训练与评测，不进入产品依赖）：

```powershell
python scripts/prepare_segment_extraction.py
python scripts/prepare_segment_challenge.py
python scripts/test_segment_extraction.py
python scripts/train_segment_mmbert.py --base <本地mmBERT-base目录> --eval-every 200
python scripts/predict_segment_mmbert.py --input test-cases/segment-extraction-v1/manual-challenge.inputs.jsonl --output benchmark-results/segment-extraction-mmbert-v1/manual-challenge-predictions.jsonl
python scripts/benchmark_segment_extraction.py
```

重复训练必须通过 `--output` 指定新目录，避免覆盖已完成的结果。底座目录需包含校验用 `source-manifest.json`，格式与原有训练流程一致。当前实验环境 Torch 2.14.1+cu130 / Transformers 5.19.0 / RTX 5060 Ti；完整来源、参数、校验和与选择记录见 run-request.json、summary.json。

预测输入 JSONL 至少包含 `id`、`target`、`segment`；可附 `group_id`、`position`、`source`。输出逐段 `keep/discard/error`；keep 的 `text` 与输入 segment 完全一致。调用方按输入顺序保留 keep 段，error 应进入人工处理或重试，不能当作 discard。

本轮不接入现有字段提取 UI、不覆盖现有模型、不发布 TestFlight，也未转换 GGUF。后续应先用独立真实脱敏数据验证，再走现有 llama.cpp 导出与量化流程。
