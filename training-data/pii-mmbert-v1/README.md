# 独立 PII mmBERT 训练数据 v1

720 份本机脚本合成医疗资料、15,767 条候选决策样本，种子730113。8类固定任务为 background + name/phone/national_id/social_security/bank_card/email/address；不是通用任意选项决策模型。7,367 条背景、七类正例各1,200条。训练资料覆盖表单、三行表格与自由文本，背景包含医生、机构、物流号、教学证件、测试卡及药品等。

使用原始 jhu-clsp/mmBERT-base 初始化独立分类头，不使用公式模型的权重或任务头。输入包含固定问题和选项、候选值、字段/列样例及附近原文；label 仅作为损失目标。带 label 的 train/dev/test 文件仅供监督/审计；`*.inputs.jsonl` 不含 label，最终推理必须使用该文件。

dev/test 完全沿用 #1 已冻结的120/360份文档，仅通过共享候选生成器投影为决策输入，不改原文、标签、实体位置及哈希。train正例值与原dev/test无交叉；常见词汇、字段本体和有限合成风格仍有共性，不能把其高分当作真实医疗泛化能力。训练的姓名尾字、出生年份、号码范围与原dev/test分开，可能形成额外分布偏差。

`manifest.json` 固定数据哈希、类别顺序、问题/选项、来源代码和选模规则。只按dev严格跨度F1、再按精确率选模型；阈值只试预先固定的0.5/0.7/0.85/0.95。训练600步后固定权重与阈值，再运行原test和多模型盲测，未按盲测表现继续训练。

多模型挑战集来自用户授权的 ARK Plan API，不参与训练/开发。它在 `.runtime/pii-ark-blind-v1/` 本地隔离，原始病例和分歧不进入当前对话或git；仓库只保存生成脚本/配置、哈希与汇总。两模型一致不等于人工金标准，排除分歧会引入偏差。已查看汇总后，下一轮优化须另建新盲集。

生成：`node scripts/prepare-pii-mmbert.mjs <new-directory>`；已有manifest拒绝覆盖。训练和推理使用隔壁已有Python实验环境，不增加App的Python运行依赖。权重仍是实验safetensors，未导出GGUF、未部署手机。

结果见 `benchmark-results/pii-mmbert-v1/report.md`。本轮盲测不达标，保留实验模型而不接入自动打码。
