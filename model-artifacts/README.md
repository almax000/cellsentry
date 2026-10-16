# 训练权重下载

已完成三轮的最佳 LoRA 与独立判断头作为本私有仓库的 [Release 附件](https://github.com/yourblacksky/cellsentry-formula-review/releases/tag/formula-jev-adapters-20261015) 保存。完整约 9 GB 的底座和 tokenizer 不包含在附件内。ZIP 的大小与 SHA256 见 [manifest.json](manifest.json)。

|附件|用途|最佳训练步数|
|---|---|---:|
|formula-jev-pilot-v1-best.zip|首轮试训对照|100|
|formula-jev-full-v1-best.zip|第二轮最佳版本|350|
|formula-jev-focus-v2b-best.zip|中文专项研究；挑战集退化，不建议作为默认替换|100|

上表三轮保留在原 Release 中。业务 v3 另存为下面的独立 Release。只归档完整结束并通过独立进程重载验证的版本，不打包中止试跑或 last 检查点。

每份 ZIP 含约 48 MiB 的 `adapter_model.safetensors`、约 8 KiB 的 `decision_head.safetensors`、PEFT 配置、加载说明、Apache-2.0 LICENSE、来源 NOTICE 和文件哈希。LoRA 与判断头必须同时加载；当前模型不生成文本。

打包时保持张量文件原样，只把复制出的配置中本地底座路径改成 `link921/CPM-jev`，并固定 revision `b17a85f115016ea74513f5cd9c7e4350e45a47a1`。不修改本机原 checkpoint。分词器应使用同一 revision 的底座版本。

在仓库根目录运行 `python scripts/download_cpm_jev.py` 取得固定底座，再解压所选 ZIP，并使用兼容的训练环境运行：

```powershell
python scripts/predict_formula_jev.py --checkpoint <解压目录> --case-id TC0001
```

加载脚本显式使用 `models/cpm-jev` 的 4bit NF4 骨干、候选文本格式、最后一个非 padding token 与独立标量头。不能直接作为之前的 GGUF 聊天模型加载；不要重复应用上游已经合并的 LoRA。

各版本准确率与限制见对应 `benchmark-results/<版本>/`。合成评测高分不代表实际工作簿能力，概率未经校准。使用前应按目标业务独立验证。

## 业务复核 v3 研究归档

[Release：formula-jev-business-v3-20261015](https://github.com/yourblacksky/cellsentry-formula-review/releases/tag/formula-jev-business-v3-20261015) 保存 `formula-jev-business-v3-best.zip`，约 46.4 MiB。与上表旧附件不同，v3 包还包含 tokenizer、完整训练摘要、前后结果和独立重载校验记录；完整底座不包含在内。包的精确大小、SHA256、所有文件哈希与配置可移植化记录见 [business-v3-manifest.json](business-v3-manifest.json)。

本轮从小迭代 focus-v2b/best 继续，完成 690 步，最佳为 step 400。上传包保存续训后的完整 LoRA 与决策头，直接搭配固定底座加载即可。张量文件与本机已验证 best 字节一致。

外部全部审计准确率 65.7% → 69.4%，公式子集仅 85.2% → 85.3%，公式误报 75 → 78，未证明公式误报复核提升。该包为研究归档，尚未接入应用，不建议自动替换现有版本。完整结果见 [v3 结果](../benchmark-results/formula-jev-business-v3/overview.md)。

## MiniCPM 聊天版公式专项 v1

[私有 Release：formula-chat-v1-20261016](https://github.com/yourblacksky/cellsentry-formula-review/releases/tag/formula-chat-v1-20261016) 包含可独立加载的 Q4_K_M GGUF（约 1.56 GB）和可继续训练的 LoRA ZIP。文件大小、SHA256、固定官方底座版本见 [formula-chat-v1-manifest.json](formula-chat-v1-manifest.json)。LoRA 基于官方 `openbmb/MiniCPM5-2B` 聊天版，不能当作 CPM-jev 判断头适配器加载。

本轮仅训练公式复核，不思考。合成 1,320 条判断 96.5%，上传数据包公式 580 条判断 84.5%；后者误报 41、漏报 49，协议严格通过 434/580。PII/提取回归退化，不能直接替换通用模型。完整对照与限制见 [公式专项报告](../benchmark-results/formula-chat-v1/report.md)。权重为研究归档，尚未完成手机端或默认应用集成。

## 公式撤销可靠性 v2

[私有 Release：formula-cancellation-v2-20261016](https://github.com/yourblacksky/cellsentry-formula-review/releases/tag/formula-cancellation-v2-20261016) 保存独立 Q4_K_M GGUF（约1.56 GB）和完整续训 LoRA ZIP（约49 MB）。精确大小、SHA256与底座版本见 [formula-cancellation-v2-manifest.json](formula-cancellation-v2-manifest.json)。v2 从 v1 继续训练，ZIP 已包含完整选定 LoRA 张量，直接搭配固定官方聊天版底座加载，不要重复叠加 v1。

仅训练公式，隐私与提取只做回归。外部580条原始撤销正确率58.8%→75.6%，误撤49→21；验证门槛后77.3%（58/75），仍误撤17条，未达到95%的可靠撤销目标。模型保留为研究候选，不替换应用默认模型，不自动撤销告警。[完整报告](../benchmark-results/formula-cancellation-v2/report.md) 与 [验收记录](../benchmark-results/formula-cancellation-v2/acceptance.json)。
