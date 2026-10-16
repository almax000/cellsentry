# cellsentry-minicpm5-2b-formula-v1 本地模型 1320 用例测试

已执行 1320/1320；严格通过 1274。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|1320|1274 (96.5%)|1274|1320|1320|0.521|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
本轮使用独立指定的合成测试集；任务定义及生成来源见对应数据 manifest。各分割共享生成逻辑，不代表独立真实业务准确率。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- FCHAT-BIZ3-test-03-0014-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0004-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0002-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-15-0014-0 audit/seasonal_spike：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0005-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-11-0002-1 audit/stored_sign：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0018-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-test-00351 audit/iferror：wrong_judgment_or_identity
- FCHAT-BIZ3-test-13-0004-0 audit/optional_blank：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0013-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-15-0007-0 audit/seasonal_spike：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0000-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0010-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0010-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-15-0016-1 audit/seasonal_spike：wrong_judgment_or_identity
- FCHAT-BIZ3-test-02-0019-0 audit/archived_snapshot：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0020-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0014-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-02-0015-0 audit/archived_snapshot：wrong_judgment_or_identity
- FCHAT-test-00347 audit/iferror：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0022-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0004-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0017-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0006-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0023-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-11-0010-1 audit/stored_sign：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0010-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0022-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0000-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-13-0008-0 audit/optional_blank：wrong_judgment_or_identity
- FCHAT-BIZ3-test-11-0006-1 audit/stored_sign：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0015-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0020-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0016-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0020-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0016-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0022-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0012-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0008-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0012-0 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-03-0008-1 audit/iterative_cycle：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0002-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-test-00349 audit/iferror：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0018-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0012-0 audit/contract_literal：wrong_judgment_or_identity
- FCHAT-BIZ3-test-01-0006-0 audit/contract_literal：wrong_judgment_or_identity
