# ADR-0001：用 ADR 记决策，ROADMAP 冻结

- **Status**: Accepted
- **Date**: 2026-10-18
- **Deciders**: jojo
- **Drafted by**: Claude Code · Opus 5.5
- **Supersedes**: `.claude/product/ROADMAP.md` 的 Decision Log（2026-03 起的做法，没有迁成 ADR）
- **Superseded by**: —
- **Legacy ID**: —
- **Related**: [README.md](README.md)、[INDEX.md](INDEX.md)；参考一个用 ADR 记决策已久的项目

## 背景

到 2026-10-18 为止，CellSentry 的决策散在三处：

| 位置 | 内容 | 问题 |
|---|---|---|
| `.claude/product/ROADMAP.md` 的 Decision Log | 2026-03-03 到 03-18，约 50 行 | 真决策和“Phase X complete”这类进度混在一起；2026-03-18 以后没再更新，HANDOFF 已标“过时” |
| `.claude/product/PRD-v0-local-pii.md` 文末 | D1–D8，2026-10-18 jojo 逐条确认 | 每条只有一行，没写备选方案和代价 |
| `docs/research/2026-10-18-round2-directions.md` §4 | 它自己的 D2、D3 | 意思和 PRD 的 D2、D3 不同，编号已经撞了 |

ROADMAP 原本兼着“记决策”和“记进度”两件事。进度已经有了别的去处：GitHub Issues（Black Sky 的 #1–#3）和 HANDOFF。决策却没有固定的地方。

jojo 在别的项目里用 ADR 记决策已经很久，是他沉淀最深的做法。jojo 要求 CellSentry 参考它。

## 决定

- 决策记在 `docs/adr/`，一条一个文件，规则见 [README.md](README.md)。
- PRD 的 D1–D8 迁成 ADR-0002 到 0009。PRD 里的决策表换成对照表，正文里的“D6”这类引用照样能查到。
- `ROADMAP.md` 冻结：顶部加一段说明，正文不改、不删。三月的旧决策不补写成 ADR；以后哪条新决策推翻了其中某条，就在新 ADR 的 `Supersedes` 里写明。
- `CLAUDE.md` 里“ROADMAP 实时更新”这条规则，换成“遇到重要决策就提议写 ADR”。
- 加一个检查脚本 `scripts/check-adr-index.mjs`（`cd app && npm run check:adr`），核对 INDEX 和文件。

从参考项目照搬的部分：
- 编号是 4 位、全局递增，不预留、不复用；
- INDEX 是唯一入口；
- 定下后不改正文，要改就写新 ADR；
- 写备选方案和代价，写重新评估的条件；
- 30 天内推翻已定决策，要做 Q1–Q5 复盘。

和参考项目不同的三处：
1. **头部只有一种格式。** 头部格式不统一时，检查脚本只能核对“有哪些 ADR”，核对不了状态。CellSentry 从第一条起固定一种头部，检查脚本也核对每条的状态和日期。
2. **小节名不带 D 前缀。** 常见模板里有“D7. Alternatives”“D8. Drawbacks”这样的小节名，搬过来会和 PRD 的决策 D7、D8 撞名。
3. **产品决策也写 ADR。** ADR 通常只给架构决策写；CellSentry 现阶段的决策大多是产品决策。

## 考虑过的方案

| 方案 | 结果 | 理由 |
|---|---|---|
| 继续维护 ROADMAP | 否决 | 七个月没更新；进度和决策混在一张表里，两件事都没做好 |
| 只有新决策写 ADR，D1–D8 留在 PRD | 否决 | 决策还是放在两处；D1–D8 是眼下最常被引用的决策，最需要写清楚备选和代价 |
| 三月的旧决策也补写成 ADR | 否决 | 工作量大，而且不少已被后来的事实改写，比如 Python sidecar 早就换成了 TS 引擎；等新决策碰到时再补，成本最低 |
| **D1–D8 迁成 ADR，ROADMAP 冻结** | **采用** | 决策只剩一个地方，旧引用也对得上 |

最后两行是 2026-10-18 问 jojo 时的两个选项，jojo 选了推荐项；前两行是起草方案时排除的。

## 接受的代价

- 三月的约 50 行旧决策留在冻结的 ROADMAP 里，查历史要看两个地方。
- 一条 ADR 比 PRD 里的一行字长得多，记一个决策要多花时间。

## 后果

**好处**：

- 每条决策有全局唯一的编号，不会再撞号。
- 备选方案和代价写在决策旁边，以后要推翻时，能对照当时为什么这样选。
- 检查脚本让 INDEX 和文件不会悄悄对不上。

**风险**：

- 嫌麻烦，决策又写回 PRD 或只留在对话里，ADR 慢慢变成又一份过时的文档。

## 重新评估的条件

- 到 2027-01-18（3 个月）为止，出现了 jojo 确认过、却没有写成 ADR 的产品或模型决策：说明流程太重，要简化模板。
- `npm run check:adr` 在开发分支上报错，一周内没人修。

## 复盘（Q1–Q5）

不是复盘 ADR：这是 CellSentry 第一次建决策记录制度，没有推翻 30 天内定下的决策。

## 相关

- [HANDOFF-CLAUDE.md](../../HANDOFF-CLAUDE.md)
