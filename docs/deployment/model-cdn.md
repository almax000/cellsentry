# GitHub 模型发行程序

当前方案依据 [ADR-0015](../adr/0015-distribute-models-with-github-releases.md) ：使用公开仓 `almax000/cellsentry` 的 Release 附件，暂不开通 R2。本文沿用原文件路径供已有链接访问。尚未创建模型 Release、上传权重或启用 App 新下载源。实际公开上传仍须 jojo 在审阅最终包后确认（PRD §10）。

## 固定发行目标

- 仓库：`almax000/cellsentry`（公开）；私有开发仓不用于匿名下载。
- 标签：`model-formula-cancellation-v2-20261016`；包内模型版本仍是 `formula-cancellation-v2-20261016`。
- 标题：`CellSentry formula cancellation v2`。
- 五个附件：`cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf`、`LICENSE`、`NOTICE.txt`、`manifest.json`、`SHA256SUMS`。
- 说明正文：`model-artifacts/formula-cancellation-v2/RELEASE-NOTES.md`。
- 模型 URL：`https://github.com/almax000/cellsentry/releases/download/model-formula-cancellation-v2-20261016/cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf`。

不上传 LoRA、训练数据、研究附件、App 安装器或更新清单。使用独立 `model-` 标签，创建和发布均设 `--latest=false`，不取代 App Latest Release；已核对仓内构建工作流只响应 `v*`，发布前再核对公开仓实际工作流。实际标签固定到上传时已核实的公开仓提交，记录该 SHA，禁止覆写既有同名 Release 或附件。

GitHub Release 单附件必须 **小于 2 GiB**。当前 GGUF 为 `1561314592` bytes，SHA256 为 `61d9c8ab8007dbbde0eb004089d1411fb6ec7167031f9d6fcc5b521fe8ebe49a`。官方未设 Release 总容量或下载带宽额度；这不等于下载速度、地域可达性或服务等级保证。不要混用 LFS、Packages、Actions 产物的计费规则。

## 本地打包与最终核对

以下命令不读凭据、不联网、不上传、不部署。`--out-dir` 必须是尚不存在的绝对路径；CLI 只采用仓内 canonical manifest，不接受外部 manifest 或下载地址。

```bash
node scripts/stage-formula-cancellation-v2.mjs \
  --model /absolute/path/cellsentry-minicpm5-2b-cancel2-q4_k_m.gguf \
  --out-dir /absolute/path/new-formula-cancellation-v2-package

node scripts/verify-formula-cancellation-v2-package.mjs \
  --dir /absolute/path/new-formula-cancellation-v2-package
```

staging 在复制前后流式核对模型尺寸和 SHA256，并核对 LICENSE/NOTICE；生成最小 manifest 和 SHA256SUMS。最终 verifier 再按仓内固定规范核对全部五个普通文件、字节数、哈希与 GitHub 大小限制，拒绝缺件、额外文件、目录和符号链接。旁边的 manifest/校验文件不是信任来源；攻击者同时改模型与校验文件也会失败。复制采用系统 COW 请求，实际不支持时由系统普通复制。

许可证来源为作者仓 `cellsentry-team/cellsentry-minicpm5-2b-formula-cancellation-v2` 的固定 Hugging Face revision `ffaa261f5d7732848fb726dd15224035b8e63c8d`，字节数和哈希与 canonical manifest 一致。模型作者已由 jojo 确认为本人；保留原 LICENSE/NOTICE，不再等第三方作者许可。原 canonical manifest 的 `yourblacksky` URL 保留为来源证据，不用作新的官方下载地址。

## 上传与公开（确认后执行）

1. 展示 verifier 的目标、五个文件与固定哈希，取得这次公开上传的明确确认。仅选定 GitHub 方案不替代具体上传确认。
2. 用宿主 `gh` 核对仓库仍为 PUBLIC、目标 tag/Release 不存在，并记录公开 main SHA 与现有 Latest Release；检查目标仓实际 workflows。
3. 用 `gh release create` 创建固定 tag 的 draft，显式指定 `--repo almax000/cellsentry --target <verified-public-sha> --draft --latest=false --title ... --notes-file ...`。不添加 `--generate-notes`，不上传目录 glob。
4. 上传前再次运行 verifier；用 `gh release upload` 显式列出五个绝对文件路径，不用 `--clobber`。逐件对照 GitHub asset 元数据中的文件名、尺寸和 SHA256 digest；检查 draft 只有固定五个用户附件。上传中断就保留 draft 并报告，不能直接公开半包。
5. 全部核对后用 `gh release edit <tag> --repo almax000/cellsentry --draft=false --latest=false` 公开。再核对 Release 的公开状态、固定 tag、全部附件与原 App Latest 不变。任何写动作保持代理，凭据不入代码/日志。

## 公网验证与 App 启用

匿名请求不带 GitHub token，继续使用本机现有 HTTP/HTTPS 代理。检查 GET、HEAD、起点 Range、续传 Range 和整包 SHA256；记录实际重定向链及最终 HTTPS 主机。范围不满足或响应违背预期时应停止，不把旧字节和不匹配版本拼接。

GitHub 下载会连接第三方资产域名，302 不能维持旧“只连自家服务器”承诺。PR #8 关闭未配置下载并使用 `redirect: error`；因此不能只填新 URL 就启用。后续须给固定初始 URL 和实测 GitHub 资产主机实现有限跳数的受控 HTTPS 重定向，拒绝不在清单内的协议/主机，然后完成取消、续传、坏哈希、离线和网络流量验收。当前分支仅准备发行工具，不声称 App 集成完成。

回滚先关闭 App 对该版本的引用；保留已公开 tag/附件和验证记录，不覆盖相同 URL 下的模型字节。需要更换模型就创建新版本。删除公开资产另行决定。

## 本地代码验证

检查全机内存并串行运行。测试只用项目 tmp 下的合成小文件，不读真实医疗资料、不发网络请求。测试依赖放在私有 Worker 子目录，因为公开同步会排除 `website/` 和 `scripts/`；现有安装器 Worker 维持原样，没有 R2 模型路由或 binding。

```bash
node scripts/check-adr-index.mjs
cd website/cf-worker
npm ci
npm run check
npm run build # Wrangler dry-run，只生成本地 bundle
```

## 一手依据

- [GitHub Free](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [Release 限制](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [gh release create](https://cli.github.com/manual/gh_release_create)
- [gh release upload](https://cli.github.com/manual/gh_release_upload)
- [gh release edit](https://cli.github.com/manual/gh_release_edit)
