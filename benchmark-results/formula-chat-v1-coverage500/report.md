# cellsentry-minicpm5-2b-formula-v1 本地模型 500 用例测试

已执行 500/500；严格通过 229。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|180|170 (94.4%)|170|180|180|0.486|
|extraction|160|21 (13.1%)|21|21|21|1.804|
|pii|160|38 (23.8%)|38|59|49|0.528|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
测试集包含 18 种公式场景的正反例、32 类 PII 场景以及 5 种单据的 6 种布局和未知文档。每类有 5 个变体；部分变体共享结构，不能视为 500 个独立业务场景。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- TC0061 audit/absolute_reference：wrong_judgment_or_identity
- TC0062 audit/absolute_reference：wrong_judgment_or_identity
- TC0063 audit/absolute_reference：wrong_judgment_or_identity
- TC0064 audit/absolute_reference：wrong_judgment_or_identity
- TC0065 audit/absolute_reference：wrong_judgment_or_identity
- TC0101 audit/if_boundary：wrong_judgment_or_identity
- TC0102 audit/if_boundary：wrong_judgment_or_identity
- TC0103 audit/if_boundary：wrong_judgment_or_identity
- TC0104 audit/if_boundary：wrong_judgment_or_identity
- TC0105 audit/if_boundary：wrong_judgment_or_identity
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
- TC0218 pii/email_embedded：invalid_json
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
- TC0233 pii/credit_card_spaced：invalid_json
- TC0234 pii/credit_card_spaced：invalid_json
- TC0235 pii/credit_card_spaced：invalid_json
- TC0236 pii/passport：invalid_json
- TC0237 pii/passport：invalid_json
- TC0238 pii/passport：invalid_json
- TC0239 pii/passport：invalid_json
- TC0240 pii/passport：invalid_json
- TC0242 pii/phone_in_sentence：invalid_json
- TC0243 pii/phone_in_sentence：invalid_json
- TC0244 pii/phone_in_sentence：invalid_json
- TC0246 pii/national_id_labeled：invalid_json
- TC0247 pii/national_id_labeled：invalid_json
- TC0248 pii/national_id_labeled：invalid_json
- TC0249 pii/national_id_labeled：invalid_json
- TC0250 pii/national_id_labeled：invalid_json
- TC0251 pii/multi_email：missed_extra_or_wrong_pii
- TC0252 pii/multi_email：missed_extra_or_wrong_pii
- TC0253 pii/multi_email：missed_extra_or_wrong_pii
- TC0254 pii/multi_email：missed_extra_or_wrong_pii
- TC0255 pii/multi_email：invalid_json
- TC0256 pii/mixed_pii：invalid_json
- TC0257 pii/mixed_pii：invalid_json
- TC0258 pii/mixed_pii：invalid_json
- TC0259 pii/mixed_pii：invalid_json
- TC0260 pii/mixed_pii：invalid_json
- TC0262 pii/integer：invalid_json
- TC0263 pii/integer：invalid_json
- TC0264 pii/integer：invalid_json
- TC0265 pii/integer：invalid_json
- TC0279 pii/sku：invalid_json
- TC0280 pii/sku：invalid_json
- TC0281 pii/order_id：invalid_json
- TC0282 pii/order_id：invalid_json
- TC0283 pii/order_id：missed_extra_or_wrong_pii, invalid_schema
- TC0285 pii/order_id：missed_extra_or_wrong_pii, invalid_schema
- TC0286 pii/empty：invalid_json
- TC0287 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0288 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0289 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0290 pii/empty：missed_extra_or_wrong_pii, invalid_schema
- TC0292 pii/ordinary_text：invalid_json
- TC0296 pii/email_no_at：missed_extra_or_wrong_pii
- TC0297 pii/email_no_at：missed_extra_or_wrong_pii
- TC0298 pii/email_no_at：missed_extra_or_wrong_pii
- TC0299 pii/email_no_at：missed_extra_or_wrong_pii
- TC0300 pii/email_no_at：missed_extra_or_wrong_pii
- TC0301 pii/email_no_domain：invalid_json
- TC0302 pii/email_no_domain：invalid_json
- TC0303 pii/email_no_domain：missed_extra_or_wrong_pii
- TC0304 pii/email_no_domain：missed_extra_or_wrong_pii
- TC0305 pii/email_no_domain：invalid_json
- TC0306 pii/short_phone：invalid_json
- TC0307 pii/short_phone：invalid_json
- TC0308 pii/short_phone：invalid_json
- TC0309 pii/short_phone：invalid_json
- TC0310 pii/short_phone：invalid_json
- TC0311 pii/invalid_ssn：invalid_json
- TC0312 pii/invalid_ssn：invalid_json
- TC0313 pii/invalid_ssn：invalid_json
- TC0314 pii/invalid_ssn：invalid_json, output_truncated
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
- TC0326 pii/version：invalid_json
- TC0328 pii/version：invalid_json
- TC0332 pii/currency：missed_extra_or_wrong_pii, invalid_schema
- TC0333 pii/currency：missed_extra_or_wrong_pii, invalid_schema
- TC0334 pii/currency：missed_extra_or_wrong_pii, invalid_schema
- TC0335 pii/currency：missed_extra_or_wrong_pii, invalid_schema
- TC0341 extraction/invoice/horizontal：invalid_json
- TC0342 extraction/invoice/horizontal：invalid_json
- TC0343 extraction/invoice/horizontal：invalid_json
- TC0344 extraction/invoice/horizontal：invalid_json
- TC0345 extraction/invoice/horizontal：invalid_json
- TC0346 extraction/invoice/vertical：invalid_json
- TC0347 extraction/invoice/vertical：invalid_json
- TC0348 extraction/invoice/vertical：invalid_json
- TC0349 extraction/invoice/vertical：invalid_json
- TC0350 extraction/invoice/vertical：invalid_json
- TC0351 extraction/invoice/chinese：invalid_json
- TC0352 extraction/invoice/chinese：invalid_json
- TC0353 extraction/invoice/chinese：invalid_json
- TC0354 extraction/invoice/chinese：invalid_json
- TC0355 extraction/invoice/chinese：invalid_json
- TC0356 extraction/invoice/noise：invalid_json
- TC0357 extraction/invoice/noise：invalid_json
- TC0358 extraction/invoice/noise：invalid_json
- TC0359 extraction/invoice/noise：invalid_json
- TC0360 extraction/invoice/noise：invalid_json
- TC0362 extraction/invoice/missing_total：invalid_json
- TC0366 extraction/invoice/reordered：invalid_json
- TC0367 extraction/invoice/reordered：invalid_json
- TC0368 extraction/invoice/reordered：invalid_json
- TC0369 extraction/invoice/reordered：invalid_json
- TC0370 extraction/invoice/reordered：invalid_json
- TC0371 extraction/receipt/horizontal：invalid_json
- TC0372 extraction/receipt/horizontal：invalid_json
- TC0373 extraction/receipt/horizontal：invalid_json
- TC0374 extraction/receipt/horizontal：invalid_json
- TC0375 extraction/receipt/horizontal：invalid_json
- TC0376 extraction/receipt/vertical：invalid_json
- TC0378 extraction/receipt/vertical：invalid_json
- TC0379 extraction/receipt/vertical：invalid_json
- TC0380 extraction/receipt/vertical：invalid_json
- TC0381 extraction/receipt/chinese：invalid_json
- TC0382 extraction/receipt/chinese：invalid_json
- TC0383 extraction/receipt/chinese：invalid_json
- TC0384 extraction/receipt/chinese：invalid_json
- TC0385 extraction/receipt/chinese：invalid_json
- TC0386 extraction/receipt/noise：invalid_json
- TC0387 extraction/receipt/noise：invalid_json
- TC0388 extraction/receipt/noise：invalid_json
- TC0389 extraction/receipt/noise：invalid_json
- TC0390 extraction/receipt/noise：invalid_json
- TC0391 extraction/receipt/missing_total：invalid_json
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
- TC0407 extraction/purchase_order/vertical：invalid_json
- TC0408 extraction/purchase_order/vertical：invalid_json
- TC0409 extraction/purchase_order/vertical：invalid_json
- TC0410 extraction/purchase_order/vertical：invalid_json
- TC0411 extraction/purchase_order/chinese：invalid_json
- TC0412 extraction/purchase_order/chinese：invalid_json
- TC0413 extraction/purchase_order/chinese：invalid_json
- TC0414 extraction/purchase_order/chinese：invalid_json
- TC0415 extraction/purchase_order/chinese：invalid_json
- TC0416 extraction/purchase_order/noise：invalid_json
- TC0417 extraction/purchase_order/noise：invalid_json
- TC0418 extraction/purchase_order/noise：invalid_json
- TC0419 extraction/purchase_order/noise：invalid_json
- TC0420 extraction/purchase_order/noise：invalid_json
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
- TC0434 extraction/expense_report/horizontal：invalid_json
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
- TC0450 extraction/expense_report/noise：invalid_json
- TC0451 extraction/expense_report/missing_total：invalid_json
- TC0452 extraction/expense_report/missing_total：invalid_json
- TC0453 extraction/expense_report/missing_total：invalid_json
- TC0454 extraction/expense_report/missing_total：invalid_json
- TC0455 extraction/expense_report/missing_total：invalid_json
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
- TC0477 extraction/payroll/noise：invalid_json
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

## 公式真假判断诊断（不替代严格通过率）

忽略规则 ID、地址和置信度等字段，仅检查唯一一条输出中的布尔判断：170/180（94.4%）。

TP=80，TN=90，FP=0，FN=10，无法评分=0。

唯一布尔输出中有 0 条改写了地址或规则 ID。错误请求 0；输出截断 1。
请求耗时合计 460.519 秒，中位 0.513 秒，P95 2.251 秒。

## 表达格式诊断（不修改严格评分）

仅允许移除包住整个回答的 Markdown JSON 围栏，不修复 JSON。公式只看唯一布尔判断；PII 和提取仍要求业务结果完全匹配，但忽略置信度等协议字段。

|任务|内容正确|移除围栏条数|
|---|---:|---:|
|audit|170/180 (94.4%)|0|
|pii|81/160 (50.6%)|65|
|extraction|122/160 (76.2%)|136|

## 唯一 JSON 片段诊断（不修改严格评分）

只在最终答案中定位完整 JSON，忽略周围文字；不修复 JSON、不改字段、不使用思考文本。不同的多个候选结果视为歧义；完全相同的重复结果去重。候选选择仅按任务输出形状，不按金标准挑答案。公式只看唯一布尔判断；另外两项仍检查业务字段。

|任务|内容正确|找到唯一 JSON|多个不同候选|
|---|---:|---:|---:|
|audit|170/180 (94.4%)|180|0|
|pii|93/160 (58.1%)|155|1|
|extraction|122/160 (76.2%)|157|0|
