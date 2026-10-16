# 中文查找列与求和范围专项试验

本轮从 `formula-jev-full-v1/best` 继续训练。600 条新增合成样本中约 74.7% 为中文，其余为混合中英；另回放旧训练池中的 576 条样本（18 类，每类 16 对），共 1176 条。候选问题与答案选项保持原格式，新增业务上下文使用中文。

新增内容覆盖起始列变化、双字母列、跨表与绝对引用、VLOOKUP 列越界、零列号、范围内取错字段，以及求和漏首项、漏末项、漏中间项和多算结转。单元格金额与来源工作表均显式说明。标签由受限公式解析及数值规则核算。

|数据集|数量|用途|
|---|---:|---|
|train|1176|600 条新专项 + 576 条旧训练回放|
|validation|280|100 条新中文 + 180 条旧验证，只用于选择 checkpoint|
|test|560|200 条新中文 + 360 条旧合成回归|
|challenge|100|新列区间；求和使用训练没有出现过的横向结构|
|benchmark|180|原公式回归，内容不变，顺序重排|
|public_test|42|从 3 份公开工作簿派生的受控注错测试，永不训练|

新增合成训练、验证、测试及挑战分别使用不重叠的起始列区间、分组和呈现方式，但仍共享生成逻辑，不能视为完全独立的业务分布。公开来源与训练没有交叉。重复使用的旧测试只能解释为回归评测。

## 公开工作簿的标签范围

从明确列出的政府公开页面下载 8 份 XLSX，共提取 53 条原始公式。原文件保存在 `.runtime/public-workbooks/`，不修改。原始公式的业务正确性未知，全部保留 `label=null`，不作为训练金标准。

42 条派生题来自 3 份工作簿，正反各 21 条。求和题仅保留能由数值前置单元格复算且与源缓存差异不超过 0.02 的原公式；据此明确本题的汇总契约，再注入遗漏或重复，要求差异实际改变数值。查找题依据真实科目编码、表头和数值构造新的 VLOOKUP，检查返回字段及列越界。本次没有发现原文件自带的 VLOOKUP，不能称作真实查找公式错误集。

这些题验证的是“真实表格上下文 + 明示契约 + 受控错误”，不是专家确认的原业务错误。多个题来自同一工作簿，不是 42 个独立业务场景。来源、下载失败、文件 SHA256 和完整原公式见 [公开数据索引](../../public-data/formula-review-20261015/README.md)。

## 复现

```powershell
python scripts/generate_formula_focus.py
# 此两步使用包含 openpyxl 的 bundled Python 3.12；只读解析源文件，不写工作簿。
python scripts/collect_public_workbooks.py
python scripts/build_public_formula_eval.py
python -m unittest discover -s scripts -p 'test_*.py'
python scripts/train_formula_jev.py --data training-data/formula-review-v2 --init-checkpoint benchmark-results/formula-jev-full-v1/best --steps 294 --eval-every 50 --learning-rate 0.00003 --micro-batch 4 --accumulation 1 --output benchmark-results/formula-jev-focus-v2b
```

1176 条训练样本刚好对应 294 步，实际 batch 为 4。选择 checkpoint 只看混合 validation，公开数据及测试不参与选择。`before` 指上一轮已训练的模型，不是未微调底座。需要上一轮适配器，可从 [私有 Release](../../model-artifacts/README.md) 获取；完整底座仍需单独下载。

`formula-jev-focus-v2` 为跨表上下文修正前提前终止的试跑，不是完成结果；以 `formula-jev-focus-v2b` 为本轮正式目录。没有把另一个会话正在测试的外部压缩包用于本轮训练。

## 本轮结果

294 步已完成，1176 条训练样本各使用一次。只按 validation 选中了 step 100；表中“前”指 full-v1/best。18 项检查通过。

|独立统计组|数量|本轮前|本轮后|
|---|---:|---:|---:|
|新中文专项|200|71.0%|75.5%|
|旧合成回归|360|99.2%|98.9%|
|原公式回归|180|92.2%|92.2%|
|新列及横向结构挑战|100|72.0%|69.0%|
|公开工作簿受控派生|42|47.6%（20/42）|52.4%（22/42）|

公开派生题误报从 18 升至 20、漏报从 4 降至 0：新模型几乎一律判错（41/42），与“总判有错”基线 50% 非常接近。不能把 52.4% 解读为可靠改进。挑战集也退化，因此本轮不建议替换旧版；保留产物用于后续分析，不部署。

详细分组和逐条概率见 `benchmark-results/formula-jev-focus-v2b/overview.md` 与 `stratified.json`。现阶段仍需要对公开原始公式进行独立业务标注，再讨论真实业务能力的提升；重复堆同模板样本不够。
