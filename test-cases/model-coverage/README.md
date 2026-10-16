# 本地模型三任务覆盖测试

共 500 条合成用例，编号 TC0001–TC0500，按编号串行执行：

当前默认采用不思考/直答模式。启动脚本默认 `-ReasoningMode off`，标准测试也会为支持开关的模型显式发送 `enable_thinking=false`；思考模式历史结果保留作对照。

- 公式复核 180 条：18 类场景 × 真告警/误告警 × 5 个变体。
- PII 160 条：16 类正例、16 类负例，各 5 个变体；覆盖邮箱、中美电话、SSN、身份证、银行卡、IBAN、护照和提示词干扰。
- 提取 160 条：5 类单据 × 6 种布局 × 5 个变体，加 10 条未知文档。布局为横向、纵向、中文、噪声、缺失合计、字段乱序。检查单号/姓名、日期、供应商、合计和来源地址。

## 执行

```powershell
python scripts/model_benchmark.py generate
python -m unittest discover -s scripts -p test_model_benchmark.py
pwsh -NoProfile -File scripts/start_model.ps1
python scripts/model_benchmark.py run
python scripts/analyze_benchmark.py
```

测试直接向本地 llama.cpp 发送模型请求，不经过 Excel 解析、规则引擎或 UI。仓库引用的原版 Python 推理服务缺失；公式提示词遵循现有 TypeScript 协议，PII 与提取显式指定输出字段。此结果只表示这些提示词和合成样本下的模型能力，不代表完整应用测试。

启动脚本需要 PowerShell 7、CUDA 13.4 runtime；自动下载固定版本 llama.cpp b11429 CUDA 二进制并校验压缩包 SHA256。仅监听 127.0.0.1:18765，1024 token 上下文，单槽 GPU 推理，不安装开机启动服务。使用 `pwsh -NoProfile -File scripts/stop_model.ps1` 停止本脚本启动的服务。

`cases.jsonl` 含输入、独立金标准及理由；请求构造只读取 input。`manifest.json` 记录数量、类别和文件哈希。每类的 5 个变体部分共享结构，并非 500 个独立业务场景，也不是穷尽测试。合成标签未经独立人工审核。

敏感信息为合成/公开测试值；负例要求卡号通过 Luhn、身份证通过校验、SSN 范围有效。生产系统仍应配合确定性校验器。

结果位于 `benchmark-results/cellsentry-500/`：原始响应 `responses.jsonl`、运行元数据 `run.json`、汇总 `summary.json`、可浏览详情 `report.html`、中文报告 `report.md` 和 `results.csv`。重跑同目录会续跑已完成编号，不会重新抽样或只保留成功结果。更换模型/用例/提示词应使用新的输出目录。

`analyze_benchmark.py` 要求全部编号按顺序完成，独立复算评分并生成 `diagnostics.json`、`failed-cases.jsonl`、`passed-cases.jsonl`；另外统计忽略地址/规则 ID 等协议字段时的公式真假判断成绩。它不修改原始回答，也不会将错误协议重新算作严格通过。

严格通过要求有效 JSON、完整字段协议、业务答案一致；不自动修复 Markdown 包裹，不把请求错误/截断当成功。PII 比较单元格与类型，提取比较文档类型、全部字段名/值/来源单元格；额外或缺失结果均失败。置信度只检查范围，不评价校准；解释只检查存在，不评价理由质量。报告另列语义和格式成绩。

## MiniCPM5-2B 对照复测

使用官方 `openbmb/MiniCPM5-2B-GGUF` 的 Q4_K_M，SHA256 为 `ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd`。下载脚本走官方 ModelScope 分片下载，按 HF 固定 revision 的哈希校验；不改变现有 cases.jsonl。

```powershell
python scripts/download_minicpm5.py
pwsh -NoProfile -File scripts/start_model.ps1 -Port 18766 -ModelFile models/minicpm5-2b/MiniCPM5-2B-Q4_K_M.gguf -ModelHash ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd -Alias MiniCPM5-2B-Q4_K_M -ServiceName minicpm5 -Jinja
python scripts/model_benchmark.py run --url http://127.0.0.1:18766 --model-file models/minicpm5-2b/MiniCPM5-2B-Q4_K_M.gguf --disable-thinking --output benchmark-results/minicpm5-2b-500
python scripts/analyze_benchmark.py --output benchmark-results/minicpm5-2b-500
python scripts/compare_benchmarks.py
```

关闭原生模板的可选思考，保持相同的 420 token 输出预算、1024 token 上下文、temperature=0、seed=42；模型自己的分词器和模板不同。`run.json` 记录真实已加载的模型路径、文件哈希、模板哈希、模板参数及输入消息哈希。对比脚本检查两轮的用例、消息、采样设置和运行库构建一致，输出到 `benchmark-results/comparison/`。这是直答模式的对照，不表示默认思考模式的能力上限。

停止 MiniCPM 服务：`pwsh -NoProfile -File scripts/stop_model.ps1 -ServiceName minicpm5`。

## 较大思考预算对照

两者均没有原生 `reasoning_effort=high` 档位。MiniCPM 模板支持 `enable_thinking=true`；CellSentry 的 Qwen2.5 模板没有该开关。实验采用共同的额外系统指令，要求检查假设、业务规则和输出协议，在思考后给出原协议 JSON；MiniCPM 同时启用原生思考。不能把 CellSentry 的提示词引导称作原生高思考。

两边均使用 8192 上下文、4096 总生成 token（包含思考和最终答案），思考上限 3072，temperature=1.0、top_p=0.95、min_p=0、seed=42。采样参数参考 MiniCPM 官方思考模式部署说明，并对两边使用相同设置；这是单次固定 seed 测试。CellSentry 模型卡训练上下文只有 1024，扩大推理上下文不代表重新训练。

先停止既有服务，再用 `start_model.ps1` 的 `-ContextSize 8192 -ReasoningMode on -ReasoningFormat deepseek -ReasoningBudget 3072 -Jinja` 启动各模型；端口和模型参数沿用上面的命令。以下两轮按顺序执行：

```powershell
python scripts/model_benchmark.py run --profile deliberate --max-tokens 4096 --temperature 1.0 --top-p 0.95 --min-p 0 --output benchmark-results/cellsentry-deliberate-500
python scripts/model_benchmark.py run --url http://127.0.0.1:18766 --profile deliberate --max-tokens 4096 --temperature 1.0 --top-p 0.95 --min-p 0 --output benchmark-results/minicpm5-deliberate-500
python scripts/analyze_benchmark.py --output benchmark-results/cellsentry-deliberate-500
python scripts/analyze_benchmark.py --output benchmark-results/minicpm5-deliberate-500
python scripts/compare_benchmarks.py --baseline benchmark-results/cellsentry-deliberate-500 --candidate benchmark-results/minicpm5-deliberate-500 --output benchmark-results/comparison-deliberate
```

只对服务返回的最终 `message.content` 评分，不让思考文本污染 JSON；不修复最终答案。`raw_message` 保存完整模型消息，`reasoning_content` 保存服务独立返回的思考文本。报告统计实际返回思考的用例数，避免仅因为设置了参数就宣称模型进行了原生思考。提示词哈希包含共同的分析指令；用例和金标准保持原样。与直答基线相比同时改变了提示词、预算、上下文和采样设置，不能将差异全部归因于思考开关。

补充的“唯一 JSON 片段诊断”仅在最终答案中定位完整、唯一的 JSON 结果，不改内容、不修复 JSON，也不从思考文本挑答案。多个不同候选结果作歧义处理，完全相同的重复 JSON 去重；按任务形状选择候选，不按金标准挑选。它与仅移除 Markdown 围栏的诊断分开列出，两者均不影响原严格评分。大预算对比报告会在模型文件哈希与用例哈希一致时，额外并列本项目已有的原直答配置结果。
