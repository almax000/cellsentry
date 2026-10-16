# cellsentry-cancel2 本地模型 288 用例测试

已执行 288/288；严格通过 265。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|288|265 (92.0%)|265|288|288|0.538|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
本轮使用独立指定的合成测试集；任务定义及生成来源见对应数据 manifest。各分割共享生成逻辑，不代表独立真实业务准确率。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- CANCEL2-validation-00-006-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-06-011-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-00-000-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-00-009-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-00-008-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-00-007-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-06-008-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-06-010-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-06-001-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-06-003-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-09-010-0 audit/date_direction：wrong_judgment_or_identity
- CANCEL2-validation-09-005-0 audit/date_direction：wrong_judgment_or_identity
- CANCEL2-validation-06-006-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-06-009-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-00-003-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-06-002-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-00-010-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-06-007-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-06-000-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-06-005-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-validation-00-004-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-validation-03-005-0 audit/sum_exclusion：wrong_judgment_or_identity
- CANCEL2-validation-06-004-0 audit/rounding_tolerance：wrong_judgment_or_identity
