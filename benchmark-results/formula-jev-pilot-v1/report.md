# CPM-jev 公式复核试训

方法：NF4 QLoRA rank8 alpha16 + trainable scalar decision head。优化器更新 100 步，实际使用 400 条训练样本；最佳验证 checkpoint 为 step 100。

|数据集|数量|微调前准确率|微调后准确率|变化|
|---|---:|---:|---:|---:|
|validation|180|58.9%|80.6%|+21.7 个百分点|
|test|360|62.2%|82.8%|+20.6 个百分点|
|benchmark|180|67.2%|83.9%|+16.7 个百分点|

|数据集|微调前误报 / 漏报|微调后误报 / 漏报|
|---|---:|---:|
|validation|52 / 22|23 / 12|
|test|49 / 87|33 / 29|
|benchmark|29 / 30|12 / 17|

成对准确率要求同一业务规格下的正确和错误两条公式都判对：
- validation：17.8% → 61.1%（90 对）。
- test：27.8% → 65.6%（180 对）。

标签由程序可计算规则产生，没有使用 CellSentry 或 MiniCPM 的回答当金标准。原有 180 个公式用例只用于评测，没有用于训练或选择 checkpoint。
训练、验证、合成测试按反事实样本组及呈现模板隔离，业务类别共享；模板隔离不等于完全语义独立。当前是英文合成数据试验，未经过独立人工审核，不代表真实 Excel 配置上的准确率。
模型不生成文本：对两个明确候选打分，应用代码绑定原始单元格和规则 ID；不能将协议通过数与之前聊天模型生成 JSON 的严格通过数直接比较。这里比较的是同一 4bit CPM-jev 微调前后的二分类判断。
checkpoint 只按 validation 准确率、再按 NLL 选择；test 和原 180 benchmark 没有参与模型选择。报告同时保存原始概率和混淆矩阵；概率尚未校准，不应将高概率等同于已验证的可靠性。
GPU 峰值显存 2.45 GiB；训练和评测耗时 381.6 秒。
基础权重 revision：b17a85f115016ea74513f5cd9c7e4350e45a47a1；适配器和决策头位于：D:\git\cellsentry\benchmark-results\formula-jev-pilot-v1\best。

独立进程重载校验通过：TC0001 判断一致，错误概率绝对差 0.0000334。best 目录共约 57.4 MiB（包括 tokenizer）；文件哈希见 checkpoint-manifest.json。原 benchmark 中 date_order、lookup_column、lookup_exact、relative_reference 各为 5/10，仍需补充样本。适配器尚未接入应用。
