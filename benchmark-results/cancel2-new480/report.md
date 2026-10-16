# cellsentry-cancel2 本地模型 480 用例测试

已执行 480/480；严格通过 399。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|480|399 (83.1%)|399|480|480|0.553|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
本轮使用独立指定的合成测试集；任务定义及生成来源见对应数据 manifest。各分割共享生成逻辑，不代表独立真实业务准确率。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- CANCEL2-test-11-017-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-06-017-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-11-012-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-00-010-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-11-002-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-11-018-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-09-001-0 audit/date_direction：wrong_judgment_or_identity
- CANCEL2-test-11-017-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-11-009-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-00-007-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-06-004-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-01-014-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-015-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-11-015-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-00-015-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-01-009-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-00-014-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-11-012-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-11-013-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-01-018-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-016-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-06-002-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-00-012-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-11-016-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-06-000-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-007-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-001-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-01-008-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-06-003-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-00-016-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-01-001-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-06-009-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-11-009-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-01-006-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-01-015-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-013-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-06-010-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-11-008-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-01-010-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-006-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-01-016-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-01-011-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-01-007-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-06-008-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-00-004-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-06-014-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-005-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-018-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-016-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-012-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-011-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-015-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-00-003-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-11-002-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-06-006-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-06-019-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-00-018-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-09-000-0 audit/date_direction：wrong_judgment_or_identity
- CANCEL2-test-11-019-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-09-008-0 audit/date_direction：wrong_judgment_or_identity
- CANCEL2-test-01-018-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-014-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-01-010-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-06-013-0 audit/rounding_tolerance：wrong_judgment_or_identity
- CANCEL2-test-01-009-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-00-019-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-01-005-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-01-007-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-00-006-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-11-008-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-00-017-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-11-010-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-11-011-1 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-01-013-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-09-007-0 audit/date_direction：wrong_judgment_or_identity
- CANCEL2-test-00-011-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-01-008-1 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-010-0 audit/unit_conversion：wrong_judgment_or_identity
- CANCEL2-test-00-009-0 audit/optional_blank：wrong_judgment_or_identity
- CANCEL2-test-01-005-0 audit/zero_fallback：wrong_judgment_or_identity
- CANCEL2-test-11-014-0 audit/unit_conversion：wrong_judgment_or_identity
