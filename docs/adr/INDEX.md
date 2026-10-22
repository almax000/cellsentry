# ADR 索引

> 全部 ADR 以本表为准。新增 ADR 时在同一个提交里加一行。`cd app && npm run check:adr` 会核对本表和盘上的文件：有没有多、有没有缺，状态和日期是否一致。
> 规则见 [README.md](README.md)，模板见 [_template.md](_template.md)。

| # | 标题 | Status | Date | 原编号 |
|---|---|---|---|---|
| [0001](./0001-adopt-adrs-and-freeze-roadmap.md) | 用 ADR 记决策，ROADMAP 冻结 | Accepted | 2026-10-18 | — |
| [0002](./0002-position-personal-medical-records.md) | 定位：个人医疗档案的一致假名化 | Accepted | 2026-10-18 | PRD D1 |
| [0003](./0003-input-pdf-and-images-local-ocr.md) | 输入：PDF 和图片，本机 OCR | Superseded by ADR-0013 | 2026-10-18 | PRD D2 |
| [0004](./0004-keep-all-three-features.md) | 三项功能都保留，另两项保持现状 | Accepted | 2026-10-18 | PRD D3 |
| [0005](./0005-keep-the-cellsentry-name.md) | 沿用 CellSentry 这个名字，不起中文名 | Accepted | 2026-10-18 | PRD D4 |
| [0006](./0006-pii-pass-bar-by-document-type.md) | #2 的模型达标线按文档类型分开定 | Accepted | 2026-10-18 | PRD D5 |
| [0007](./0007-own-task-models-on-own-cdn.md) | 三个自调模型放在自有 CDN，App 内按需下载 | Accepted | 2026-10-18 | PRD D6、D3 追问 |
| [0008](./0008-next-phase-order.md) | 下一阶段顺序：UI/UX → 接入模型 → macOS 版 | Accepted | 2026-10-18 | PRD D7 |
| [0009](./0009-redesign-direction-a-task-home.md) | UI/UX 改版走方向 A“任务首页” | Accepted | 2026-10-18 | PRD D8 |
| [0010](./0010-free-and-open-source.md) | 完全免费开源，暂不商业化 | Accepted | 2026-10-18 | — |
| [0011](./0011-on-device-inference-bottom-line.md) | 本地端侧推理是底线 | Accepted | 2026-10-18 | — |
| [0012](./0012-redaction-flow-defaults.md) | 新脱敏流程的五个默认做法 | Accepted | 2026-10-21 | — |
| [0013](./0013-pause-ocr.md) | 先暂停照片和扫描件的文字识别 | Accepted | 2026-10-21 | — |
| [0014](./0014-consistent-address-codes-and-canonical-restore.md) | 地址保持一致代号，接受统一写法还原 | Accepted | 2026-10-22 | — |

## 旧的决策记录

- **2026-03-03 到 03-18**：[ROADMAP.md 的 Decision Log](../../.claude/product/ROADMAP.md#decision-log)，约 50 行，已冻结。这些没有迁成 ADR；新决策推翻其中某条时，在新 ADR 的 `Supersedes` 里写明是哪一行。ADR-0007 就是第一个例子。
- **编号撞车**：[第二轮调研](../research/2026-10-18-round2-directions.md) §4 里的“D2、D3”是调研时的待定事项，和 PRD 的 D2、D3 不是一回事。从 ADR-0001 起只用 ADR 编号。
