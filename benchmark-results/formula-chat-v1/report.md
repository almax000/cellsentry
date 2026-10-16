# 公式专项训练与本地生成复测

训练只包含公式复核；隐私识别与提取仅做回归。基于官方 MiniCPM5-2B 聊天版重新训练，不加载混合任务适配器。

|测试集|指标|原版|本版|
|---|---|---:|---:|
|coverage500|公式真假判断|84/180|170/180|
|coverage500|fp|85|0|
|coverage500|fn|3|10|
|coverage500|unscorable|8|0|
|coverage500|audit 严格通过|0/180|170/180|
|coverage500|audit 内容正确（仅去外围围栏）|84/180|170/180|
|coverage500|extraction 严格通过|129/160|21/160|
|coverage500|extraction 内容正确（仅去外围围栏）|135/160|122/160|
|coverage500|pii 严格通过|64/160|38/160|
|coverage500|pii 内容正确（仅去外围围栏）|114/160|81/160|
|formula1320|公式真假判断|635/1320|1274/1320|
|formula1320|fp|660|31|
|formula1320|fn|21|15|
|formula1320|unscorable|4|0|
|formula1320|audit 严格通过|70/1320|1274/1320|
|formula1320|audit 内容正确（仅去外围围栏）|635/1320|1274/1320|

专用 Jev business-v3 在同一组原 180 条公式上：93.3%，误报 3、漏报 9。
Jev 与聊天模型的输出机制不同，比较真假判断，不把 JSON 格式修复当作判断能力提升。
公式专项 LoRA 也会改变其他任务的输出。若隐私或提取回归退化，不能将合并后的专项模型直接作为三任务通用模型替换；需保留原版通用路径或验证适配器切换。
明早如专项模型仍明显落后，优先评估 MiniCPM 负责通用任务、专用 Jev 负责公式复核；真实数据误报仍需单独验证。

- Q4_K_M native generation, no thinking, temperature 0, context 1024, max_tokens 420.
- Training validation uses conditional true/false given a gold JSON prefix, not generated-answer accuracy.
- Synthetic splits share generation logic; the original 500 cases are reused regression tests.
- Explanations and confidence are not independently validated or calibrated.
- CPU smoke checks three local CPU requests; no mobile or Electron default deployment has been completed.
- CUDA graphs disabled; runtime restarted every 400 requests and on bounded service faults. Latencies are descriptive.

## 上传数据包公式子集

580 条沿用原标签，仅测试、不训练。固定单元格和规则标识，原公式保留在告警正文；与应用原生结构化公式输入存在差异。这是已使用的开发回归集。

|模型|判断正确|误报|漏报|无法解析|
|---|---:|---:|---:|---:|
|原版 MiniCPM|457/580|107|0|16|
|公式专项 MiniCPM|490/580|41|49|0|
|专用 Jev business-v3|495/580|78|7|0|

专项 MiniCPM 外部严格协议通过为 434/580，69 条输出的单元格或规则标识不匹配；490/580 仅表示真假判断正确。不能用判断指标代替应用协议可用率。

该子集包含 469 条真实错误、111 条正常告警。专项 MiniCPM 的正常样本误报率为 36.9%，真实错误召回率为 89.6%；Jev 分别为 70.3%、98.5%。Jev 多判对 5 条，但误报明显更多；尚不能仅凭总准确率认定必须新增专用 Jev。当前两个模型均未达到可直接自动处置真实工作簿的证据标准。

后续应保留原版 MiniCPM 的隐私与提取路径，将公式专项作为独立适配路径验证。若业务优先减少漏报，可评估专用 Jev；若优先消除规则误报，专项 MiniCPM 当前更符合该方向，但仍需降低漏报并修复协议标识。适配器按任务切换尚未完成验证，手机端内存与延迟也未实测。
