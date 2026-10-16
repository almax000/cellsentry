# 公式复核 Jev-style 试验数据

这是一次英文合成数据的小规模二分类试验。基础模型为社区 `link921/CPM-jev`，固定 revision `b17a85f115016ea74513f5cd9c7e4350e45a47a1`。用 4bit NF4 加载其已合并骨干，再训练新的 rank-8 LoRA 和原有标量决策头；不会重复加载原作者已经合并的旧 LoRA。不生成解释文本，也没有调用教师模型生成标签。

|文件|数量|用途|
|---|---:|---|
|train.jsonl|1800|候选训练池，18 类各 100 条|
|validation.jsonl|180|只用于选择 checkpoint|
|test.jsonl|360|单独呈现模板的合成测试|
|benchmark.jsonl|180|原有公式用例转换成候选决策格式，永不训练|

标签为真实错误或误报，各占一半。`state`、`question`、`options` 是输入；`label`、`is_error`、`oracle` 等字段仅供训练监督和审计，不会输入模型。每个业务规格生成一对正确/错误样本，候选项顺序打乱。生成器附有程序可计算的标签依据，并检查重复样本、成对样本分组和标签平衡。

train 使用 structured/ledger 呈现，validation 使用 table，test 使用 memo。输入呈现模板及成对样本组隔离，业务类别仍共享：这不是完全独立语义分布或真实工作簿数据。18 个类别与旧测试共有，原 180 条内容只用于最终评测。数据未经独立人工审核；首轮仅为英文，原测试中的中文注释仍保留。

## 执行

使用 Python 3.12 隔离环境 `.runtime/cpm-jev-training`，安装 CUDA 13.0 PyTorch、Transformers >=5.17、PEFT、bitsandbytes、accelerate 和 safetensors。PyTorch 安装包通过官方 SHA256 校验。模型所有大权重通过 HF LFS SHA256 校验。版本在训练 summary.json 中记录。

```powershell
python scripts/generate_formula_training.py
python -m unittest discover -s scripts -p test_formula_training_data.py
python scripts/download_cpm_jev.py
pwsh -NoProfile -File scripts/stop_model.ps1
pwsh -NoProfile -File scripts/stop_model.ps1 -ServiceName minicpm5
& .runtime/cpm-jev-training/Scripts/python.exe scripts/train_formula_jev.py --steps 100
& .runtime/cpm-jev-training/Scripts/python.exe scripts/predict_formula_jev.py --case-id TC0001
```

首轮 100 次优化器更新、每次累积 4 个样本，共实际使用 400 条打乱的训练样本，不会声称完整训练了 1800 条。只按 validation 的准确率、其次按 NLL 选择最佳 checkpoint；baseline 也参与候选，若没有改善，best_step 可以是 0。test 与原有 180 benchmark 不用于选 checkpoint。概率是未经公式任务校准的 raw softmax。

结果、训练日志、微调前后逐条概率、best/last 适配器和决策头位于 `benchmark-results/formula-jev-pilot-v1/`。基础权重位于 `models/cpm-jev/`。适配器必须配合同一基础骨干与候选格式加载，不能直接当成之前的 GGUF 聊天模型使用。这里比较的是同一个 4bit 决策模型前后二分类成绩，不能直接与此前聊天模型 JSON 协议通过率混为一谈。

## 2026-10-15 首轮结果

实际完成 100 步，使用 400 个不同训练样本。按验证集选择的最佳版本为 step 100，训练与评测合计 381.6 秒，PyTorch 峰值显存 2.45 GiB。best 目录含 LoRA、标量决策头与 tokenizer，共约 57.4 MiB。

|评测集|微调前准确率|微调后准确率|微调前误报 / 漏报|微调后误报 / 漏报|
|---|---:|---:|---:|---:|
|validation，180 条|58.9%|80.6%|52 / 22|23 / 12|
|test，360 条|62.2%|82.8%|49 / 87|33 / 29|
|原 benchmark，180 条|67.2%|83.9%|29 / 30|12 / 17|

合成测试的成对准确率从 27.8% 升到 65.6%。原 benchmark 的日期顺序、查找列、查找精确匹配和相对引用类别均为 5/10，百分比为 6/10，仍需重点补数据。单类别样本很少，不能据此估计真实工作簿准确率。

新进程重载 best 后，对 TC0001 的判断与训练进程一致，错误概率差为 0.0000334；核对记录保存在结果目录的 `reload-verification.json`。现有两个 GGUF 聊天服务恢复为不思考模式，新适配器尚未接入应用。

## 第二轮：完整训练池与较长学习率计划

执行 `scripts/train_formula_jev.py --steps 450 --eval-every 50 --output benchmark-results/formula-jev-full-v1`，从同一底座重新训练。训练数据及 seed 不变，100 步余弦学习率计划延长至 450 步，因此不能将变化单独归因于数据量。

本轮 450 步实际使用全部 1800 条不同样本，每条一次。只按 validation 选择 step 350 为 best（该检查点看过前 1400 条训练样本）；最后一步为 last。训练与全部评测约 21.1 分钟，峰值显存仍为 2.45 GiB。

|评测|首轮最佳|第二轮最佳|
|---|---:|---:|
|validation，180 条|80.6%|100.0%|
|test，360 条|82.8%|99.2%|
|原 benchmark，180 条|83.9%|92.2%|
|test 成对准确率|65.6%|98.3%|

第二轮 test 误报 / 漏报为 2 / 1，原 benchmark 为 4 / 10。原 benchmark 剩余错误为 lookup_column 5 条、sum_range 4 条、lookup_exact 2 条，broken_reference、percent_scale、relative_reference 各 1 条。

这些 test 和原 benchmark 已重复使用，只能作为回归评测，不能声称新的独立盲测。不同输入模板仍共享业务类别和生成逻辑；真实工作簿及中文输入还需要独立验证。新产物位于 `benchmark-results/formula-jev-full-v1/best`，未接入应用，第一轮产物保留。

运行对照脚本：`python scripts/compare_formula_training.py benchmark-results/formula-jev-pilot-v1 benchmark-results/formula-jev-full-v1 --output benchmark-results/formula-jev-full-v1/comparison.md`。
