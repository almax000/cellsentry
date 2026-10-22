# 归档公式评测转换协议

`scripts/convert_archive_formula_eval.py` 把 `prepare_archive_test.py` 已验证输出的 `cases.jsonl` 转为新的、仅公式复核的模型评测输入。它不启动模型、不访问网络、不读取权重，也不从历史模型响应反推案例。

转换命令如下：

```bash
python3 scripts/convert_archive_formula_eval.py \
  --source /path/to/archive-test/cases.jsonl \
  --output /path/to/new-archive-formula-eval
```

输出目录含 `cases.jsonl` 和 `manifest.json`。manifest 记录源文件哈希、转换器版本和哈希、每个输出条目的 ID、输入哈希、源条目哈希及标签来源。输出目录必须为空，避免把不同运行混在一起。

这个产物的角色固定为 `development_non_heldout`：标签来自已提供的归档开发数据，转换本身不独立复核业务真值，也没有证明与任何训练、提示词或阈值选择隔离。它绝不能称作 historical external580；只有完整输出哈希与历史记录完全相同并另有可审计来源链时，才可能讨论同一语料。

后续要比较旧 Qwen 与 cancellation v2，必须对同一份新 `cases.jsonl` 分别运行各自正确 chat template 的本地服务，并保留两个完整 run 元数据和原始响应。转换器写入 manifest 中的命令模板；这些模板不下载、启动或执行模型。完成后报告每个模型的原始语义结果、协议校验结果、运行时/模型哈希和失败样例，不能把 development 集结果写成盲测。
