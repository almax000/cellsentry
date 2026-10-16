# cellsentry-minicpm5-2b-v1 本地模型 1440 用例测试

已执行 300/1440；严格通过 152。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|208|94 (45.2%)|94|186|186|0.533|
|extraction|48|26 (54.2%)|26|41|40|1.064|
|pii|44|32 (72.7%)|32|38|38|0.442|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
本轮使用独立指定的合成测试集；任务定义及生成来源见对应数据 manifest。各分割共享生成逻辑，不代表独立真实业务准确率。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- MCP-BIZ3-test-04-0016-0 audit/external_link：wrong_judgment_or_identity
- MCP-test-extract-00106 extraction/payroll：wrong_document_missing_extra_or_wrong_field
- MCP-test-extract-00157 extraction/receipt：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-17-0000-0 audit/text_identifier：wrong_judgment_or_identity
- MCP-BIZ3-test-10-0003-0 audit/rate_scale：wrong_judgment_or_identity
- MCP-BIZ3-test-13-0011-0 audit/optional_blank：wrong_judgment_or_identity
- MCP-test-extract-00004 extraction/payroll：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-19-0007-0 audit/unit_conversion：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0008-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0005-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0022-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-07-0014-0 audit/lookup_key_type：wrong_judgment_or_identity
- MCP-BIZ3-test-12-0007-0 audit/date_order：wrong_judgment_or_identity
- MCP-BIZ3-test-08-0004-0 audit/sum_scope：wrong_judgment_or_identity
- MCP-BIZ3-test-06-0005-0 audit/lookup_column：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0010-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-test-extract-00103 extraction/receipt：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-10-0016-0 audit/rate_scale：wrong_judgment_or_identity
- MCP-BIZ3-test-10-0018-0 audit/rate_scale：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0004-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-05-0021-0 audit/lookup_match：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0002-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-BIZ3-test-15-0001-0 audit/seasonal_spike：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0007-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-test-pii-00128 pii/negative：missed_extra_or_wrong_pii
- MCP-test-extract-00030 extraction/invoice：wrong_document_missing_extra_or_wrong_field
- MCP-test-pii-00080 pii/negative：missed_extra_or_wrong_pii
- MCP-test-extract-00181 extraction/receipt：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-12-0017-0 audit/date_order：wrong_judgment_or_identity
- MCP-test-extract-00014 extraction/purchase_order：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-02-0010-0 audit/archived_snapshot：wrong_judgment_or_identity
- MCP-BIZ3-test-11-0013-0 audit/stored_sign：wrong_judgment_or_identity
- MCP-BIZ3-test-15-0022-0 audit/seasonal_spike：wrong_judgment_or_identity
- MCP-BIZ3-test-04-0015-0 audit/external_link：wrong_judgment_or_identity
- MCP-BIZ3-test-12-0022-0 audit/date_order：wrong_judgment_or_identity
- MCP-BIZ3-test-05-0002-0 audit/lookup_match：wrong_judgment_or_identity
- MCP-BIZ3-test-17-0023-0 audit/text_identifier：wrong_judgment_or_identity
- MCP-BIZ3-test-00-0004-0 audit/imported_literal：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0014-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-14-0016-0 audit/duplicate_key：wrong_judgment_or_identity
- MCP-BIZ3-test-16-0017-0 audit/rounding_tolerance：wrong_judgment_or_identity
- MCP-BIZ3-test-04-0009-0 audit/external_link：wrong_judgment_or_identity
- MCP-BIZ3-test-17-0009-0 audit/text_identifier：wrong_judgment_or_identity
- MCP-test-pii-00104 pii/negative：missed_extra_or_wrong_pii
- MCP-BIZ3-test-15-0006-0 audit/seasonal_spike：wrong_judgment_or_identity
- MCP-BIZ3-test-08-0012-0 audit/sum_scope：wrong_judgment_or_identity
- MCP-BIZ3-test-14-0003-0 audit/duplicate_key：wrong_judgment_or_identity
- MCP-BIZ3-test-11-0023-0 audit/stored_sign：wrong_judgment_or_identity
- MCP-BIZ3-test-07-0003-0 audit/lookup_key_type：wrong_judgment_or_identity
- MCP-BIZ3-test-08-0014-0 audit/sum_scope：wrong_judgment_or_identity
- MCP-BIZ3-test-13-0004-0 audit/optional_blank：wrong_judgment_or_identity
- MCP-BIZ3-test-17-0005-0 audit/text_identifier：wrong_judgment_or_identity
- MCP-BIZ3-test-14-0012-0 audit/duplicate_key：wrong_judgment_or_identity
- MCP-BIZ3-test-12-0003-0 audit/date_order：wrong_judgment_or_identity
- MCP-BIZ3-test-06-0022-0 audit/lookup_column：wrong_judgment_or_identity
- MCP-BIZ3-test-08-0011-0 audit/sum_scope：wrong_judgment_or_identity
- MCP-test-extract-00024 extraction/invoice：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-19-0020-0 audit/unit_conversion：wrong_judgment_or_identity
- MCP-BIZ3-test-01-0020-0 audit/contract_literal：wrong_judgment_or_identity
- MCP-BIZ3-test-07-0020-0 audit/lookup_key_type：wrong_judgment_or_identity
- MCP-BIZ3-test-11-0001-0 audit/stored_sign：wrong_judgment_or_identity
- MCP-BIZ3-test-01-0021-0 audit/contract_literal：wrong_judgment_or_identity
- MCP-BIZ3-test-06-0019-0 audit/lookup_column：wrong_judgment_or_identity
- MCP-BIZ3-test-04-0002-0 audit/external_link：wrong_judgment_or_identity
- MCP-BIZ3-test-07-0018-0 audit/lookup_key_type：wrong_judgment_or_identity
- MCP-BIZ3-test-09-0000-0 audit/aggregation_type：wrong_judgment_or_identity
- MCP-test-extract-00133 extraction/receipt：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-17-0020-0 audit/text_identifier：wrong_judgment_or_identity
- MCP-BIZ3-test-13-0008-0 audit/optional_blank：wrong_judgment_or_identity
- MCP-test-pii-00140 pii/negative：missed_extra_or_wrong_pii
- MCP-BIZ3-test-10-0015-0 audit/rate_scale：wrong_judgment_or_identity
- MCP-BIZ3-test-19-0003-0 audit/unit_conversion：wrong_judgment_or_identity
- MCP-test-extract-00127 extraction/receipt：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-15-0014-0 audit/seasonal_spike：wrong_judgment_or_identity
- MCP-BIZ3-test-19-0006-0 audit/unit_conversion：wrong_judgment_or_identity
- MCP-test-pii-00081 pii/negative：missed_extra_or_wrong_pii
- MCP-BIZ3-test-03-0009-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0023-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-BIZ3-test-14-0014-0 audit/duplicate_key：wrong_judgment_or_identity
- MCP-BIZ3-test-12-0014-0 audit/date_order：wrong_judgment_or_identity
- MCP-test-extract-00000 extraction/invoice：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-13-0005-0 audit/optional_blank：wrong_judgment_or_identity
- MCP-BIZ3-test-04-0004-0 audit/external_link：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0003-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-test-extract-00235 extraction/receipt：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-06-0010-0 audit/lookup_column：wrong_judgment_or_identity
- MCP-BIZ3-test-19-0002-0 audit/unit_conversion：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0007-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-01-0013-0 audit/contract_literal：wrong_judgment_or_identity
- MCP-BIZ3-test-15-0009-0 audit/seasonal_spike：wrong_judgment_or_identity
- MCP-BIZ3-test-06-0021-0 audit/lookup_column：wrong_judgment_or_identity
- MCP-BIZ3-test-16-0007-0 audit/rounding_tolerance：wrong_judgment_or_identity
- MCP-BIZ3-test-06-0003-0 audit/lookup_column：wrong_judgment_or_identity
- MCP-BIZ3-test-05-0001-0 audit/lookup_match：wrong_judgment_or_identity
- MCP-BIZ3-test-11-0018-0 audit/stored_sign：wrong_judgment_or_identity
- MCP-BIZ3-test-09-0005-0 audit/aggregation_type：wrong_judgment_or_identity
- MCP-BIZ3-test-05-0003-0 audit/lookup_match：wrong_judgment_or_identity
- MCP-BIZ3-test-14-0017-0 audit/duplicate_key：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0014-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-BIZ3-test-18-0019-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-16-0001-0 audit/rounding_tolerance：wrong_judgment_or_identity
- MCP-BIZ3-test-03-0017-0 audit/iterative_cycle：wrong_judgment_or_identity
- MCP-BIZ3-test-14-0019-0 audit/duplicate_key：wrong_judgment_or_identity
- MCP-test-pii-00224 pii/negative：missed_extra_or_wrong_pii
- MCP-BIZ3-test-01-0019-1 audit/contract_literal：wrong_judgment_or_identity
- MCP-BIZ3-test-07-0013-0 audit/lookup_key_type：wrong_judgment_or_identity
- MCP-BIZ3-test-02-0004-0 audit/archived_snapshot：wrong_judgment_or_identity
- MCP-BIZ3-test-04-0023-0 audit/external_link：wrong_judgment_or_identity
- MCP-test-extract-00076 extraction/payroll：wrong_document_missing_extra_or_wrong_field
- MCP-BIZ3-test-18-0008-0 audit/empty_denominator：wrong_judgment_or_identity
- MCP-BIZ3-test-02-0017-0 audit/archived_snapshot：wrong_judgment_or_identity
- MCP-test-extract-00154 extraction/payroll：wrong_document_missing_extra_or_wrong_field
- MCP-test-extract-00080 extraction/purchase_order：wrong_document_missing_extra_or_wrong_field, invalid_schema
- MCP-BIZ3-test-11-0000-1 audit/stored_sign：request_error: [WinError 10054] 远程主机强迫关闭了一个现有的连接。
- MCP-BIZ3-test-14-0009-0 audit/duplicate_key：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-18-0022-1 audit/empty_denominator：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00131 extraction/unknown：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00184 extraction/payroll：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-07-0023-1 audit/lookup_key_type：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-19-0010-0 audit/unit_conversion：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-01-0018-0 audit/contract_literal：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-pii-00239 pii/negative：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-13-0005-1 audit/optional_blank：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-pii-00077 pii/passport：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-pii-00181 pii/phone：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-04-0015-1 audit/external_link：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-00-0021-0 audit/imported_literal：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00062 extraction/purchase_order：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-08-0006-1 audit/sum_scope：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-16-0019-0 audit/rounding_tolerance：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-pii-00031 pii/negative：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-12-0011-1 audit/date_order：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-03-0005-0 audit/iterative_cycle：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-02-0012-0 audit/archived_snapshot：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-15-0003-1 audit/seasonal_spike：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00182 extraction/purchase_order：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-15-0000-1 audit/seasonal_spike：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-01-0001-0 audit/contract_literal：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-17-0012-1 audit/text_identifier：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-19-0004-0 audit/unit_conversion：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-01-0011-0 audit/contract_literal：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-13-0001-0 audit/optional_blank：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-pii-00063 pii/credit_card：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00124 extraction/payroll：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00060 extraction/invoice：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-pii-00164 pii/negative：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-BIZ3-test-16-0021-0 audit/rounding_tolerance：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
- MCP-test-extract-00023 extraction/unknown：request_error: <urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>
