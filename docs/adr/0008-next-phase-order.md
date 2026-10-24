# ADR-0008：下一阶段顺序：UI/UX → 接入模型 → macOS 版

- **Status**: Superseded by ADR-0019
- **Date**: 2026-10-18
- **Deciders**: jojo
- **Drafted by**: Claude Code · Opus 5.5（从 PRD 和当天的问答迁入）
- **Supersedes**: —
- **Superseded by**: ADR-0019
- **Legacy ID**: PRD D7
- **Related**: [PRD §7、§9](../../.claude/product/PRD-v0-local-pii.md)

## 背景

- 模型工作已全部交给 Black Sky（issue #1–#3），我们这边只做战略、产品判断和产品开发。
- 2026-10-18 jojo 先提议“先全面更新优化 CellSentry 的网页和产品”，随后选了先写 PRD。
- PRD 写完、可插拔调研回来以后，jojo 定下顺序：“接下来应该是优化 CellSentry 当前的 UI/UX，把 Black Sky 的新模型接进来，然后优先完成 macOS 版本。”
- 同一条消息里 jojo 还给了一个判断：v1 下载了两千多次，打开过的却很少（Mac 版完成过的更新检查是 0 次），主要原因是没有签名证书。这记在 PRD §7，是待验证的假设。

## 决定

我们这边按这个顺序做：

1. 优化现有的 UI/UX，包括 PII 新流程的界面。
2. 接入 Black Sky 的模型：先把 v2 公式模型迁到自有 CDN（[ADR-0007](0007-own-task-models-on-own-cdn.md)），再接 PII 模型。
3. 优先完成 macOS 版：签名、公证、按需下载，补上违背本地底线的地方。
4. 有了可以演示的版本，再改网站。

平台：Windows 这一版不发布，代码保留；iPhone 等 #3 通过后再跟进。

依赖：UI/UX 和规则部分不依赖模型结果；PII 模型要等 #2 通过。

## 考虑过的方案

| 方案 | 结果 | 理由 |
|---|---|---|
| 先全面更新网站和产品 | 改成最后一步 | jojo 最早的提议；网站要等有了可演示的版本，才有东西可讲 |
| iPhone 同步首发 | 否决 | 第二轮调研的选项 3：Safepaste 已经是同一形态；要先买开发者账号；#3 还没有结论 |
| 等 #2 的模型结论出来再动界面 | 否决 | UI/UX 和规则部分不依赖模型结果，干等浪费时间。起草时补列 |
| **UI/UX → 接入模型 → macOS 版 → 网站** | **采用** | jojo 定的顺序 |

## 接受的代价

- macOS 版公开发布需要 Apple Developer Program（付费），什么时候买由 jojo 决定。不买的话，第 3 步做完也发不出签名版。
- 第 4 步之前，网站一直是 v1 三合一工具箱的内容。

## 后果

**好处**：

- 第 1 步和第 2 步的前半段都不用等 Black Sky，可以马上开工。
- macOS 版先做完，演示时不会弹系统安全警告。

**风险**：

- #2 不通过，第 2 步的“接 PII 模型”就没有模型可接。

## 重新评估的条件

- #2 不通过：第 2 步要换成备选路线，见 [ADR-0006](0006-pii-pass-bar-by-document-type.md) 的重新评估条件。
- 第 1、2 步做完时，Apple 开发者账号还没买：第 3 步卡住，要重排顺序。
- 签名、公证后的 Mac 版发布第一周，“自有 CDN 的模型下载完成数 ÷ DMG 下载数”没有明显高于 v1：说明证书不是主要阻碍（PRD §7），第 3 步之后的优先级要重排。

## 复盘（Q1–Q5）

不是复盘 ADR：jojo 最早的“先改网站”只是提议，没有定下。

## 相关

- [ADR-0007](0007-own-task-models-on-own-cdn.md) 模型分发、[ADR-0009](0009-redesign-direction-a-task-home.md) UI/UX 改版方向
