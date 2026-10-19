# 独立 PII mmBERT v1：训练及多模型盲测

**结论：模型已训练并可在本机独立加载，但这版不适合接入产品自动打码。原冻结集分数明显高于多模型盲测；同候选的规则对照还优于模型。没有针对盲题继续调参或训练，也没有修改公式模型。**

## 固定权重后的对比

| 数据集 | 方法 | 严格精确率 | 严格召回率 | 严格 F1 |
|---|---|---:|---:|---:|
| standard | original_rules | 78.82% | 47.86% | 59.56% |
| standard | same_candidate_rules | 99.97% | 100.00% | 99.99% |
| standard | mmbert | 97.46% | 89.08% | 93.08% |
| blind | original_rules | 86.02% | 24.77% | 38.46% |
| blind | same_candidate_rules | 85.23% | 39.32% | 53.81% |
| blind | mmbert | 40.68% | 37.15% | 38.83% |

| 类型 | 原冻结集 P / R | 盲测 P / R |
|---|---:|---:|
| name | 100.00% / 100.00% | 20.29% / 28.28% |
| phone | 100.00% / 100.00% | 68.25% / 54.43% |
| national_id | 86.00% / 99.79% | 39.19% / 82.86% |
| social_security | 100.00% / 70.63% | — / 0.00% |
| bank_card | 100.00% / 100.00% | — / 0.00% |
| email | 100.00% / 100.00% | 100.00% / 64.52% |
| address | 100.00% / 53.13% | — / 0.00% |

`original_rules` 是 #1 的旧 regex/validator 组件；`same_candidate_rules` 使用和模型相同的候选生成器，再按字段/号码规则判定，用于区分候选扩展与模型判定的贡献。模型在 standard 上相对旧规则的提升不能全部归因于 mmBERT。

盲测的候选精确边界召回 58.20%，完整覆盖召回 66.56%；在已有精确候选时的判定召回 63.83%。整体严格召回 37.15%，说明候选定位和上下文判定都存在缺口。

盲测文档标识残留率 71.88%，结构化标识残留率 34.38%，易混背景跨度误报率 23.11%。纯阴性文档误报率 0.00% 不能掩盖阳性文档中的 175 次多余/类型或边界错误。

盲测有 1 条候选超过 512 token，被明确记为推理失败/待复核，没有静默截断或移除文档；因此其漏报仍计入分数。所有候选均按需人工复核统计，没有把未校准概率用于自动通过。

## 多模型挑战集

通过用户指定的 ARK Plan 接口调用豆包、DeepSeek、GLM，按预先配置的 12 个角度生成 108 份草案。不同模型独立重标，最终 64 份 / 323 个正例 / 264 个阴性跨度通过；44 份隔离或生成/格式失败（隔离记录 40 条，其中失败批次一条代表3份）。

生成器通过数：doubao-seed-2.1-lite: 24；deepseek-v4.1-flash: 19；glm-5.3: 21。账本 79 次 API 请求、139356 tokens（不含账本外的连通性诊断，token 数不等于套餐计费金额）。

没有把仓库文档、冻结题库或真实个人资料发给生成模型，只发送虚构测试任务说明。首次固定权重评测前未向 Codex 展示挑战集原文；后续按用户要求进行的评测后抽样审核见 [audit.md](audit.md)。原始回复、分歧与规范文本留在 .runtime/pii-ark-blind-v1/，不进 git，仓库只保存配置、脚本、哈希和汇总。已查看成绩后，该套挑战集后续只能作回归；下一轮调参后应另建新的盲测集。

正例值与训练集完全相同的跨度数量：0。两模型一致不等于专家金标准；隔离分歧会产生选择偏差，有限合成数据不能代替真实医疗档案验证。

| 生成模型 | 文档 | 模型严格 F1 | 候选精确召回 |
|---|---:|---:|---:|
| doubao-seed-2.1-lite | 24 | 38.41% | 51.22% |
| deepseek-v4.1-flash | 19 | 38.13% | 69.35% |
| glm-5.3 | 21 | 40.00% | 51.28% |

| 角度 | 通过文档 | 模型严格 F1 |
|---|---:|---:|
| medical_front | 8 | 45.36% |
| family_contacts | 7 | 46.73% |
| discharge_prose | 6 | 37.50% |
| ocr_noise | 3 | 44.00% |
| role_counterfactual | 1 | 0.00% |
| number_confusables | 6 | 36.73% |
| address_variants | 5 | 42.86% |
| negation_history | 4 | 31.58% |
| negative_only | 9 | — |
| mixed_language | 6 | 30.00% |
| injection_literal | 6 | 30.19% |
| sparse_layout | 3 | 38.30% |

## 训练、验证与部署边界

原始底座 jhu-clsp/mmBERT-base@c5955035435e2bf121cde7f3c8863ef52ff35d82（本地模型卡 MIT），306,945,800 个可训练参数，新增8类判定头。独立合成训练720份、15,767候选；train正例值与原冻结dev/test无交叉。全量微调600步、有效batch16、种子42，Adafactor，BF16 autocast/FP32参数，RTX 5060 Ti。

只按开发集严格F1、再按精确率选权重和阈值；选中 step 600，dev F1 95.73%，阈值 0.5。训练耗时 420.2 秒。独立进程重载的6,634条原测试候选概率逐条完全一致，判定翻转0。

本轮是本地 Jev-style 的 mmBERT PII 判定实验，没有调用 Jev 云端接口，也没有完成 #2 原定的 Julia-1 / token 分类模型对照。Mac每千候选耗时、峰值内存及 iPhone 验证均未完成；保存的是实验 safetensors checkpoint，未转换 GGUF，未替换 App，不能称为手机可用模型。

下一步建议：保留现有模型作为基线；使用独立训练/开发资料提升自由文本、混合单元格与 OCR 场景的候选定位，并增加非模板化的角色判定训练。重新评估是否需要 token 级候选定位头。避免把这64份盲题拿去训练，或不断改规则刷这套分数。

## 复现

```powershell
node scripts/prepare-pii-mmbert.mjs .runtime/pii-training-repro
& D:/git/cellsentry/.runtime/cpm-jev-training/Scripts/python.exe scripts/train_pii_mmbert.py --output .runtime/pii-training-repro-run --steps 600 --batch 4 --accumulation 4
wsl --exec python3 /mnt/d/git/cellsentry-dev/scripts/generate_ark_pii_challenge.py --key-file /tmp/ark.txt --config /mnt/d/git/cellsentry-dev/configs/pii-ark-challenge-v1.json --output /mnt/d/git/cellsentry-dev/.runtime/pii-ark-blind-v2 --workers 3
```

训练与数据生成目录拒绝覆盖完成的运行；key只在WSL进程内读取，没有复制到仓库。生成不是严格确定性的，复现原盲集须使用本机缓存与已登记哈希。训练环境是现有离线实验环境，不是 App 的 Python 依赖。
