# 提供的 480 条 synthetic test：适用范围

本审计的可复核聚合数据在 `tmp/formula-comparison-runner-20261016/provided-test480/provided-test480-scope-audit.json`。它基于冻结提交 `8ba04ed` 的静态文件读取；没有运行模型，也没有把结果解释为新 benchmark。

## 可观察事实

源 manifest 将 test 声明为 480 条、240 条真实错误，并明确警告 synthetic context templates 在 split 间共享，不能视为独立真实世界评测。它还声明同一公式与告警在业务要求改变时形成 pair，并声称 pair group／seed 按 split 分离。

test 的 480 条记录都恰有一个候选 issue 和非空 context，长度为 33–78 个字符；它们都带有显式的合成业务要求或例外文本。12 个 category 各 40 条。测试脚本逐字节核对 `case.input` 重新构建的 user prompt 与保存 prompt，相等；assistant message 不进入转换后的推理输入。

对 train、validation、test 的精确 ID、`pair_id`、canonical `case.input`、单 issue 与 user prompt 做交集，三对 split 的交集都为零。仅去掉 split 前缀后的 `pair_id` 会出现交集，不能据此重新定义 group 身份或推翻 manifest 的 split 声明。manifest 已直接承认 template 共享；这既不能单独证明训练泄漏，也不能证明独立泛化。

test 中 440 条非 rounding case 的 `expected.isValid` 与 `oracle.actual != oracle.required` 完全一致。40 条 rounding case 使用 `difference_exceeds_tolerance`：20 条差额 0.005 标为真实错误，20 条差额 0.01 标为误报；容差数值在 context 中，不是 oracle 的独立字段。因此这证明标签与生成规则机械一致，不能替代独立标签复审。

## 与当前产品的差距

当前正常 audit 路径在 [analysisHandlers.ts](../../app/electron/main/analysisHandlers.ts) 中仅将 rule ID、单元格、sheet、公式、规则消息和置信度传给 `LlmIssueInput`；没有传入 `RendererIssue` 已有的 `currentValue`、`expectedValue`、`suggestion`，也没有提供 `context`。native sender 会把缺失的 context 变成空字符串，再交给 prompt builder：见 [native.ts](../../app/electron/llm/native.ts) 和 [prompts.ts](../../app/electron/llm/prompts.ts) 。

因此，即使模型在这 480 条上高分，也只支持一个条件性结论：在给定这套候选告警、明确的合成业务语义、冻结 prompt 与本地 runtime 时，模型能给出建议。它不支持真实工作簿准确率、安全性、规则未召回错误的覆盖率，或当前产品扫描的等价表现；后者缺少本测试中决定真假的业务要求／例外。它也不支持自动撤销用户发现，当前产品仍应保留人工复核与失败保留策略。
