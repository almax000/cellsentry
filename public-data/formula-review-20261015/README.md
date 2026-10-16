# 公开中文工作簿采集

2026-10-15 通过公开网页的普通附件链接，小规模下载 8 份 XLSX。最多取每页 4 个附件、同时下载 2 个文件；失败项目记录在 sources.json，不绕过登录或访问限制。

来源页面：

- [张掖市政府国资委 2025 年预算公开](https://www.zhangye.gov.cn/zyszfxxgk/fdzdgknr_5657/sgjfjysxx/bmczyjsjsgjf/202501/t20250121_1348484.html)
- [西洞庭管理区 2025 年预算草案](https://xdt.changde.gov.cn/zwgk/public/6617380/3124663211.html)
- [岳阳县委组织部 2025 年预算公开](https://www.yyx.gov.cn/37584/38146/38322/content_2291991.html)
- [重庆长寿区云台镇 2025 年预算公开](https://www.cqcs.gov.cn/jz/ytz_75974/zwgk_75373/fdzdgknr_75377/czyjs_jz/jzys_jz/202501/t20250124_14209418.html)

共发现 53 条原始公式，来自 3 份文件；另 5 份只有数值和文字，没有可提取公式。原文件位于 `.runtime/public-workbooks/`，SHA256、附件链接、页面哈希、页签及数量见 [sources.json](sources.json)。完整原公式及局部上下文保存在 [original-formulas.jsonl](original-formulas.jsonl)，标签全部未知。

公开下载不代表原文件业务逻辑正确。原始数据不用于本轮训练。从其中 3 份文件派生了 42 条明示核算契约下的注错测试，派生过程见 [derivation.json](derivation.json)，测试在 [public_test.jsonl](../../training-data/formula-review-v2/public_test.jsonl)。这些标签只覆盖受控算术、字段选择及越界判断，不是人工审计结果。原文件没有改写，查找公式是按公开表格的真实字段新构造的。

结果中保存访问失败与公式缺失情况，不把下载数量当作有效公式样本数。重新采集可能因网页或附件更新得到不同版本，复现时需核对哈希。原文件仅保存在本机，未添加到 Git。
