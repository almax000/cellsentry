# 三任务 Golden Workbook Electron 验收

`app/e2e/fixtures/golden-three-workflows.xlsx` 是仅含合成数据的产品证据 fixture。它把四个确定性公式审计问题、五个正则 PII finding，以及一张可提取的发票放入同一工作簿。对应 manifest 固定源文件 SHA-256、必备问题、PII 掩码、提取字段与 CSV 安全不变量。

它刻意以规则和模板为基线：`rulesOnly` 为真，`modelAccuracyVerified` 为假。模型缺失、模型失败或模型反对规则都不能让这个 contract 声称模型准确。

从 `app/` 运行：

```sh
npx tsx e2e/fixtures/generate-golden-fixture.ts
npx playwright test --project=functional e2e/golden-functional.spec.ts
```

测试走真实 Electron 主进程、ExcelJS 读取与可见 UI。它验证结果页中的固定审计 rule/cell、PII cell/mask 和发票 fields/table；再经 UI 导出标注 XLSX、PII 脱敏 XLSX、提取 JSON/CSV 并回读。每次导出后复算源文件 SHA-256，防止导出改写输入。

这仍不是模型能力评估，也不替代人工审阅视觉截图或真实客户工作簿。结果文件写入 `app/tmp/e2e/golden/`，Playwright 失败证据沿用 `app/tmp/e2e/` 的既有配置。
