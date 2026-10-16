# CPM-jev 公式复核试训

方法：NF4 QLoRA rank8 alpha16 + trainable scalar decision head。优化器更新 690 步，实际使用 5520 条训练样本；最佳验证 checkpoint 为 step 400。

|数据集|数量|微调前准确率|微调后准确率|变化|
|---|---:|---:|---:|---:|
|validation|480|73.1%|84.4%|+11.3 个百分点|
|test|960|74.4%|80.6%|+6.2 个百分点|
|benchmark|180|91.1%|93.3%|+2.2 个百分点|
|challenge|240|60.4%|69.2%|+8.8 个百分点|
|old_synthetic|360|98.9%|97.2%|-1.7 个百分点|
|focus_challenge|100|70.0%|71.0%|+1.0 个百分点|
|public_test|42|52.4%|54.8%|+2.4 个百分点|
|external_archive|1217|65.7%|69.4%|+3.6 个百分点|

|数据集|微调前误报 / 漏报|微调后误报 / 漏报|
|---|---:|---:|
|validation|56 / 73|21 / 54|
|test|151 / 95|104 / 82|
|benchmark|9 / 7|3 / 9|
|challenge|61 / 34|34 / 40|
|old_synthetic|2 / 2|7 / 3|
|focus_challenge|13 / 17|12 / 17|
|public_test|20 / 0|17 / 2|
|external_archive|332 / 85|271 / 102|

成对准确率要求同一业务规格下的正确和错误两条公式都判对：
- validation：47.9% → 70.4%（240 对）。
- test：52.7% → 62.9%（480 对）。

标签由程序可计算规则产生，没有使用 CellSentry 或 MiniCPM 的回答当金标准。原有 180 个公式用例只用于评测，没有用于训练或选择 checkpoint。
训练、验证、合成测试按反事实样本组及呈现模板隔离，业务类别共享；模板隔离不等于完全语义独立。数据语言与来源见数据集 manifest；程序生成标签未经过独立人工业务审核，不代表真实 Excel 配置上的准确率。
模型不生成文本：对两个明确候选打分，应用代码绑定原始单元格和规则 ID；不能将协议通过数与之前聊天模型生成 JSON 的严格通过数直接比较。这里比较的是同一 4bit CPM-jev 微调前后的二分类判断。
checkpoint 只按 validation 准确率、再按 NLL 选择；test 和原 180 benchmark 没有参与模型选择。报告同时保存原始概率和混淆矩阵；概率尚未校准，不应将高概率等同于已验证的可靠性。
GPU 峰值显存 4.88 GiB；训练和评测耗时 2417.3 秒。
基础权重 revision：b17a85f115016ea74513f5cd9c7e4350e45a47a1；适配器和决策头位于：benchmark-results\formula-jev-business-v3\best。

本轮起点为已有适配器 benchmark-results\formula-jev-focus-v2b\best，表中微调前成绩指该适配器，不是未训练底座。

public_test 是公开工作簿派生的受控注错测试：原始来源未用于训练，标签只对应明示的算术或查找契约，不代表公开文件的原始业务公式已经独立人工确认。
