# ADR-0005：沿用 CellSentry 这个名字，不起中文名

- **Status**: Accepted
- **Date**: 2026-10-18
- **Deciders**: jojo
- **Drafted by**: Claude Code · Opus 5.5（从 PRD 和当天的问答迁入）
- **Supersedes**: —
- **Superseded by**: —
- **Legacy ID**: PRD D4
- **Related**: [PRD §8](../../.claude/product/PRD-v0-local-pii.md)

## 背景

- 主打从表格换成了医疗档案（[ADR-0002](0002-position-personal-medical-records.md)），名字要不要跟着换。
- 现有资产都挂在 CellSentry 名下：cellsentry.pro 域名、公开仓库、v1 的下载记录。
- App Store 上这个名字还能不能用，还没查。

## 决定

- 沿用 CellSentry，不起中文名。
- 三项功能仍是 CellSentry 的组成部分，PII 是这一版的主打。

## 考虑过的方案

| 方案 | 结果 | 理由 |
|---|---|---|
| 沿用 CellSentry，另起一个中文名 | 否决（当时的推荐项） | 给国内用户和 App Store 中国区用；jojo 选了不起中文名 |
| **只用 CellSentry** | **采用** | 域名、仓库和历史记录都能接着用，不增加费用；放在医疗语境里，“Cell”也可以读成“细胞” |
| 换一个新名字 | 否决 | 要买新域名，违反“默认不新增付费”；仓库和下载记录要迁移或断开；还要重新查商标和重名 |

三行都是 2026-10-18 D4 问答的选项。

## 接受的代价

- 国内用户不好记、不好搜。
- 名字来自表格工具时代（Cell 是单元格），和主打的医疗隐私不直接相关。

## 后果

**好处**：

- 零费用，已有的域名、仓库和历史数据都不断。

**风险**：

- App Store 上可能已经有人用了这个名字，或者有商标冲突。

## 重新评估的条件

- 购买 Apple 开发者账号之前查名字时（PRD §8），发现 App Store 或商标上 CellSentry 不能用。

## 复盘（Q1–Q5）

不是复盘 ADR：这是第一次定命名。

## 相关

- [ADR-0002](0002-position-personal-medical-records.md) 定位、[ADR-0004](0004-keep-all-three-features.md) 三项功能
