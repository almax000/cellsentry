# cellsentry-minicpm5-2b-v1 本地模型 500 用例测试

已执行 500/500；严格通过 388。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|180|103 (57.2%)|103|180|180|0.336|
|extraction|160|155 (96.9%)|155|160|160|0.785|
|pii|160|130 (81.2%)|130|160|160|0.164|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
测试集包含 18 种公式场景的正反例、32 类 PII 场景以及 5 种单据的 6 种布局和未知文档。每类有 5 个变体；部分变体共享结构，不能视为 500 个独立业务场景。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- TC0006 audit/division_zero：wrong_judgment_or_identity
- TC0007 audit/division_zero：wrong_judgment_or_identity
- TC0010 audit/division_zero：wrong_judgment_or_identity
- TC0016 audit/self_reference：wrong_judgment_or_identity
- TC0017 audit/self_reference：wrong_judgment_or_identity
- TC0018 audit/self_reference：wrong_judgment_or_identity
- TC0019 audit/self_reference：wrong_judgment_or_identity
- TC0020 audit/self_reference：wrong_judgment_or_identity
- TC0030 audit/broken_reference：wrong_judgment_or_identity
- TC0036 audit/sum_range：wrong_judgment_or_identity
- TC0037 audit/sum_range：wrong_judgment_or_identity
- TC0038 audit/sum_range：wrong_judgment_or_identity
- TC0039 audit/sum_range：wrong_judgment_or_identity
- TC0040 audit/sum_range：wrong_judgment_or_identity
- TC0046 audit/average_total：wrong_judgment_or_identity
- TC0047 audit/average_total：wrong_judgment_or_identity
- TC0048 audit/average_total：wrong_judgment_or_identity
- TC0049 audit/average_total：wrong_judgment_or_identity
- TC0050 audit/average_total：wrong_judgment_or_identity
- TC0056 audit/percent_scale：wrong_judgment_or_identity
- TC0057 audit/percent_scale：wrong_judgment_or_identity
- TC0058 audit/percent_scale：wrong_judgment_or_identity
- TC0059 audit/percent_scale：wrong_judgment_or_identity
- TC0060 audit/percent_scale：wrong_judgment_or_identity
- TC0066 audit/absolute_reference：wrong_judgment_or_identity
- TC0067 audit/absolute_reference：wrong_judgment_or_identity
- TC0068 audit/absolute_reference：wrong_judgment_or_identity
- TC0069 audit/absolute_reference：wrong_judgment_or_identity
- TC0070 audit/absolute_reference：wrong_judgment_or_identity
- TC0076 audit/relative_reference：wrong_judgment_or_identity
- TC0077 audit/relative_reference：wrong_judgment_or_identity
- TC0078 audit/relative_reference：wrong_judgment_or_identity
- TC0079 audit/relative_reference：wrong_judgment_or_identity
- TC0080 audit/relative_reference：wrong_judgment_or_identity
- TC0086 audit/lookup_exact：wrong_judgment_or_identity
- TC0087 audit/lookup_exact：wrong_judgment_or_identity
- TC0088 audit/lookup_exact：wrong_judgment_or_identity
- TC0089 audit/lookup_exact：wrong_judgment_or_identity
- TC0090 audit/lookup_exact：wrong_judgment_or_identity
- TC0096 audit/lookup_column：wrong_judgment_or_identity
- TC0097 audit/lookup_column：wrong_judgment_or_identity
- TC0098 audit/lookup_column：wrong_judgment_or_identity
- TC0099 audit/lookup_column：wrong_judgment_or_identity
- TC0100 audit/lookup_column：wrong_judgment_or_identity
- TC0106 audit/if_boundary：wrong_judgment_or_identity
- TC0107 audit/if_boundary：wrong_judgment_or_identity
- TC0108 audit/if_boundary：wrong_judgment_or_identity
- TC0109 audit/if_boundary：wrong_judgment_or_identity
- TC0110 audit/if_boundary：wrong_judgment_or_identity
- TC0119 audit/text_number：wrong_judgment_or_identity
- TC0120 audit/text_number：wrong_judgment_or_identity
- TC0130 audit/duplicate_total：wrong_judgment_or_identity
- TC0136 audit/sign：wrong_judgment_or_identity
- TC0137 audit/sign：wrong_judgment_or_identity
- TC0138 audit/sign：wrong_judgment_or_identity
- TC0139 audit/sign：wrong_judgment_or_identity
- TC0140 audit/sign：wrong_judgment_or_identity
- TC0146 audit/date_order：wrong_judgment_or_identity
- TC0147 audit/date_order：wrong_judgment_or_identity
- TC0148 audit/date_order：wrong_judgment_or_identity
- TC0149 audit/date_order：wrong_judgment_or_identity
- TC0150 audit/date_order：wrong_judgment_or_identity
- TC0156 audit/rounding：wrong_judgment_or_identity
- TC0157 audit/rounding：wrong_judgment_or_identity
- TC0158 audit/rounding：wrong_judgment_or_identity
- TC0159 audit/rounding：wrong_judgment_or_identity
- TC0160 audit/rounding：wrong_judgment_or_identity
- TC0166 audit/count：wrong_judgment_or_identity
- TC0167 audit/count：wrong_judgment_or_identity
- TC0168 audit/count：wrong_judgment_or_identity
- TC0169 audit/count：wrong_judgment_or_identity
- TC0170 audit/count：wrong_judgment_or_identity
- TC0176 audit/iferror：wrong_judgment_or_identity
- TC0177 audit/iferror：wrong_judgment_or_identity
- TC0178 audit/iferror：wrong_judgment_or_identity
- TC0179 audit/iferror：wrong_judgment_or_identity
- TC0180 audit/iferror：wrong_judgment_or_identity
- TC0187 pii/phone_cn：missed_extra_or_wrong_pii
- TC0188 pii/phone_cn：missed_extra_or_wrong_pii
- TC0189 pii/phone_cn：missed_extra_or_wrong_pii
- TC0190 pii/phone_cn：missed_extra_or_wrong_pii
- TC0192 pii/phone_us：missed_extra_or_wrong_pii
- TC0195 pii/phone_us：missed_extra_or_wrong_pii
- TC0196 pii/ssn：missed_extra_or_wrong_pii
- TC0197 pii/ssn：missed_extra_or_wrong_pii
- TC0203 pii/credit_card：missed_extra_or_wrong_pii
- TC0211 pii/iban：missed_extra_or_wrong_pii
- TC0212 pii/iban：missed_extra_or_wrong_pii
- TC0214 pii/iban：missed_extra_or_wrong_pii
- TC0233 pii/credit_card_spaced：missed_extra_or_wrong_pii
- TC0234 pii/credit_card_spaced：missed_extra_or_wrong_pii
- TC0257 pii/mixed_pii：missed_extra_or_wrong_pii
- TC0311 pii/invalid_ssn：missed_extra_or_wrong_pii
- TC0312 pii/invalid_ssn：missed_extra_or_wrong_pii
- TC0313 pii/invalid_ssn：missed_extra_or_wrong_pii
- TC0314 pii/invalid_ssn：missed_extra_or_wrong_pii
- TC0315 pii/invalid_ssn：missed_extra_or_wrong_pii
- TC0316 pii/invalid_card：missed_extra_or_wrong_pii
- TC0317 pii/invalid_card：missed_extra_or_wrong_pii
- TC0318 pii/invalid_card：missed_extra_or_wrong_pii
- TC0319 pii/invalid_card：missed_extra_or_wrong_pii
- TC0320 pii/invalid_card：missed_extra_or_wrong_pii
- TC0321 pii/invalid_cn_id：missed_extra_or_wrong_pii
- TC0322 pii/invalid_cn_id：missed_extra_or_wrong_pii
- TC0323 pii/invalid_cn_id：missed_extra_or_wrong_pii
- TC0324 pii/invalid_cn_id：missed_extra_or_wrong_pii
- TC0325 pii/invalid_cn_id：missed_extra_or_wrong_pii
- TC0441 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0442 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0443 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0444 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0445 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
