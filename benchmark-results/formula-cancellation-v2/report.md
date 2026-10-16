# 公式撤销可靠性 v2

仅训练公式复核，从 v1 最佳 LoRA 继续训练；真实错误判断 token 额外加权4倍。目标为减少误撤真实错误，同时报告撤销覆盖率。

|数据集|版本|撤销正确/撤销总数|撤销正确率|误撤真实错误|撤销数量/全部|
|---|---|---:|---:|---:|---:|
|new480|before 仅真假判断|201/218|92.2%|17|218/480|
|new480|before 协议失败保留|201/218|92.2%|17|218/480|
|new480|after 仅真假判断|202/202|100.0%|0|202/480|
|new480|after 协议失败保留|183/183|100.0%|0|183/480|
|external580|before 仅真假判断|70/119|58.8%|49|119/580|
|external580|before 协议失败保留|57/96|59.4%|39|96/580|
|external580|after 仅真假判断|65/86|75.6%|21|86/580|
|external580|after 协议失败保留|60/81|74.1%|21|81/580|
|coverage500|before 仅真假判断|90/100|90.0%|10|100/180|
|coverage500|before 协议失败保留|90/100|90.0%|10|100/180|
|coverage500|after 仅真假判断|83/92|90.2%|9|92/180|
|coverage500|after 协议失败保留|83/92|90.2%|9|92/180|

## 验证集固定的保守撤销门槛

```json
{
  "policy": {
    "threshold": 0.6042632585623643,
    "enabled": true,
    "validation_cancellations": 118,
    "validation_correct": 118,
    "validation_precision": 1.0,
    "validation_wilson95_lower": 0.9684716609775074,
    "target_lower_bound": 0.95,
    "min_cancellations": 30
  },
  "validation": {
    "count": 288,
    "cancelled": 118,
    "correct_cancellations": 118,
    "unsafe_cancellations": 0,
    "cancellation_precision": 1.0,
    "cancellation_coverage": 0.4097222222222222,
    "cancellation_precision_wilson95_lower": 0.9684716609775074,
    "note": "An optional defer/withdraw gate. Uses a validation-frozen threshold; does not change raw model judgment."
  },
  "tests": {
    "new480": {
      "count": 480,
      "cancelled": 176,
      "correct_cancellations": 176,
      "unsafe_cancellations": 0,
      "cancellation_precision": 1.0,
      "cancellation_coverage": 0.36666666666666664,
      "cancellation_precision_wilson95_lower": 0.9786397483323135,
      "note": "An optional defer/withdraw gate. Uses a validation-frozen threshold; does not change raw model judgment."
    },
    "external580": {
      "count": 580,
      "cancelled": 75,
      "correct_cancellations": 58,
      "unsafe_cancellations": 17,
      "cancellation_precision": 0.7733333333333333,
      "cancellation_coverage": 0.12931034482758622,
      "cancellation_precision_wilson95_lower": 0.666644645277309,
      "note": "An optional defer/withdraw gate. Uses a validation-frozen threshold; does not change raw model judgment."
    }
  }
}
```

门槛未满足验证要求时全部保留，撤销正确率记为未定义，不能宣称100%。门控结果与原始模型判断分开报告，不用门控掩盖模型错误。

## 隐私与提取回归（原500条中的两个任务）

|任务|v1严格通过|v2严格通过|
|---|---:|---:|
|pii|38/160|77/160|
|extraction|21/160|124/160|

隐私/提取始终未参与本轮训练。v1 公式专项已有通用任务退化，需同时参考原版通用模型基线，不把维持退化水平当作通用能力保持。
原版通用 MiniCPM 在该集严格 PII 为64/160、提取129/160；目前不替换应用默认模型。

CPU 三条运行验证结果见 cancel2-cpu-smoke；桌面 CPU 验证不能代替手机端实测。

- Generated paired examples share context templates across splits; synthetic results are not proof of business accuracy.
- External archive is a reused development benchmark, excluded from training and threshold selection.
- Gate uses strict JSON/identity, nonempty context, and native next-token false probability >=0.5; missing score defers. Does not use self-reported adjustedConfidence.
- Only validation labels choose the threshold. Wilson 95% lower bound target95%, minimum30 withdrawals. No test tuning.
- The lower bound is a finite validation estimate, not a safety guarantee or proof on other distributions.
- Counterfactual samples share templates and are correlated; a binomial confidence bound can overstate effective evidence.
- PII/extraction are regression-only. No application default replacement or mobile-device integration.

## 本轮结论

外部集原始真假判断：撤销正确率 58.8% → 75.6%，误撤真实错误 49 → 21；同时实际消除误报由70条降为65条，撤销总量119条降为86条。改善了风险取舍，没有实现全部指标同时提升。
协议和标识失败时保留告警后，新版撤销正确率为74.1%（60/81），误撤21条。验证门槛进一步筛选后为77.3%（58/75），仍误撤17条，覆盖率12.9%。验证集上的统计门槛未能保证外部数据达到95%的撤销正确率。

|固定门槛测试|正确撤销/撤销总数|误撤真实错误|撤销覆盖率|
|---|---:|---:|---:|
|新480条|176/176|0|36.7%|
|外部580条|58/75|17|12.9%|

原180条公式回归，真假判断由170/180降为164/180；隐私严格38/160→77/160，提取21/160→124/160。隐私和提取未参与训练，仍需参考原版通用模型64/160、129/160。

CPU三条均正常返回有效JSON，真假判断3/3正确，但地址格式导致严格协议仅1/3通过；同三条GPU严格2/3通过。不能将CPU可运行等同于端侧协议和精度已验证，详见cpu-parity.json。

结果属于研究归档，尚不建议自动撤销告警。17条误撤已另存 unsafe-withdrawals-external580.jsonl，供人工检查上下文、业务规则和原标签；未将这些测试答案加入本轮训练。
