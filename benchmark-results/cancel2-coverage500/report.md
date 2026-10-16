# cellsentry-cancel2 本地模型 500 用例测试

已执行 500/500；严格通过 365。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|180|164 (91.1%)|164|180|180|0.499|
|extraction|160|124 (77.5%)|134|139|129|1.132|
|pii|160|77 (48.1%)|77|102|92|0.48|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
本轮使用独立指定的合成测试集；任务定义及生成来源见对应数据 manifest。各分割共享生成逻辑，不代表独立真实业务准确率。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- TC0046 audit/average_total：wrong_judgment_or_identity
- TC0047 audit/average_total：wrong_judgment_or_identity
- TC0048 audit/average_total：wrong_judgment_or_identity
- TC0049 audit/average_total：wrong_judgment_or_identity
- TC0050 audit/average_total：wrong_judgment_or_identity
- TC0061 audit/absolute_reference：wrong_judgment_or_identity
- TC0062 audit/absolute_reference：wrong_judgment_or_identity
- TC0063 audit/absolute_reference：wrong_judgment_or_identity
- TC0064 audit/absolute_reference：wrong_judgment_or_identity
- TC0065 audit/absolute_reference：wrong_judgment_or_identity
- TC0101 audit/if_boundary：wrong_judgment_or_identity
- TC0103 audit/if_boundary：wrong_judgment_or_identity
- TC0104 audit/if_boundary：wrong_judgment_or_identity
- TC0105 audit/if_boundary：wrong_judgment_or_identity
- TC0166 audit/count：wrong_judgment_or_identity
- TC0168 audit/count：wrong_judgment_or_identity
- TC0186 pii/phone_cn：invalid_json
- TC0187 pii/phone_cn：invalid_json
- TC0188 pii/phone_cn：invalid_json
- TC0189 pii/phone_cn：invalid_json
- TC0190 pii/phone_cn：invalid_json
- TC0192 pii/phone_us：missed_extra_or_wrong_pii, invalid_schema
- TC0195 pii/phone_us：invalid_json
- TC0196 pii/ssn：invalid_json
- TC0197 pii/ssn：invalid_json
- TC0198 pii/ssn：invalid_json, output_truncated
- TC0199 pii/ssn：invalid_json
- TC0200 pii/ssn：invalid_json
- TC0201 pii/credit_card：invalid_json
- TC0202 pii/credit_card：invalid_json
- TC0203 pii/credit_card：invalid_json
- TC0204 pii/credit_card：invalid_json
- TC0205 pii/credit_card：invalid_json
- TC0206 pii/national_id：invalid_json
- TC0207 pii/national_id：invalid_json
- TC0208 pii/national_id：invalid_json
- TC0209 pii/national_id：invalid_json
- TC0210 pii/national_id：invalid_json
- TC0211 pii/iban：missed_extra_or_wrong_pii
- TC0212 pii/iban：invalid_json
- TC0213 pii/iban：invalid_json
- TC0214 pii/iban：invalid_json
- TC0215 pii/iban：missed_extra_or_wrong_pii, invalid_schema
- TC0222 pii/phone_cn_labeled：invalid_json
- TC0226 pii/ssn_labeled：invalid_json
- TC0227 pii/ssn_labeled：invalid_json
- TC0228 pii/ssn_labeled：invalid_json
- TC0229 pii/ssn_labeled：invalid_json
- TC0230 pii/ssn_labeled：invalid_json
- TC0231 pii/credit_card_spaced：invalid_json
- TC0232 pii/credit_card_spaced：invalid_json
- TC0233 pii/credit_card_spaced：invalid_json
- TC0234 pii/credit_card_spaced：invalid_json
- TC0235 pii/credit_card_spaced：invalid_json
- TC0251 pii/multi_email：invalid_json
- TC0252 pii/multi_email：invalid_json
- TC0253 pii/multi_email：missed_extra_or_wrong_pii
- TC0254 pii/multi_email：missed_extra_or_wrong_pii, invalid_schema
- TC0255 pii/multi_email：missed_extra_or_wrong_pii, invalid_schema
- TC0257 pii/mixed_pii：missed_extra_or_wrong_pii
- TC0258 pii/mixed_pii：missed_extra_or_wrong_pii
- TC0259 pii/mixed_pii：missed_extra_or_wrong_pii
- TC0260 pii/mixed_pii：missed_extra_or_wrong_pii
- TC0262 pii/integer：invalid_json
- TC0264 pii/integer：missed_extra_or_wrong_pii, invalid_schema
- TC0265 pii/integer：invalid_json
- TC0286 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0287 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0288 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0289 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0290 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0296 pii/email_no_at：missed_extra_or_wrong_pii
- TC0297 pii/email_no_at：missed_extra_or_wrong_pii
- TC0298 pii/email_no_at：missed_extra_or_wrong_pii
- TC0299 pii/email_no_at：missed_extra_or_wrong_pii
- TC0300 pii/email_no_at：missed_extra_or_wrong_pii
- TC0301 pii/email_no_domain：missed_extra_or_wrong_pii
- TC0302 pii/email_no_domain：missed_extra_or_wrong_pii
- TC0303 pii/email_no_domain：missed_extra_or_wrong_pii
- TC0304 pii/email_no_domain：missed_extra_or_wrong_pii
- TC0305 pii/email_no_domain：invalid_json
- TC0306 pii/short_phone：invalid_json
- TC0307 pii/short_phone：invalid_json
- TC0310 pii/short_phone：invalid_json
- TC0311 pii/invalid_ssn：invalid_json
- TC0312 pii/invalid_ssn：invalid_json
- TC0313 pii/invalid_ssn：invalid_json
- TC0314 pii/invalid_ssn：invalid_json
- TC0315 pii/invalid_ssn：invalid_json
- TC0316 pii/invalid_card：invalid_json
- TC0317 pii/invalid_card：invalid_json
- TC0318 pii/invalid_card：invalid_json
- TC0319 pii/invalid_card：invalid_json
- TC0320 pii/invalid_card：invalid_json
- TC0321 pii/invalid_cn_id：invalid_json
- TC0322 pii/invalid_cn_id：invalid_json
- TC0323 pii/invalid_cn_id：invalid_json
- TC0324 pii/invalid_cn_id：invalid_json
- TC0325 pii/invalid_cn_id：invalid_json
- TC0369 extraction/invoice/reordered：invalid_json
- TC0441 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0442 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0443 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0444 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0445 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0456 extraction/expense_report/reordered：invalid_json
- TC0457 extraction/expense_report/reordered：invalid_json
- TC0458 extraction/expense_report/reordered：invalid_json
- TC0459 extraction/expense_report/reordered：invalid_json
- TC0460 extraction/expense_report/reordered：invalid_json
- TC0461 extraction/payroll/horizontal：invalid_json
- TC0462 extraction/payroll/horizontal：invalid_json
- TC0463 extraction/payroll/horizontal：invalid_json
- TC0464 extraction/payroll/horizontal：invalid_json
- TC0465 extraction/payroll/horizontal：invalid_json
- TC0471 extraction/payroll/chinese：invalid_schema
- TC0472 extraction/payroll/chinese：invalid_schema
- TC0473 extraction/payroll/chinese：invalid_schema
- TC0474 extraction/payroll/chinese：invalid_schema
- TC0475 extraction/payroll/chinese：invalid_schema
- TC0476 extraction/payroll/noise：invalid_json
- TC0477 extraction/payroll/noise：invalid_json
- TC0478 extraction/payroll/noise：invalid_json
- TC0479 extraction/payroll/noise：invalid_json
- TC0480 extraction/payroll/noise：invalid_json
- TC0481 extraction/payroll/missing_total：invalid_schema
- TC0482 extraction/payroll/missing_total：invalid_schema
- TC0483 extraction/payroll/missing_total：invalid_schema
- TC0484 extraction/payroll/missing_total：invalid_schema
- TC0485 extraction/payroll/missing_total：invalid_schema
- TC0486 extraction/payroll/reordered：invalid_json
- TC0487 extraction/payroll/reordered：invalid_json
- TC0488 extraction/payroll/reordered：invalid_json
- TC0489 extraction/payroll/reordered：invalid_json
- TC0490 extraction/payroll/reordered：invalid_json
