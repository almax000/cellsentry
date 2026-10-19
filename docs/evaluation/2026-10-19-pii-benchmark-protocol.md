# Issue #1：中文医疗 PII 冻结集与评分协议

本版交付生成器、dev/test、无标签输入、SHA256、评分器、数据卡及现有规则组件基线。未启动 #2 的 Julia-1/token 分类实验，不新增产品运行依赖，不更改现有 PII 规则。规范数据见 `test-cases/pii-medical-v1/`。

## 复现

Node 标准库足以生成、校验、评分和运行评分测试；现有规则基线需要 app 已安装的 esbuild，xlsx 导出使用 app 现有 ExcelJS，均无需 Python。

```powershell
node --test scripts/test-pii-benchmark.mjs
node scripts/pii-benchmark.mjs verify

# 基线只接收无标签文件，不允许把 gold 文档送入模型/候选生成器。
node scripts/pii-benchmark.mjs baseline test-cases/pii-medical-v1/dev.inputs.jsonl .runtime/pii/rules-dev.jsonl
node scripts/pii-benchmark.mjs score test-cases/pii-medical-v1/dev.jsonl .runtime/pii/rules-dev.jsonl .runtime/pii/dev-score.json
node scripts/pii-benchmark.mjs baseline test-cases/pii-medical-v1/test.inputs.jsonl .runtime/pii/rules-test.jsonl
node scripts/pii-benchmark.mjs score test-cases/pii-medical-v1/test.jsonl .runtime/pii/rules-test.jsonl .runtime/pii/test-score.json
node scripts/pii-benchmark.mjs report .runtime/pii/test-score.json .runtime/pii/report.md

# 120 份测试表格，含 24 份只有背景说明的阴性表格；不是新增独立样本。
node scripts/pii-benchmark.mjs xlsx test-cases/pii-medical-v1/test.inputs.jsonl .runtime/pii/xlsx-test

# 生成另一目录以复核复现性；不要重新生成/覆盖冻结目录。
node scripts/pii-benchmark.mjs generate .runtime/pii/reproduced-v1
```

生成器拒绝覆盖已有数据；score 先验证 dev/test 及输入文件的全部 manifest 哈希，禁止给未列入 manifest 的 gold 文件评分。Git attributes 对冻结 JSONL 保留字节，避免 Windows 换行转换破坏哈希。

## 输入与预测协议

`*.inputs.jsonl` 每行是一个完整文档，只有 `id/layout/document_type/text/units`。表格 units 有 row/column/header，可按列收集 3 个样例供 #2 决策模型；表单按字段，自由文本按句。units 是文本分割信息，不是候选或金标准，不含任何实体类型/跨度标签。必须保持 text 原始字节及字符内容；span 偏移为 **JavaScript UTF-16 code units、[start,end)**。文档开头包含非 BMP 字符，以检查 Python code-point 或 UTF-8 byte offset 是否被错误混用。Python 转换可用 `len(text[:i].encode('utf-16-le')) // 2`。

预测 JSONL 每份文档恰好一行，即使没有命中也必须输出 `entities: []`：

```json
{
  "id": "test-0001",
  "entities": [{"type": "name", "start": 10, "end": 13}],
  "candidates": [
    {"type": "name", "start": 10, "end": 13, "isPii": true, "autoAccepted": false, "confidence": 0.8},
    {"start": 20, "end": 23, "isPii": false, "autoAccepted": true, "confidence": 0.99}
  ]
}
```

上例跨度仅示意，实际必须落在该文档内且不能切开 surrogate pair。实体 type 仅限 `name/phone/national_id/social_security/bank_card/email/address`。重复预测算额外 FP；重复/额外 ID、缺失文档、非法跨度、非法类型与概率则直接拒绝。

`candidates` 可选，但决策模型路线应提供。候选不要求预先正确分类，type 可省略；最终每个实体边界必须存在于候选中。autoAccepted 默认 false，表示需要用户复核；自动正/负决策必须给出布尔 isPii，自动正决策还需给出输出实体及类型，自动负决策不得与输出脱敏跨度冲突。未提供 candidates 时，候选召回为 null，复核量默认等于输出条数，不认定任何自动通过。

## 固定评分口径

1. **严格主指标**：类型、start、end 全相同才算 TP；按类型一对一最大匹配，报告 P/R/F1 与 TP/FP/FN。**辅助重叠指标**也要求同类型且一对一匹配，不能用一个大跨度同时命中多个实体。
2. 按七类字段、表单/表格合计、自由文本，以及三种 layout 分别报告。字段没有预测或没有 gold 时，分母为零的指标是 null，不伪装成 100%。
3. **文档残留率**：应用预测实体跨度后，任一 gold 标识仍未被完全覆盖就记残留。允许不同类型的跨度覆盖，因为实际涂黑效果与分类标签不同；另报 strict_incomplete_document_rate，避免边界/类型错误被覆盖率掩盖。还单独报告电话/证件/社保/银行卡的文档残留及逐类型残留。它们是规范文本上的覆盖模拟，不是实际 PDF/图片脱敏验证。
4. **阴性误报两种口径同时报**：纯阴性文档中出现任意预测的文档比例；带标签易混跨度中与预测有任意重叠的比例。前者分母是阴性文档数，后者是阴性跨度数，不能混称一个 FPR。
5. **候选召回**：在完整候选记录覆盖全部文档时报告；精确边界召回忽略候选预设类型，覆盖召回要求某一个候选完整包含 gold。再报告“已有精确候选时的严格判定召回”。在约束最终实体必须来自候选的协议下，整体严格召回 = 精确候选召回 × 候选条件下严格召回；可定位候选生成与模型判定两类漏报。候选记录不完整时返回 null。
6. **复核负担**：默认每条候选由用户看一次；未提供候选则每条输出看一次。报告每文档复核条数、自动决策数量/占比/错误数，及 confidence ≥0.95 且自动通过的数量/占比/错误数。0.95 是本协议固定报告分箱，不是已校准的上线阈值；不据此自动修改候选决策。自动负判定与任何 gold 重叠即错，自动正判定必须严格匹配类型和跨度。

阈值、选项和问题模板只能在 dev 上确定，测试保持冻结。本轮基线直接使用原有代码，没有根据本测试结果调整规则或阈值。

## 现有规则组件基线与接下来 #2

适配器复用 `app/electron/pii/patterns.ts` 的 regex 和 validator，在每个 unit 内枚举全部通过验证的命中，并消除同类型同边界重复项。credit_card/bank_card 合并为 bank_card，id_number 映射 national_id、ssn 映射 social_security；不属于七类 schema 的 IBAN/passport 不参与。**这与生产 scanner 的每单元格首命中/LLM 二次筛查不同**，没有用本次结果替代完整应用测试。

基线候选即通过原 validator 的规则命中，全部留给人工复核，因此基线自动通过数为 0。国内姓名、住址、社保卡不在旧规则支持范围；校验位错误的患者身份证被过滤是本基准预期会暴露的候选遗漏，而非改 gold 迎合规则。

已输出 dev/test 预测、分字段与布局指标、执行元数据及报告至 `benchmark-results/pii-medical-v1/`。此阶段只能说明旧规则缺口，不能判断 Julia-1 是否有效，也没有 #2 要求的 Mac 性能结论。下一步需在相同冻结集上增加规则+Julia-1、小型 token 分类对照，并独立测 Mac 耗时/峰值内存；OCR 子集及实际文档脱敏另立口径，不混入主分数。
