# cellsentry-cancel2 本地模型 580 用例测试

已执行 580/580；严格通过 478。

这是合成数据上的模型直测；不代表 Excel 解析、规则引擎、UI 或生产数据表现。
所有请求串行执行，temperature=0，seed=42，max_tokens=420，context=1024；不强制 JSON grammar，不用模拟结果，不用规则替代模型回答。
公式提示词遵循应用输出协议；PII/提取补充显式字段协议，因此是受控能力测试，并非缺失的原版 Python 服务复刻。

|任务|执行|严格通过|语义通过|JSON有效|Schema有效|平均秒数|
|---|---:|---:|---:|---:|---:|---:|
|audit|580|478 (82.4%)|478|580|580|0.521|

严格通过要求：JSON 有效、字段协议正确、业务答案完全匹配。PII 按单元格和类型比较；提取按文档类型、字段名、原值和来源地址比较，额外/缺失字段均失败。
本轮使用独立指定的合成测试集；任务定义及生成来源见对应数据 manifest。各分割共享生成逻辑，不代表独立真实业务准确率。
PII 为合成/公开测试值；负例要求 SSN 范围、银行卡 Luhn、身份证校验有效。该定义可能比模型训练标签严格。

## 失败用例

- ARCH-253d577681fda0f2 audit/external_formula：wrong_judgment_or_identity
- ARCH-4e040d38988becd2 audit/external_formula：wrong_judgment_or_identity
- ARCH-da88dca3d58c3e64 audit/external_formula：wrong_judgment_or_identity
- ARCH-fd9697aebbd4a41f audit/external_formula：wrong_judgment_or_identity
- ARCH-ef3ab5fd3d5162c0 audit/external_formula：wrong_judgment_or_identity
- ARCH-304817d3e15602f5 audit/external_formula：wrong_judgment_or_identity
- ARCH-75ccc55f86c1183b audit/external_formula：wrong_judgment_or_identity
- ARCH-7a355dbe541517fe audit/external_formula：wrong_judgment_or_identity
- ARCH-e90728adff06857e audit/external_formula：wrong_judgment_or_identity
- ARCH-1481dbf6669b0771 audit/external_formula：wrong_judgment_or_identity
- ARCH-2a730a9fbc2843a6 audit/external_formula：wrong_judgment_or_identity
- ARCH-f19e7fa08b2692fa audit/external_formula：wrong_judgment_or_identity
- ARCH-3b3fc6c8aff24602 audit/external_formula：wrong_judgment_or_identity
- ARCH-2820160ce191c916 audit/external_formula：wrong_judgment_or_identity
- ARCH-d2b6930d0ead6520 audit/external_formula：wrong_judgment_or_identity
- ARCH-1b8b175f9aad1edc audit/external_formula：wrong_judgment_or_identity
- ARCH-bd17725cf1f68a3d audit/external_formula：wrong_judgment_or_identity
- ARCH-fe9a410e0b8fe8a5 audit/external_formula：wrong_judgment_or_identity
- ARCH-71a2fa81d945d7ac audit/external_formula：wrong_judgment_or_identity
- ARCH-96b7cd317e7f417b audit/external_formula：wrong_judgment_or_identity
- ARCH-06be0894ec6d907e audit/external_formula：wrong_judgment_or_identity
- ARCH-cf3867bba3fbe759 audit/external_formula：wrong_judgment_or_identity
- ARCH-ba4be315c47027cd audit/external_formula：wrong_judgment_or_identity
- ARCH-d3b015f33a88f557 audit/external_formula：wrong_judgment_or_identity
- ARCH-eff90c01d862171c audit/external_formula：wrong_judgment_or_identity
- ARCH-b472d056784ce70f audit/external_formula：wrong_judgment_or_identity
- ARCH-c9780cff2bcb54ba audit/external_formula：wrong_judgment_or_identity
- ARCH-625d5ae9da7ffd53 audit/external_formula：wrong_judgment_or_identity
- ARCH-be84e5ec147b7f4b audit/external_formula：wrong_judgment_or_identity
- ARCH-ca9521bd86c2bdb0 audit/external_formula：wrong_judgment_or_identity
- ARCH-30f3048926cc22d8 audit/external_formula：wrong_judgment_or_identity
- ARCH-152aafa40fd2a9a4 audit/external_formula：wrong_judgment_or_identity
- ARCH-88841054cb68c765 audit/external_formula：wrong_judgment_or_identity
- ARCH-a67fe753baf64459 audit/external_formula：wrong_judgment_or_identity
- ARCH-b77f4eb416c90996 audit/external_formula：wrong_judgment_or_identity
- ARCH-4357954867c1e259 audit/external_formula：wrong_judgment_or_identity
- ARCH-6cf11482f1c3ff52 audit/external_formula：wrong_judgment_or_identity
- ARCH-28ea75bb75f02a74 audit/external_formula：wrong_judgment_or_identity
- ARCH-d5d4718d3fb25142 audit/external_formula：wrong_judgment_or_identity
- ARCH-9f74fa65cfedcb64 audit/external_formula：wrong_judgment_or_identity
- ARCH-916b51b4625a7145 audit/external_formula：wrong_judgment_or_identity
- ARCH-6e4b4d2ec9821296 audit/external_formula：wrong_judgment_or_identity
- ARCH-2340d4a7aaf94639 audit/external_formula：wrong_judgment_or_identity
- ARCH-0d753157dc697552 audit/external_formula：wrong_judgment_or_identity
- ARCH-6c5f964ecdbb16ea audit/external_formula：wrong_judgment_or_identity
- ARCH-0c38fffb251f8530 audit/external_formula：wrong_judgment_or_identity
- ARCH-6a4308b753bd0fb4 audit/external_formula：wrong_judgment_or_identity
- ARCH-1dda66e6e2d97703 audit/external_formula：wrong_judgment_or_identity
- ARCH-b1d32d2033246b28 audit/external_formula：wrong_judgment_or_identity
- ARCH-6ad6bd7164f9165b audit/external_formula：wrong_judgment_or_identity
- ARCH-b502b5bf773bb405 audit/external_formula：wrong_judgment_or_identity
- ARCH-16f7b79819a95591 audit/external_formula：wrong_judgment_or_identity
- ARCH-adca27fdc6f35d25 audit/external_formula：wrong_judgment_or_identity
- ARCH-e77168429b6f3aed audit/external_formula：wrong_judgment_or_identity
- ARCH-232f8a6c53df0d1f audit/external_formula：wrong_judgment_or_identity
- ARCH-1b237b26ec8da58a audit/external_formula：wrong_judgment_or_identity
- ARCH-385349cc41908726 audit/external_formula：wrong_judgment_or_identity
- ARCH-633cf9bd7563889d audit/external_formula：wrong_judgment_or_identity
- ARCH-8d2062c8cd2384e9 audit/external_formula：wrong_judgment_or_identity
- ARCH-c7b2ff6ec10e5fa9 audit/external_formula：wrong_judgment_or_identity
- ARCH-9d92543707268eee audit/external_formula：wrong_judgment_or_identity
- ARCH-fce33c156970417d audit/external_formula：wrong_judgment_or_identity
- ARCH-734d7c25011402c7 audit/external_formula：wrong_judgment_or_identity
- ARCH-7429662fb76d02df audit/external_formula：wrong_judgment_or_identity
- ARCH-3d04ed43a327538c audit/external_formula：wrong_judgment_or_identity
- ARCH-74f97c84a6d9131c audit/external_formula：wrong_judgment_or_identity
- ARCH-992e20e57b6f8800 audit/external_formula：wrong_judgment_or_identity
- ARCH-19fa644e1e82337d audit/external_formula：wrong_judgment_or_identity
- ARCH-82efd047e03189cd audit/external_formula：wrong_judgment_or_identity
- ARCH-7d3a959a8bc29d7b audit/external_formula：wrong_judgment_or_identity
- ARCH-96e02566e3767b05 audit/external_formula：wrong_judgment_or_identity
- ARCH-2a07d734c6921f66 audit/external_formula：wrong_judgment_or_identity
- ARCH-945eb9b8587778b2 audit/external_formula：wrong_judgment_or_identity
- ARCH-d26de54b362a8795 audit/external_formula：wrong_judgment_or_identity
- ARCH-14b6fe061d4000f2 audit/external_formula：wrong_judgment_or_identity
- ARCH-17c9dd6526af41c9 audit/external_formula：wrong_judgment_or_identity
- ARCH-f803311b784dcc55 audit/external_formula：wrong_judgment_or_identity
- ARCH-e5276cfc48edf161 audit/external_formula：wrong_judgment_or_identity
- ARCH-f6bbcf572f991511 audit/external_formula：wrong_judgment_or_identity
- ARCH-e5185a86bddeb8d7 audit/external_formula：wrong_judgment_or_identity
- ARCH-89a7464e64f20af1 audit/external_formula：wrong_judgment_or_identity
- ARCH-c05000682317ada4 audit/external_formula：wrong_judgment_or_identity
- ARCH-3c40ab56396c5848 audit/external_formula：wrong_judgment_or_identity
- ARCH-3df13d98bd58ce63 audit/external_formula：wrong_judgment_or_identity
- ARCH-890cb55bfc36a40e audit/external_formula：wrong_judgment_or_identity
- ARCH-d7b4ee5e7bdfdc8b audit/external_formula：wrong_judgment_or_identity
- ARCH-f2942078e4da0abd audit/external_formula：wrong_judgment_or_identity
- ARCH-db3636a07e7c83cd audit/external_formula：wrong_judgment_or_identity
- ARCH-45f0d049b4dba0da audit/external_formula：wrong_judgment_or_identity
- ARCH-8c783e4ca6e13c91 audit/external_formula：wrong_judgment_or_identity
- ARCH-bed87d79f61c06b0 audit/external_formula：wrong_judgment_or_identity
- ARCH-71e6ddddf0d36848 audit/external_formula：wrong_judgment_or_identity
- ARCH-04de36e2f251aa18 audit/external_formula：wrong_judgment_or_identity
- ARCH-eb08689cdb255e88 audit/external_formula：wrong_judgment_or_identity
- ARCH-bb2b14ea8f50e10c audit/external_formula：wrong_judgment_or_identity
- ARCH-f2205204c8ac2030 audit/external_formula：wrong_judgment_or_identity
- ARCH-6987de4fd3672214 audit/external_formula：wrong_judgment_or_identity
- ARCH-22b3da21041dc1fc audit/external_formula：wrong_judgment_or_identity
- ARCH-47561de2f7f3a8c2 audit/external_formula：wrong_judgment_or_identity
- ARCH-68a2499a71039890 audit/external_formula：wrong_judgment_or_identity
- ARCH-15e08fd5094f1a52 audit/external_formula：wrong_judgment_or_identity
- ARCH-df751659b39781f7 audit/external_formula：wrong_judgment_or_identity
