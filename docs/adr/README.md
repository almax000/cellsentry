# 决策记录（ADR）

> 2026-10-18 起，CellSentry 的产品、模型和架构决策都记在这里，取代 `.claude/product/ROADMAP.md` 的决策日志。为什么这样改，见 [ADR-0001](0001-adopt-adrs-and-freeze-roadmap.md)。

ADR 是“架构决策记录”（Architecture Decision Record）：一条决策一个文件，写清楚当时为什么这样选、还考虑过什么、接受了什么代价、出现什么情况就要重新评估。

## 入口

- [INDEX.md](INDEX.md)：全部 ADR 的索引。找决策先看这里。
- [_template.md](_template.md)：新 ADR 的模板。
- 检查索引和文件是否一致：`cd app && npm run check:adr`。

## 什么时候写

- 产品决策：定位、目标用户、范围、命名、平台顺序、对外承诺。
- 模型决策：模型来源、分发方式、达标线。
- 架构决策：跨很多文件的重构、运行时或框架的选型、不可逆的操作。
- 推翻或修改一条已有的 ADR。

## 什么时候不写

- 修 bug、调界面细节、改文案。
- 进度和待办：写 GitHub Issues 和 [HANDOFF-CLAUDE.md](../../HANDOFF-CLAUDE.md)。
- 调研和评测的过程：写 `docs/research/`、`docs/evaluation/`，ADR 只引用它们的结论。

## 规则

1. **编号**：4 位数字，全局递增，文件名 `NNNN-短名.md`。新建前先 `ls docs/adr/<NNNN>-*.md` 确认没被占用。不预留编号；编号永不复用，被否决、被取代的 ADR 也占着号。
2. **头部只有一种格式**：照抄模板的字段名和顺序，`**Status**:` 这类英文字段名不改。检查脚本靠它核对状态和日期。
3. **状态**：`Proposed`（起草中，还没定）→ `Accepted`（jojo 已定）→ `Superseded by ADR-NNNN` 或 `Deprecated`。没被采纳的写 `Rejected`。
4. **定下后不改正文**：要改决策就写一条新 ADR，在新 ADR 的 `Supersedes` 里写上旧编号，再把旧 ADR 的 `Status` 和 `Superseded by` 改掉。错别字和失效链接可以直接修。
5. **复盘**：30 天内推翻一条已定的决策，新 ADR 必须填 Q1–Q5 复盘段（见模板）。
6. **决定人是 jojo**：agent 只能起草 `Proposed`，jojo 确认后才改成 `Accepted`。
7. **同一个提交里加 INDEX 行**。`docs/` 被 `.gitignore` 忽略，新文件要 `git add -f <具体文件>`。

## 和其他文档的关系

| 文档 | 记什么 |
|---|---|
| ADR | 为什么这样选（决策） |
| `.claude/product/PRD-*.md` | 这一版要做成什么样（需求） |
| `docs/research/`、`docs/evaluation/` | 调研和评测的证据 |
| GitHub Issues、HANDOFF | 做到哪了、下一步做什么（进度） |
| `.claude/product/ROADMAP.md` | 2026-03 的阶段和决策日志，已冻结 |

## 公开仓库里的链接

这个目录会同步到公开仓库。ADR 链接的部分证据文件不公开：调研文档（`docs/research/`）、产品文档（`.claude/product/`）、交接文档和一部分评测文档。这些链接在公开仓库里打不开。
