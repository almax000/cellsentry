# ADR-0004：三项功能都保留，另两项保持现状

- **Status**: Accepted
- **Date**: 2026-10-18
- **Deciders**: jojo
- **Drafted by**: Claude Code · Opus 5.5（从 PRD 和当天的问答迁入）
- **Supersedes**: —
- **Superseded by**: —
- **Legacy ID**: PRD D3
- **Related**: [PRD §3](../../.claude/product/PRD-v0-local-pii.md)、[保留集结果](../evaluation/2026-10-17-workbook-holdout-results.md)、[ADR-0007](0007-own-task-models-on-own-cdn.md)

## 背景

- CellSentry v1 是三合一工具箱：公式审计、PII 脱敏、数据提取。[ADR-0002](0002-position-personal-medical-records.md) 把 PII 定为这一版的主打。
- 公式审计的 AI 复核用 Black Sky 的 v2 模型（MiniCPM5-2B，1.56 GB）。2026-10-17 的保留集测试里，v2 在我们的保留集上效果还不够好。
- [ADR-0003](0003-input-pdf-and-images-local-ocr.md) 定的 PDF 和图片输入，和两项表格功能没有关系。

## 决定

- 三项功能都保留在 CellSentry 里，PII 是这一版的主打。
- 公式审计和数据提取保持现状，包括 AI 复核。只修 bug，不加新功能。
- 大模型怎么到用户手里，由当天的追问和 [ADR-0007](0007-own-task-models-on-own-cdn.md) 决定：用户主动下载，不在启动时强制下载。

## 考虑过的方案

这条决策问了两轮。

第一轮（D3）：

| 方案 | 结果 | 理由 |
|---|---|---|
| 新版移出，v1 归档 | jojo 先选了，11 分钟后澄清是误读 | 产品只讲一件事，叙事最清楚、维护最省；但 jojo 在 D4 的回答里说：“PII 依然是三大功能之一，我不是说要彻底放弃其他两个功能的” |
| 只保留规则版公式审计，数据提取移出 | 否决 | 一个 App 里放两件不相关的事，用户会问“它到底是干什么的” |
| 三项都保留 | 进入第二轮 | 要再定另两项怎么保留 |

第二轮（D3 重问）：

| 方案 | 结果 | 理由 |
|---|---|---|
| 三项都在，另两项只用规则，去掉 AI 复核 | 否决（当时的推荐项） | 整个 App 不再需要大模型，安装包小 |
| **三项都在，另两项保持现状** | **采用** | jojo 的选择，没有另说理由 |
| 这一版只发 PII，另两项先藏起来 | 否决 | 最聚焦，但老用户更新后会发现功能不见了 |

## 接受的代价

- 保留了一个效果还不够好的 AI 复核。
- 1.56 GB 的大模型仍然要想办法交到用户手里，要么打进安装包，要么让用户下载。当天的追问选了用户下载，见 [ADR-0007](0007-own-task-models-on-own-cdn.md)。
- 三项功能都要维护，第一版的范围更大。

## 后果

**好处**：

- 和 v1 有延续性，老用户更新后功能都还在。
- 首页能讲“一个 App 帮你做三件事”，见 [ADR-0009](0009-redesign-direction-a-task-home.md)。

**风险**：

- v2 的公开分发条款还要和模型作者确认（PRD §10）。确认之前，公式审计的 AI 复核在公开版里没有模型可用。

## 重新评估的条件

- 公开发布前，v2 的分发条款可能还没确认。
- Black Sky 的下一版公式模型，在冻结保留集上仍然几乎标不出真实错误：要讨论 AI 复核还要不要保留。
- iPhone 版首发是否只含 PII，要在 #3 有结论后单独定（PRD §10）。

## 复盘（Q1–Q5）

不是复盘 ADR：第一轮的“移出”只存在于问答里，11 分钟后 jojo 就澄清了，没有写进任何文档，也没有据此改过代码。

## 相关

- [ADR-0007](0007-own-task-models-on-own-cdn.md) 模型分发
- [v2 分发核查](../evaluation/2026-10-17-v2-distribution-review.md)
