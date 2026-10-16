# MiniCPM5-2B-Q4_K_M 本地模型 500 用例测试

已执行 500/500；严格通过 193。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|180|0 (0.0%)|0|172|172|0.409|
|extraction|160|129 (80.6%)|133|143|139|0.64|
|pii|160|64 (40.0%)|64|65|64|0.273|

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
- TC0010 audit/division_zero：wrong_judgment_or_identity
- TC0011 audit/self_reference：wrong_judgment_or_identity
- TC0012 audit/self_reference：wrong_judgment_or_identity
- TC0013 audit/self_reference：wrong_judgment_or_identity
- TC0014 audit/self_reference：invalid_json
- TC0015 audit/self_reference：wrong_judgment_or_identity
- TC0016 audit/self_reference：wrong_judgment_or_identity
- TC0017 audit/self_reference：wrong_judgment_or_identity
- TC0018 audit/self_reference：wrong_judgment_or_identity
- TC0019 audit/self_reference：invalid_json
- TC0020 audit/self_reference：wrong_judgment_or_identity
- TC0021 audit/broken_reference：wrong_judgment_or_identity
- TC0022 audit/broken_reference：wrong_judgment_or_identity
- TC0023 audit/broken_reference：wrong_judgment_or_identity
- TC0024 audit/broken_reference：wrong_judgment_or_identity
- TC0025 audit/broken_reference：wrong_judgment_or_identity
- TC0026 audit/broken_reference：wrong_judgment_or_identity
- TC0027 audit/broken_reference：wrong_judgment_or_identity
- TC0028 audit/broken_reference：wrong_judgment_or_identity
- TC0029 audit/broken_reference：invalid_json
- TC0030 audit/broken_reference：wrong_judgment_or_identity
- TC0031 audit/sum_range：wrong_judgment_or_identity
- TC0032 audit/sum_range：wrong_judgment_or_identity
- TC0033 audit/sum_range：wrong_judgment_or_identity
- TC0034 audit/sum_range：wrong_judgment_or_identity
- TC0035 audit/sum_range：wrong_judgment_or_identity
- TC0036 audit/sum_range：wrong_judgment_or_identity
- TC0037 audit/sum_range：wrong_judgment_or_identity
- TC0038 audit/sum_range：wrong_judgment_or_identity
- TC0039 audit/sum_range：wrong_judgment_or_identity
- TC0040 audit/sum_range：wrong_judgment_or_identity
- TC0041 audit/average_total：wrong_judgment_or_identity
- TC0042 audit/average_total：wrong_judgment_or_identity
- TC0043 audit/average_total：wrong_judgment_or_identity
- TC0044 audit/average_total：wrong_judgment_or_identity
- TC0045 audit/average_total：wrong_judgment_or_identity
- TC0046 audit/average_total：wrong_judgment_or_identity
- TC0047 audit/average_total：wrong_judgment_or_identity
- TC0048 audit/average_total：wrong_judgment_or_identity
- TC0049 audit/average_total：wrong_judgment_or_identity
- TC0050 audit/average_total：wrong_judgment_or_identity
- TC0051 audit/percent_scale：wrong_judgment_or_identity
- TC0052 audit/percent_scale：wrong_judgment_or_identity
- TC0053 audit/percent_scale：wrong_judgment_or_identity
- TC0054 audit/percent_scale：invalid_json
- TC0055 audit/percent_scale：wrong_judgment_or_identity
- TC0056 audit/percent_scale：wrong_judgment_or_identity
- TC0057 audit/percent_scale：wrong_judgment_or_identity
- TC0058 audit/percent_scale：wrong_judgment_or_identity
- TC0059 audit/percent_scale：wrong_judgment_or_identity
- TC0060 audit/percent_scale：invalid_json
- TC0061 audit/absolute_reference：wrong_judgment_or_identity
- TC0062 audit/absolute_reference：wrong_judgment_or_identity
- TC0063 audit/absolute_reference：wrong_judgment_or_identity
- TC0064 audit/absolute_reference：wrong_judgment_or_identity
- TC0065 audit/absolute_reference：wrong_judgment_or_identity
- TC0066 audit/absolute_reference：wrong_judgment_or_identity
- TC0067 audit/absolute_reference：wrong_judgment_or_identity
- TC0068 audit/absolute_reference：wrong_judgment_or_identity
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
- TC0080 audit/relative_reference：wrong_judgment_or_identity
- TC0081 audit/lookup_exact：wrong_judgment_or_identity
- TC0082 audit/lookup_exact：wrong_judgment_or_identity
- TC0083 audit/lookup_exact：wrong_judgment_or_identity
- TC0084 audit/lookup_exact：invalid_json
- TC0085 audit/lookup_exact：wrong_judgment_or_identity
- TC0086 audit/lookup_exact：wrong_judgment_or_identity
- TC0087 audit/lookup_exact：wrong_judgment_or_identity
- TC0088 audit/lookup_exact：wrong_judgment_or_identity
- TC0089 audit/lookup_exact：wrong_judgment_or_identity
- TC0090 audit/lookup_exact：wrong_judgment_or_identity
- TC0091 audit/lookup_column：wrong_judgment_or_identity
- TC0092 audit/lookup_column：wrong_judgment_or_identity
- TC0093 audit/lookup_column：wrong_judgment_or_identity
- TC0094 audit/lookup_column：wrong_judgment_or_identity
- TC0095 audit/lookup_column：wrong_judgment_or_identity
- TC0096 audit/lookup_column：wrong_judgment_or_identity
- TC0097 audit/lookup_column：wrong_judgment_or_identity
- TC0098 audit/lookup_column：wrong_judgment_or_identity
- TC0099 audit/lookup_column：invalid_json
- TC0100 audit/lookup_column：wrong_judgment_or_identity
- TC0101 audit/if_boundary：wrong_judgment_or_identity
- TC0102 audit/if_boundary：wrong_judgment_or_identity
- TC0103 audit/if_boundary：wrong_judgment_or_identity
- TC0104 audit/if_boundary：wrong_judgment_or_identity
- TC0105 audit/if_boundary：wrong_judgment_or_identity
- TC0106 audit/if_boundary：wrong_judgment_or_identity
- TC0107 audit/if_boundary：wrong_judgment_or_identity
- TC0108 audit/if_boundary：wrong_judgment_or_identity
- TC0109 audit/if_boundary：wrong_judgment_or_identity
- TC0110 audit/if_boundary：wrong_judgment_or_identity
- TC0111 audit/text_number：wrong_judgment_or_identity
- TC0112 audit/text_number：wrong_judgment_or_identity
- TC0113 audit/text_number：wrong_judgment_or_identity
- TC0114 audit/text_number：wrong_judgment_or_identity
- TC0115 audit/text_number：wrong_judgment_or_identity
- TC0116 audit/text_number：wrong_judgment_or_identity
- TC0117 audit/text_number：wrong_judgment_or_identity
- TC0118 audit/text_number：wrong_judgment_or_identity
- TC0119 audit/text_number：wrong_judgment_or_identity
- TC0120 audit/text_number：wrong_judgment_or_identity
- TC0121 audit/duplicate_total：wrong_judgment_or_identity
- TC0122 audit/duplicate_total：wrong_judgment_or_identity
- TC0123 audit/duplicate_total：wrong_judgment_or_identity
- TC0124 audit/duplicate_total：wrong_judgment_or_identity
- TC0125 audit/duplicate_total：wrong_judgment_or_identity
- TC0126 audit/duplicate_total：wrong_judgment_or_identity
- TC0127 audit/duplicate_total：wrong_judgment_or_identity
- TC0128 audit/duplicate_total：wrong_judgment_or_identity
- TC0129 audit/duplicate_total：wrong_judgment_or_identity
- TC0130 audit/duplicate_total：wrong_judgment_or_identity
- TC0131 audit/sign：wrong_judgment_or_identity
- TC0132 audit/sign：wrong_judgment_or_identity
- TC0133 audit/sign：wrong_judgment_or_identity
- TC0134 audit/sign：wrong_judgment_or_identity
- TC0135 audit/sign：wrong_judgment_or_identity
- TC0136 audit/sign：wrong_judgment_or_identity
- TC0137 audit/sign：wrong_judgment_or_identity
- TC0138 audit/sign：wrong_judgment_or_identity
- TC0139 audit/sign：wrong_judgment_or_identity
- TC0140 audit/sign：wrong_judgment_or_identity
- TC0141 audit/date_order：wrong_judgment_or_identity
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
- TC0153 audit/rounding：wrong_judgment_or_identity
- TC0154 audit/rounding：wrong_judgment_or_identity
- TC0155 audit/rounding：wrong_judgment_or_identity
- TC0156 audit/rounding：wrong_judgment_or_identity
- TC0157 audit/rounding：wrong_judgment_or_identity
- TC0158 audit/rounding：wrong_judgment_or_identity
- TC0159 audit/rounding：invalid_json
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
- TC0174 audit/iferror：wrong_judgment_or_identity
- TC0175 audit/iferror：wrong_judgment_or_identity
- TC0176 audit/iferror：wrong_judgment_or_identity
- TC0177 audit/iferror：wrong_judgment_or_identity
- TC0178 audit/iferror：wrong_judgment_or_identity
- TC0179 audit/iferror：wrong_judgment_or_identity
- TC0180 audit/iferror：wrong_judgment_or_identity
- TC0181 pii/email：invalid_json
- TC0182 pii/email：invalid_json
- TC0183 pii/email：invalid_json
- TC0184 pii/email：invalid_json
- TC0185 pii/email：invalid_json
- TC0186 pii/phone_cn：invalid_json
- TC0187 pii/phone_cn：invalid_json
- TC0188 pii/phone_cn：invalid_json
- TC0189 pii/phone_cn：invalid_json
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
- TC0202 pii/credit_card：invalid_json
- TC0203 pii/credit_card：invalid_json
- TC0204 pii/credit_card：invalid_json
- TC0205 pii/credit_card：invalid_json
- TC0206 pii/national_id：invalid_json
- TC0207 pii/national_id：invalid_json
- TC0208 pii/national_id：invalid_json
- TC0209 pii/national_id：invalid_json
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
- TC0231 pii/credit_card_spaced：invalid_json, output_truncated
- TC0232 pii/credit_card_spaced：invalid_json
- TC0233 pii/credit_card_spaced：invalid_json
- TC0234 pii/credit_card_spaced：invalid_json
- TC0235 pii/credit_card_spaced：invalid_json
- TC0236 pii/passport：invalid_json
- TC0237 pii/passport：invalid_json
- TC0238 pii/passport：invalid_json
- TC0239 pii/passport：invalid_json
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
- TC0250 pii/national_id_labeled：invalid_json
- TC0251 pii/multi_email：invalid_json
- TC0252 pii/multi_email：invalid_json
- TC0253 pii/multi_email：invalid_json
- TC0254 pii/multi_email：invalid_json
- TC0255 pii/multi_email：invalid_json
- TC0256 pii/mixed_pii：invalid_json, output_truncated
- TC0257 pii/mixed_pii：invalid_json
- TC0258 pii/mixed_pii：invalid_json
- TC0259 pii/mixed_pii：invalid_json
- TC0260 pii/mixed_pii：invalid_json
- TC0290 pii/empty：missed_extra_or_wrong_pii, invalid_schema
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
- TC0357 extraction/invoice/noise：invalid_json
- TC0359 extraction/invoice/noise：invalid_json
- TC0360 extraction/invoice/noise：invalid_json
- TC0386 extraction/receipt/noise：invalid_json
- TC0387 extraction/receipt/noise：invalid_json
- TC0388 extraction/receipt/noise：invalid_json
- TC0389 extraction/receipt/noise：invalid_json
- TC0419 extraction/purchase_order/noise：invalid_json
- TC0420 extraction/purchase_order/noise：invalid_json
- TC0441 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0442 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0443 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0444 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0445 extraction/expense_report/chinese：wrong_document_missing_extra_or_wrong_field
- TC0447 extraction/expense_report/noise：invalid_json
- TC0448 extraction/expense_report/noise：invalid_json
- TC0450 extraction/expense_report/noise：invalid_json
- TC0456 extraction/expense_report/reordered：wrong_document_missing_extra_or_wrong_field
- TC0457 extraction/expense_report/reordered：wrong_document_missing_extra_or_wrong_field
- TC0458 extraction/expense_report/reordered：wrong_document_missing_extra_or_wrong_field
- TC0459 extraction/expense_report/reordered：wrong_document_missing_extra_or_wrong_field
- TC0460 extraction/expense_report/reordered：wrong_document_missing_extra_or_wrong_field
- TC0475 extraction/payroll/chinese：invalid_schema
- TC0476 extraction/payroll/noise：invalid_json
- TC0477 extraction/payroll/noise：invalid_json
- TC0478 extraction/payroll/noise：invalid_json
- TC0479 extraction/payroll/noise：invalid_json
- TC0480 extraction/payroll/noise：invalid_json
- TC0482 extraction/payroll/missing_total：invalid_schema
- TC0484 extraction/payroll/missing_total：invalid_schema
- TC0485 extraction/payroll/missing_total：invalid_schema

## 公式真假判断诊断（不替代严格通过率）

忽略规则 ID、地址和置信度等字段，仅检查唯一一条输出中的布尔判断：84/180（46.7%）。

TP=84，TN=0，FP=85，FN=3，无法评分=8。

唯一布尔输出中有 172 条改写了地址或规则 ID。错误请求 0；输出截断 2。
请求耗时合计 219.557 秒，中位 0.4025 秒，P95 0.725 秒。

## 表达格式诊断（不修改严格评分）

仅允许移除包住整个回答的 Markdown JSON 围栏，不修复 JSON。公式只看唯一布尔判断；PII 和提取仍要求业务结果完全匹配，但忽略置信度等协议字段。

|任务|内容正确|移除围栏条数|
|---|---:|---:|
|audit|84/180 (46.7%)|0|
|pii|114/160 (71.2%)|93|
|extraction|135/160 (84.4%)|2|
