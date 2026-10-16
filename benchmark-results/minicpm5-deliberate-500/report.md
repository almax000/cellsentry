# MiniCPM5-2B-Q4_K_M 本地模型 500 用例测试

已执行 500/500；严格通过 66。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=1.0，seed=42，max_tokens=4096，context=8192；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|180|0 (0.0%)|0|152|147|3.929|
|extraction|160|22 (13.8%)|23|23|22|4.489|
|pii|160|44 (27.5%)|44|52|52|5.056|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
测试集包含 18 种公式场景的正反例、32 类 PII 场景以及 5 种单据的 6 种布局和未知文档。每类有 5 个变体；部分变体共享结构，不能视为 500 个独立业务场景。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- TC0001 audit/division_zero：wrong_judgment_or_identity
- TC0002 audit/division_zero：wrong_judgment_or_identity
- TC0003 audit/division_zero：wrong_judgment_or_identity
- TC0004 audit/division_zero：wrong_judgment_or_identity
- TC0005 audit/division_zero：wrong_judgment_or_identity
- TC0006 audit/division_zero：wrong_judgment_or_identity
- TC0007 audit/division_zero：wrong_judgment_or_identity
- TC0008 audit/division_zero：wrong_judgment_or_identity
- TC0009 audit/division_zero：wrong_judgment_or_identity
- TC0010 audit/division_zero：invalid_json
- TC0011 audit/self_reference：wrong_judgment_or_identity
- TC0012 audit/self_reference：wrong_judgment_or_identity
- TC0013 audit/self_reference：wrong_judgment_or_identity
- TC0014 audit/self_reference：wrong_judgment_or_identity
- TC0015 audit/self_reference：wrong_judgment_or_identity
- TC0016 audit/self_reference：wrong_judgment_or_identity
- TC0017 audit/self_reference：wrong_judgment_or_identity
- TC0018 audit/self_reference：wrong_judgment_or_identity
- TC0019 audit/self_reference：wrong_judgment_or_identity
- TC0020 audit/self_reference：invalid_json
- TC0021 audit/broken_reference：invalid_json
- TC0022 audit/broken_reference：wrong_judgment_or_identity
- TC0023 audit/broken_reference：wrong_judgment_or_identity
- TC0024 audit/broken_reference：invalid_json
- TC0025 audit/broken_reference：wrong_judgment_or_identity
- TC0026 audit/broken_reference：invalid_json
- TC0027 audit/broken_reference：wrong_judgment_or_identity
- TC0028 audit/broken_reference：wrong_judgment_or_identity
- TC0029 audit/broken_reference：wrong_judgment_or_identity
- TC0030 audit/broken_reference：wrong_judgment_or_identity
- TC0031 audit/sum_range：wrong_judgment_or_identity
- TC0032 audit/sum_range：wrong_judgment_or_identity
- TC0033 audit/sum_range：invalid_json
- TC0034 audit/sum_range：wrong_judgment_or_identity
- TC0035 audit/sum_range：wrong_judgment_or_identity
- TC0036 audit/sum_range：wrong_judgment_or_identity
- TC0037 audit/sum_range：invalid_json
- TC0038 audit/sum_range：invalid_json
- TC0039 audit/sum_range：wrong_judgment_or_identity
- TC0040 audit/sum_range：wrong_judgment_or_identity
- TC0041 audit/average_total：wrong_judgment_or_identity
- TC0042 audit/average_total：wrong_judgment_or_identity
- TC0043 audit/average_total：wrong_judgment_or_identity
- TC0044 audit/average_total：wrong_judgment_or_identity
- TC0045 audit/average_total：wrong_judgment_or_identity
- TC0046 audit/average_total：wrong_judgment_or_identity
- TC0047 audit/average_total：invalid_json
- TC0048 audit/average_total：wrong_judgment_or_identity, invalid_schema
- TC0049 audit/average_total：wrong_judgment_or_identity
- TC0050 audit/average_total：wrong_judgment_or_identity
- TC0051 audit/percent_scale：wrong_judgment_or_identity
- TC0052 audit/percent_scale：wrong_judgment_or_identity
- TC0053 audit/percent_scale：wrong_judgment_or_identity
- TC0054 audit/percent_scale：wrong_judgment_or_identity
- TC0055 audit/percent_scale：wrong_judgment_or_identity
- TC0056 audit/percent_scale：wrong_judgment_or_identity
- TC0057 audit/percent_scale：wrong_judgment_or_identity
- TC0058 audit/percent_scale：wrong_judgment_or_identity
- TC0059 audit/percent_scale：wrong_judgment_or_identity
- TC0060 audit/percent_scale：invalid_json
- TC0061 audit/absolute_reference：wrong_judgment_or_identity
- TC0062 audit/absolute_reference：wrong_judgment_or_identity
- TC0063 audit/absolute_reference：invalid_json
- TC0064 audit/absolute_reference：wrong_judgment_or_identity
- TC0065 audit/absolute_reference：wrong_judgment_or_identity
- TC0066 audit/absolute_reference：invalid_json
- TC0067 audit/absolute_reference：invalid_json
- TC0068 audit/absolute_reference：invalid_json
- TC0069 audit/absolute_reference：wrong_judgment_or_identity
- TC0070 audit/absolute_reference：wrong_judgment_or_identity
- TC0071 audit/relative_reference：wrong_judgment_or_identity
- TC0072 audit/relative_reference：wrong_judgment_or_identity
- TC0073 audit/relative_reference：wrong_judgment_or_identity
- TC0074 audit/relative_reference：wrong_judgment_or_identity
- TC0075 audit/relative_reference：wrong_judgment_or_identity
- TC0076 audit/relative_reference：wrong_judgment_or_identity
- TC0077 audit/relative_reference：wrong_judgment_or_identity
- TC0078 audit/relative_reference：wrong_judgment_or_identity
- TC0079 audit/relative_reference：wrong_judgment_or_identity
- TC0080 audit/relative_reference：wrong_judgment_or_identity, invalid_schema
- TC0081 audit/lookup_exact：wrong_judgment_or_identity
- TC0082 audit/lookup_exact：wrong_judgment_or_identity
- TC0083 audit/lookup_exact：wrong_judgment_or_identity
- TC0084 audit/lookup_exact：wrong_judgment_or_identity
- TC0085 audit/lookup_exact：wrong_judgment_or_identity
- TC0086 audit/lookup_exact：wrong_judgment_or_identity
- TC0087 audit/lookup_exact：wrong_judgment_or_identity
- TC0088 audit/lookup_exact：wrong_judgment_or_identity
- TC0089 audit/lookup_exact：wrong_judgment_or_identity
- TC0090 audit/lookup_exact：wrong_judgment_or_identity
- TC0091 audit/lookup_column：wrong_judgment_or_identity
- TC0092 audit/lookup_column：wrong_judgment_or_identity
- TC0093 audit/lookup_column：invalid_json
- TC0094 audit/lookup_column：wrong_judgment_or_identity
- TC0095 audit/lookup_column：wrong_judgment_or_identity
- TC0096 audit/lookup_column：wrong_judgment_or_identity
- TC0097 audit/lookup_column：wrong_judgment_or_identity
- TC0098 audit/lookup_column：wrong_judgment_or_identity
- TC0099 audit/lookup_column：wrong_judgment_or_identity
- TC0100 audit/lookup_column：wrong_judgment_or_identity
- TC0101 audit/if_boundary：wrong_judgment_or_identity
- TC0102 audit/if_boundary：wrong_judgment_or_identity
- TC0103 audit/if_boundary：invalid_json
- TC0104 audit/if_boundary：wrong_judgment_or_identity
- TC0105 audit/if_boundary：wrong_judgment_or_identity, invalid_schema
- TC0106 audit/if_boundary：wrong_judgment_or_identity
- TC0107 audit/if_boundary：wrong_judgment_or_identity
- TC0108 audit/if_boundary：wrong_judgment_or_identity
- TC0109 audit/if_boundary：invalid_json
- TC0110 audit/if_boundary：wrong_judgment_or_identity
- TC0111 audit/text_number：wrong_judgment_or_identity
- TC0112 audit/text_number：invalid_json
- TC0113 audit/text_number：wrong_judgment_or_identity
- TC0114 audit/text_number：wrong_judgment_or_identity
- TC0115 audit/text_number：wrong_judgment_or_identity
- TC0116 audit/text_number：wrong_judgment_or_identity
- TC0117 audit/text_number：wrong_judgment_or_identity
- TC0118 audit/text_number：wrong_judgment_or_identity
- TC0119 audit/text_number：invalid_json
- TC0120 audit/text_number：invalid_json
- TC0121 audit/duplicate_total：wrong_judgment_or_identity
- TC0122 audit/duplicate_total：wrong_judgment_or_identity
- TC0123 audit/duplicate_total：wrong_judgment_or_identity, invalid_schema
- TC0124 audit/duplicate_total：wrong_judgment_or_identity
- TC0125 audit/duplicate_total：wrong_judgment_or_identity
- TC0126 audit/duplicate_total：wrong_judgment_or_identity
- TC0127 audit/duplicate_total：wrong_judgment_or_identity
- TC0128 audit/duplicate_total：wrong_judgment_or_identity, invalid_schema
- TC0129 audit/duplicate_total：wrong_judgment_or_identity
- TC0130 audit/duplicate_total：wrong_judgment_or_identity
- TC0131 audit/sign：wrong_judgment_or_identity
- TC0132 audit/sign：wrong_judgment_or_identity
- TC0133 audit/sign：wrong_judgment_or_identity
- TC0134 audit/sign：invalid_json
- TC0135 audit/sign：wrong_judgment_or_identity
- TC0136 audit/sign：wrong_judgment_or_identity
- TC0137 audit/sign：invalid_json
- TC0138 audit/sign：wrong_judgment_or_identity
- TC0139 audit/sign：wrong_judgment_or_identity
- TC0140 audit/sign：wrong_judgment_or_identity
- TC0141 audit/date_order：invalid_json
- TC0142 audit/date_order：wrong_judgment_or_identity
- TC0143 audit/date_order：wrong_judgment_or_identity
- TC0144 audit/date_order：wrong_judgment_or_identity
- TC0145 audit/date_order：wrong_judgment_or_identity
- TC0146 audit/date_order：wrong_judgment_or_identity
- TC0147 audit/date_order：wrong_judgment_or_identity
- TC0148 audit/date_order：wrong_judgment_or_identity
- TC0149 audit/date_order：wrong_judgment_or_identity
- TC0150 audit/date_order：wrong_judgment_or_identity
- TC0151 audit/rounding：wrong_judgment_or_identity
- TC0152 audit/rounding：wrong_judgment_or_identity
- TC0153 audit/rounding：invalid_json
- TC0154 audit/rounding：wrong_judgment_or_identity
- TC0155 audit/rounding：wrong_judgment_or_identity
- TC0156 audit/rounding：wrong_judgment_or_identity
- TC0157 audit/rounding：invalid_json
- TC0158 audit/rounding：wrong_judgment_or_identity
- TC0159 audit/rounding：wrong_judgment_or_identity
- TC0160 audit/rounding：wrong_judgment_or_identity
- TC0161 audit/count：wrong_judgment_or_identity
- TC0162 audit/count：wrong_judgment_or_identity
- TC0163 audit/count：wrong_judgment_or_identity
- TC0164 audit/count：wrong_judgment_or_identity
- TC0165 audit/count：wrong_judgment_or_identity
- TC0166 audit/count：wrong_judgment_or_identity
- TC0167 audit/count：wrong_judgment_or_identity
- TC0168 audit/count：wrong_judgment_or_identity
- TC0169 audit/count：wrong_judgment_or_identity
- TC0170 audit/count：wrong_judgment_or_identity
- TC0171 audit/iferror：wrong_judgment_or_identity
- TC0172 audit/iferror：wrong_judgment_or_identity
- TC0173 audit/iferror：wrong_judgment_or_identity
- TC0174 audit/iferror：invalid_json
- TC0175 audit/iferror：wrong_judgment_or_identity
- TC0176 audit/iferror：wrong_judgment_or_identity
- TC0177 audit/iferror：wrong_judgment_or_identity
- TC0178 audit/iferror：invalid_json
- TC0179 audit/iferror：invalid_json
- TC0180 audit/iferror：wrong_judgment_or_identity
- TC0181 pii/email：invalid_json
- TC0182 pii/email：invalid_json
- TC0183 pii/email：invalid_json
- TC0184 pii/email：invalid_json
- TC0185 pii/email：invalid_json
- TC0186 pii/phone_cn：invalid_json
- TC0187 pii/phone_cn：missed_extra_or_wrong_pii
- TC0188 pii/phone_cn：missed_extra_or_wrong_pii
- TC0189 pii/phone_cn：missed_extra_or_wrong_pii
- TC0190 pii/phone_cn：invalid_json
- TC0191 pii/phone_us：invalid_json
- TC0192 pii/phone_us：invalid_json
- TC0193 pii/phone_us：invalid_json
- TC0194 pii/phone_us：invalid_json
- TC0195 pii/phone_us：invalid_json
- TC0196 pii/ssn：invalid_json
- TC0197 pii/ssn：invalid_json
- TC0198 pii/ssn：invalid_json
- TC0199 pii/ssn：invalid_json
- TC0200 pii/ssn：invalid_json
- TC0201 pii/credit_card：invalid_json
- TC0202 pii/credit_card：missed_extra_or_wrong_pii
- TC0203 pii/credit_card：invalid_json
- TC0204 pii/credit_card：invalid_json
- TC0205 pii/credit_card：invalid_json
- TC0206 pii/national_id：invalid_json
- TC0207 pii/national_id：missed_extra_or_wrong_pii
- TC0208 pii/national_id：missed_extra_or_wrong_pii
- TC0209 pii/national_id：missed_extra_or_wrong_pii
- TC0210 pii/national_id：invalid_json
- TC0211 pii/iban：invalid_json
- TC0212 pii/iban：invalid_json
- TC0213 pii/iban：invalid_json
- TC0214 pii/iban：invalid_json
- TC0215 pii/iban：invalid_json
- TC0216 pii/email_embedded：invalid_json
- TC0217 pii/email_embedded：invalid_json
- TC0218 pii/email_embedded：invalid_json
- TC0219 pii/email_embedded：invalid_json
- TC0220 pii/email_embedded：invalid_json
- TC0221 pii/phone_cn_labeled：invalid_json
- TC0222 pii/phone_cn_labeled：invalid_json
- TC0223 pii/phone_cn_labeled：invalid_json
- TC0224 pii/phone_cn_labeled：invalid_json
- TC0225 pii/phone_cn_labeled：invalid_json
- TC0226 pii/ssn_labeled：invalid_json
- TC0227 pii/ssn_labeled：invalid_json
- TC0228 pii/ssn_labeled：invalid_json
- TC0229 pii/ssn_labeled：invalid_json
- TC0230 pii/ssn_labeled：invalid_json
- TC0231 pii/credit_card_spaced：invalid_json
- TC0232 pii/credit_card_spaced：invalid_json
- TC0233 pii/credit_card_spaced：invalid_json, output_truncated
- TC0234 pii/credit_card_spaced：invalid_json
- TC0235 pii/credit_card_spaced：invalid_json
- TC0236 pii/passport：invalid_json
- TC0237 pii/passport：invalid_json
- TC0238 pii/passport：invalid_json
- TC0240 pii/passport：invalid_json
- TC0241 pii/phone_in_sentence：invalid_json
- TC0242 pii/phone_in_sentence：invalid_json
- TC0243 pii/phone_in_sentence：invalid_json
- TC0244 pii/phone_in_sentence：invalid_json
- TC0245 pii/phone_in_sentence：invalid_json
- TC0246 pii/national_id_labeled：invalid_json
- TC0247 pii/national_id_labeled：invalid_json
- TC0248 pii/national_id_labeled：invalid_json
- TC0249 pii/national_id_labeled：invalid_json
- TC0250 pii/national_id_labeled：missed_extra_or_wrong_pii
- TC0251 pii/multi_email：invalid_json
- TC0252 pii/multi_email：invalid_json
- TC0253 pii/multi_email：invalid_json
- TC0254 pii/multi_email：invalid_json
- TC0255 pii/multi_email：invalid_json
- TC0256 pii/mixed_pii：invalid_json
- TC0257 pii/mixed_pii：invalid_json
- TC0258 pii/mixed_pii：invalid_json
- TC0259 pii/mixed_pii：invalid_json
- TC0260 pii/mixed_pii：invalid_json
- TC0263 pii/integer：invalid_json
- TC0264 pii/integer：invalid_json
- TC0265 pii/integer：invalid_json
- TC0269 pii/decimal：invalid_json
- TC0271 pii/date：invalid_json
- TC0275 pii/date：invalid_json
- TC0277 pii/sku：invalid_json
- TC0286 pii/empty：invalid_json
- TC0289 pii/empty：invalid_json
- TC0290 pii/empty：invalid_json
- TC0296 pii/email_no_at：invalid_json
- TC0301 pii/email_no_domain：invalid_json
- TC0302 pii/email_no_domain：invalid_json
- TC0303 pii/email_no_domain：invalid_json
- TC0304 pii/email_no_domain：invalid_json
- TC0305 pii/email_no_domain：invalid_json
- TC0306 pii/short_phone：invalid_json
- TC0307 pii/short_phone：invalid_json
- TC0308 pii/short_phone：invalid_json
- TC0310 pii/short_phone：invalid_json
- TC0313 pii/invalid_ssn：invalid_json
- TC0314 pii/invalid_ssn：invalid_json
- TC0315 pii/invalid_ssn：invalid_json
- TC0316 pii/invalid_card：invalid_json
- TC0317 pii/invalid_card：invalid_json
- TC0318 pii/invalid_card：invalid_json, output_truncated
- TC0319 pii/invalid_card：invalid_json
- TC0320 pii/invalid_card：invalid_json
- TC0321 pii/invalid_cn_id：invalid_json
- TC0322 pii/invalid_cn_id：invalid_json
- TC0323 pii/invalid_cn_id：invalid_json
- TC0324 pii/invalid_cn_id：invalid_json, output_truncated
- TC0325 pii/invalid_cn_id：invalid_json
- TC0326 pii/version：invalid_json
- TC0327 pii/version：invalid_json
- TC0330 pii/version：invalid_json
- TC0337 pii/injection：invalid_json
- TC0341 extraction/invoice/horizontal：invalid_json
- TC0342 extraction/invoice/horizontal：invalid_json
- TC0343 extraction/invoice/horizontal：invalid_json
- TC0344 extraction/invoice/horizontal：invalid_json
- TC0346 extraction/invoice/vertical：invalid_json
- TC0347 extraction/invoice/vertical：invalid_json
- TC0349 extraction/invoice/vertical：invalid_json
- TC0350 extraction/invoice/vertical：invalid_json
- TC0351 extraction/invoice/chinese：invalid_json
- TC0352 extraction/invoice/chinese：invalid_json
- TC0353 extraction/invoice/chinese：invalid_json
- TC0355 extraction/invoice/chinese：invalid_json
- TC0356 extraction/invoice/noise：invalid_json
- TC0358 extraction/invoice/noise：invalid_json
- TC0359 extraction/invoice/noise：invalid_json
- TC0360 extraction/invoice/noise：invalid_json
- TC0361 extraction/invoice/missing_total：invalid_json
- TC0363 extraction/invoice/missing_total：invalid_json
- TC0365 extraction/invoice/missing_total：invalid_json
- TC0366 extraction/invoice/reordered：invalid_json
- TC0367 extraction/invoice/reordered：invalid_json
- TC0368 extraction/invoice/reordered：invalid_json
- TC0369 extraction/invoice/reordered：invalid_json
- TC0370 extraction/invoice/reordered：invalid_json
- TC0371 extraction/receipt/horizontal：invalid_json
- TC0372 extraction/receipt/horizontal：invalid_json
- TC0373 extraction/receipt/horizontal：invalid_json
- TC0375 extraction/receipt/horizontal：invalid_json
- TC0376 extraction/receipt/vertical：invalid_json
- TC0377 extraction/receipt/vertical：invalid_json
- TC0379 extraction/receipt/vertical：invalid_json
- TC0380 extraction/receipt/vertical：invalid_json
- TC0381 extraction/receipt/chinese：invalid_json
- TC0382 extraction/receipt/chinese：invalid_json
- TC0383 extraction/receipt/chinese：invalid_json
- TC0384 extraction/receipt/chinese：invalid_json
- TC0385 extraction/receipt/chinese：invalid_json
- TC0387 extraction/receipt/noise：invalid_json
- TC0388 extraction/receipt/noise：invalid_json
- TC0389 extraction/receipt/noise：invalid_json
- TC0390 extraction/receipt/noise：invalid_json
- TC0391 extraction/receipt/missing_total：invalid_json
- TC0393 extraction/receipt/missing_total：invalid_json
- TC0395 extraction/receipt/missing_total：invalid_json
- TC0396 extraction/receipt/reordered：invalid_json
- TC0397 extraction/receipt/reordered：invalid_json
- TC0398 extraction/receipt/reordered：invalid_json
- TC0399 extraction/receipt/reordered：invalid_json
- TC0400 extraction/receipt/reordered：invalid_json
- TC0401 extraction/purchase_order/horizontal：invalid_json
- TC0402 extraction/purchase_order/horizontal：invalid_json
- TC0403 extraction/purchase_order/horizontal：invalid_json
- TC0404 extraction/purchase_order/horizontal：invalid_json
- TC0406 extraction/purchase_order/vertical：invalid_json
- TC0408 extraction/purchase_order/vertical：invalid_json
- TC0409 extraction/purchase_order/vertical：invalid_json
- TC0410 extraction/purchase_order/vertical：invalid_json
- TC0411 extraction/purchase_order/chinese：invalid_json
- TC0412 extraction/purchase_order/chinese：invalid_json
- TC0413 extraction/purchase_order/chinese：invalid_json
- TC0414 extraction/purchase_order/chinese：invalid_json
- TC0416 extraction/purchase_order/noise：invalid_json
- TC0417 extraction/purchase_order/noise：invalid_json
- TC0419 extraction/purchase_order/noise：invalid_json
- TC0420 extraction/purchase_order/noise：invalid_json
- TC0421 extraction/purchase_order/missing_total：invalid_json
- TC0422 extraction/purchase_order/missing_total：invalid_json
- TC0423 extraction/purchase_order/missing_total：invalid_json
- TC0424 extraction/purchase_order/missing_total：invalid_json
- TC0425 extraction/purchase_order/missing_total：invalid_json
- TC0426 extraction/purchase_order/reordered：invalid_json
- TC0427 extraction/purchase_order/reordered：invalid_json
- TC0428 extraction/purchase_order/reordered：invalid_json
- TC0429 extraction/purchase_order/reordered：invalid_json
- TC0430 extraction/purchase_order/reordered：invalid_json
- TC0431 extraction/expense_report/horizontal：invalid_json
- TC0432 extraction/expense_report/horizontal：invalid_json
- TC0433 extraction/expense_report/horizontal：invalid_json
- TC0435 extraction/expense_report/horizontal：invalid_json
- TC0436 extraction/expense_report/vertical：invalid_json
- TC0437 extraction/expense_report/vertical：invalid_json
- TC0438 extraction/expense_report/vertical：invalid_json
- TC0439 extraction/expense_report/vertical：invalid_json
- TC0440 extraction/expense_report/vertical：invalid_json
- TC0441 extraction/expense_report/chinese：invalid_json
- TC0442 extraction/expense_report/chinese：invalid_json
- TC0443 extraction/expense_report/chinese：invalid_json
- TC0444 extraction/expense_report/chinese：invalid_json
- TC0445 extraction/expense_report/chinese：invalid_json
- TC0446 extraction/expense_report/noise：invalid_json
- TC0447 extraction/expense_report/noise：invalid_json
- TC0448 extraction/expense_report/noise：invalid_json
- TC0449 extraction/expense_report/noise：invalid_json
- TC0451 extraction/expense_report/missing_total：invalid_json
- TC0452 extraction/expense_report/missing_total：invalid_json
- TC0454 extraction/expense_report/missing_total：invalid_json
- TC0455 extraction/expense_report/missing_total：invalid_json
- TC0457 extraction/expense_report/reordered：invalid_json
- TC0458 extraction/expense_report/reordered：invalid_json
- TC0459 extraction/expense_report/reordered：invalid_json
- TC0460 extraction/expense_report/reordered：invalid_json
- TC0462 extraction/payroll/horizontal：invalid_json
- TC0465 extraction/payroll/horizontal：invalid_json
- TC0466 extraction/payroll/vertical：invalid_json
- TC0467 extraction/payroll/vertical：invalid_json
- TC0468 extraction/payroll/vertical：invalid_json
- TC0469 extraction/payroll/vertical：invalid_json
- TC0470 extraction/payroll/vertical：invalid_json
- TC0471 extraction/payroll/chinese：invalid_json
- TC0472 extraction/payroll/chinese：invalid_json
- TC0473 extraction/payroll/chinese：invalid_json
- TC0474 extraction/payroll/chinese：invalid_json
- TC0475 extraction/payroll/chinese：invalid_json
- TC0476 extraction/payroll/noise：invalid_json
- TC0477 extraction/payroll/noise：invalid_schema
- TC0478 extraction/payroll/noise：invalid_json
- TC0479 extraction/payroll/noise：invalid_json
- TC0480 extraction/payroll/noise：invalid_json
- TC0481 extraction/payroll/missing_total：invalid_json
- TC0482 extraction/payroll/missing_total：invalid_json
- TC0483 extraction/payroll/missing_total：invalid_json
- TC0484 extraction/payroll/missing_total：invalid_json
- TC0485 extraction/payroll/missing_total：invalid_json
- TC0486 extraction/payroll/reordered：invalid_json
- TC0487 extraction/payroll/reordered：invalid_json
- TC0488 extraction/payroll/reordered：invalid_json
- TC0489 extraction/payroll/reordered：invalid_json
- TC0490 extraction/payroll/reordered：invalid_json
- TC0491 extraction/unknown/ordinary_notes：invalid_json
- TC0492 extraction/unknown/ordinary_notes：invalid_json
- TC0493 extraction/unknown/ordinary_notes：invalid_json
- TC0494 extraction/unknown/ordinary_notes：invalid_json
- TC0495 extraction/unknown/ordinary_notes：invalid_json
- TC0496 extraction/unknown/injection：invalid_json
- TC0497 extraction/unknown/injection：invalid_json
- TC0498 extraction/unknown/injection：invalid_json
- TC0499 extraction/unknown/injection：invalid_json
- TC0500 extraction/unknown/injection：invalid_json

## 公式真假判断诊断（不替代严格通过率）

忽略规则 ID、地址和置信度等字段，仅检查唯一一条输出中的布尔判断：141/180（78.3%）。

TP=73，TN=68，FP=2，FN=4，无法评分=33。

唯一布尔输出中有 147 条改写了地址或规则 ID。错误请求 0；输出截断 3。
请求耗时合计 2234.376 秒，中位 3.7345 秒，P95 10.702 秒。

## 表达格式诊断（不修改严格评分）

仅允许移除包住整个回答的 Markdown JSON 围栏，不修复 JSON。公式只看唯一布尔判断；PII 和提取仍要求业务结果完全匹配，但忽略置信度等协议字段。

|任务|内容正确|移除围栏条数|
|---|---:|---:|
|audit|142/180 (78.9%)|1|
|pii|58/160 (36.2%)|21|
|extraction|26/160 (16.2%)|3|

## 唯一 JSON 片段诊断（不修改严格评分）

只在最终答案中定位完整 JSON，忽略周围文字；不修复 JSON、不改字段、不使用思考文本。不同的多个候选结果视为歧义；完全相同的重复结果去重。候选选择仅按任务输出形状，不按金标准挑答案。公式只看唯一布尔判断；另外两项仍检查业务字段。

|任务|内容正确|找到唯一 JSON|多个不同候选|
|---|---:|---:|---:|
|audit|145/180 (80.6%)|151|0|
|pii|106/160 (66.2%)|133|0|
|extraction|118/160 (73.8%)|122|0|
