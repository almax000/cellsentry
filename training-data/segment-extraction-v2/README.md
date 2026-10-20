# 分段提取条件扩充 v2

保持独立 mmBERT 编码器及“目标＋当前段 → 保留/丢弃”的整段提取方式。

新增 800 个训练文档，对每段构造 10 类目标：本期、历史、全部时期、严格大于/小于、不少于/不超过、包含端点的区间、撤销记录、计划事项。每个文档有 12 段，包含真实本期、真实历史、撤销、计划、示例、无关主题和只有栏目名称没有数据的条目。对数值条件同时使用远离阈值和邻近阈值的记录，并覆盖等于阈值、等于区间上界。

训练池 106456 对，含原 v1 **训练集**的 400 文档回放；开发集 11624 对，含原 v1 **开发集**的 80 文档。原 v1 测试集和 192 对诊断集完全不进入 train/dev，作为已知回归集保留。新测试 160 文档 / 19200 对，在本轮训练前冻结。

新数据文档、事实表述和外层模板按 split 隔离；数值从同一分布抽样，可能重叠。条件句法仍共享，全部是本地生成数据，不能代替独立真实文件评测。

从原始 `jhu-clsp/mmBERT-base` 重新训练 2000 步，批量 4、累积 4，共 32000 次样本抽取，少于一个完整训练池遍历。按开发集 11 个 scope（含旧数据回放）的宏平均 F1 选最佳 checkpoint 和统一阈值，避免当前记录样本掩盖复杂目标错误。分类头、masked mean pooling、512 token 上限不变，推理未添加数值规则。

为控制仓库体积，冻结 JSONL 以 gzip 版本保存，未压缩文件忽略。克隆后恢复并校验：

```powershell
python scripts/archive_segment_dataset.py --restore
python scripts/test_segment_extraction_v2.py
python scripts/train_segment_mmbert_v2.py --eval-every 400 --base <本地mmBERT-base目录>
```

恢复所用原始文件 SHA256 来自 manifest.json；archives-manifest.json 另外保存压缩文件摘要。不要对已有冻结集重新生成；若开发新语料版本，应使用新目录和新的测试集。

训练完成后，对照脚本需要 v1 新测试预测、v2 的旧测试与诊断预测：

```powershell
python scripts/predict_segment_mmbert_batch.py --run benchmark-results/segment-extraction-mmbert-v1 --input training-data/segment-extraction-v2/test.inputs.jsonl --output benchmark-results/segment-extraction-mmbert-v2/baseline-v1-newtest.jsonl
python scripts/predict_segment_mmbert_batch.py --run benchmark-results/segment-extraction-mmbert-v2 --input training-data/segment-extraction-v1/test.inputs.jsonl --output benchmark-results/segment-extraction-mmbert-v2/regression-v1-test-predictions.jsonl
python scripts/predict_segment_mmbert_batch.py --run benchmark-results/segment-extraction-mmbert-v2 --input test-cases/segment-extraction-v1/manual-challenge.inputs.jsonl --output benchmark-results/segment-extraction-mmbert-v2/regression-manual-predictions.jsonl
python scripts/benchmark_segment_extraction_v2.py
```

结果见 benchmark-results/segment-extraction-mmbert-v2/README.md。Python 仅用于离线训练/评测，产品没有新增 Python 依赖。本轮不上传权重、不转换 GGUF、不覆盖现有 App。
