# ADR-0003：输入：PDF 和图片，本机 OCR

- **Status**: Superseded by ADR-0013
- **Date**: 2026-10-18
- **Deciders**: jojo
- **Drafted by**: Claude Code · Opus 5.5（从 PRD 和当天的问答迁入）
- **Supersedes**: —
- **Superseded by**: ADR-0013
- **Legacy ID**: PRD D2
- **Related**: [PRD §3](../../.claude/product/PRD-v0-local-pii.md)、[第二轮调研 §2.2](../research/2026-10-18-round2-directions.md)、[ADR-0002](0002-position-personal-medical-records.md)

## 背景

[ADR-0002](0002-position-personal-medical-records.md) 定了主打个人医疗档案，接下来要定第一版收哪些输入。三个选项在平台和输出上都一样：
- 平台：Mac 先发，iPhone 等 #3 通过后跟进，Windows 这一版不发布但保留代码；
- 输出：脱敏后的文本、本机映射表、还原后的 AI 回答。

## 决定

- 输入是 PDF（文字型和扫描型都支持）和图片。
- 扫描件和图片用 Apple Vision 在本机做 OCR。Mac 和 iPhone 都自带这个能力，支持中文，不联网。
- 粘贴文本作为附带入口。
- 打码后的图片或 PDF 不在这一版的输出里。

jojo 的理由：“医疗档案一般都是 pdf 和图片，通常不会有其他格式的”。

## 考虑过的方案

| 方案 | 结果 | 理由 |
|---|---|---|
| 文字型 PDF + 粘贴文本 | 否决 | 不用 OCR，范围最小（Mac 用 pdf.js，iPhone 用 PDFKit）；但纸质报告的照片和扫描件处理不了，离真实的医疗档案远 |
| **再加照片和扫描件的 OCR** | **采用** | 最接近真实档案，纸质报告和截图都能处理 |
| 只做粘贴文本 | 否决 | Mac 和 iPhone 最容易同步做出演示，但用户得自己把文字复制出来，“处理一整份档案”的体验弱很多 |

三行都是 2026-10-18 D2 问答的选项。推荐项是第一行，jojo 用自己的话选了第二行。

## 接受的代价

- 范围明显变大。
- OCR 认错的字会变成漏报。
- Electron 调用 Apple Vision 要额外写一个原生小程序。

## 后果

**好处**：

- 输入和用户手里的真实文件对得上，演示时可以直接用手机拍的体检单。
- Apple Vision 是系统能力，不用把 OCR 模型打进安装包。

**风险**：

- OCR 噪声对姓名、住址候选召回的影响还不知道（PRD §10）。
- 这一版新脱敏流程的输入里没有表格；现有 v1 的 Excel 脱敏入口和新流程是什么关系，PRD 没有写，做新流程前要定。

## 重新评估的条件

- #1 或 #2 的评测显示，OCR 噪声让姓名、住址的召回低于 [ADR-0006](0006-pii-pass-bar-by-document-type.md) 的线，而且改规则补不回来：要讨论是否先收窄到文字型 PDF。
- 调用 Apple Vision 的原生小程序在签名、公证或 App Store 审核上走不通。

## 复盘（Q1–Q5）

不是复盘 ADR：这是第一次定输入范围。

## 相关

- [ADR-0002](0002-position-personal-medical-records.md) 定位
- 第二轮调研 §2.2 的整合清单：PDF.js（Apache-2.0）、Vision（系统 API）、ZXing-C++（Apache-2.0，二维码）
