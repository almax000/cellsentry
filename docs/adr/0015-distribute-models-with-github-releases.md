# ADR-0015：模型改用 GitHub Releases 免费分发

- **Status**: Accepted
- **Date**: 2026-10-22
- **Deciders**: jojo
- **Drafted by**: Codex（依据本轮方案说明与 jojo 的确认整理）
- **Supersedes**: ADR-0007
- **Superseded by**: —
- **Legacy ID**: —
- **Related**: ADR-0008、ADR-0010、ADR-0011；[模型分发程序](../deployment/model-cdn.md)

## 背景

R2 开通需要支付信息，并按超出免费额度的存储和操作量计费。jojo 担心 1 GB 起步的模型产生额外费用，要求免费替代方案。Codex 核对了 GitHub Releases 和 Hugging Face 的官方限制，说明第三方下载会替代原有“只连自家服务器”的承诺后，jojo 确认：“好，就继续github吧”。本条记录这一已确认的选择，不把它解释为具体上传或合并 PR 的授权。

当前公式模型为 1,561,314,592 bytes，低于 GitHub Release 单附件必须小于 2 GiB 的上限。GitHub Free 支持公开仓库，Release 官方未设置总大小或下载带宽额度。公开仓 `almax000/cellsentry` 已存在；私有开发仓继续保持私有。

## 决定

- 使用 `almax000/cellsentry` 的公开 GitHub Release 分发当前公式模型；暂不开通 R2，也不依赖 Cloudflare 转发模型字节。
- 模型使用独立 `model-` 标签，当前为 `model-formula-cancellation-v2-20261016`；不设为 App 的 Latest Release，不上传 App 更新清单，不触发 `v*` 安装包构建流程。
- 只发行固定 GGUF、LICENSE、NOTICE.txt、manifest.json、SHA256SUMS 五个文件。保留上游来源和许可；模型作者已确认为 jojo。
- 保留 ADR-0007 的其余产品选择：三个任务采用选定模型、按需主动下载、规则装好可用、固定版本与 SHA256、自定义模型和商店暂缓。公式模型只作公式复核，不能用作 PII 模型或自动撤销告警。
- 隐私承诺改为：文件处理和模型推理在本机完成，文件不上传；用户主动下载模型时会连接 GitHub 及其资产分发服务。用户主动检查或下载 App 更新的联网行为另作如实披露，不承诺程序所有联网都只发生在模型下载时。
- 发布前本地核对固定五文件的尺寸、哈希和 <2 GiB 限制；具体公开上传另取确认。匿名公网完整性和下载流程验证通过后，才启用 App 的固定下载源。默认不向未配置或未验证的源发请求。

## 考虑过的方案

| 方案 | 结果 | 理由 |
|---|---|---|
| GitHub Releases | jojo 本轮采用 | 当前模型符合尺寸限制；无需为该分发开通按量计费 |
| Hugging Face 公开模型仓 | 本轮提出，暂不采用 | 适合更大模型，但免费公共存储按尽力提供，并有请求限流 |
| R2 自有 CDN | 暂缓 | 需要支付信息和接受超额自动计费 |
| 自有域名 302 到 GitHub | 起草时补列，不作为隐私解决方案 | 最终仍连接第三方，不能维持旧承诺 |

## 接受的代价

- 下载时连接第三方，不能继续承诺“只连 CellSentry 自己的服务器”。第三方能看到普通下载请求的网络元数据；文件内容不随下载请求上传。
- 受 GitHub 平台策略、可用性与地域网络条件影响，当前没有国内下载速度实测或服务等级保证。
- 单个附件达到 2 GiB 就不能直接沿用此方案。未来大模型需重新评估；不擅自切分 GGUF，也不自动切到付费服务。

## 后果

固定发行包和本地完整性验证可沿用，未部署的 R2 模型路由撤回。现有安装器跳转路由不受影响。App 后续需处理实测的 GitHub HTTPS 重定向链，限制主机与跳数，并验证取消、续传、坏哈希和离线使用；仅填一个 URL 不算集成完成。

## 重新评估的条件

- 任一待发行文件达到 2 GiB，或平台限制/费用政策改变。
- 匿名下载、续传或完整哈希验证不能通过。
- 目标用户所在地实测无法可靠下载。
- 需要改变下载隐私边界或引入付费服务。

## 复盘（Q1–Q5）

### Q1. 上一版做对了什么（这次保留）

按任务主动下载、版本和哈希锁定、处理与推理离线、规则无需模型即可使用，都继续保留。

### Q2. 上一版做错了什么

把“只有自家服务器”与免费分发一并选定前，没有核实 R2 的支付信息要求和超额自动计费边界。

### Q3. 为什么这次不是同一个坑

本轮核对公开仓权限、实际模型字节数与 GitHub 官方单资产限制。选择的是 Release 附件，不混用有不同计费规则的 LFS、Packages 或 Actions 产物；实际发布前仍验证完整包。

### Q4. 什么情况下回退

不能稳定匿名下载或触及尺寸/平台限制时，先保持 App 官方下载关闭和本地导入可用，再由 jojo 决定其他源，不静默开通 R2。

### Q5. 遵守了哪些教训

先核实免费方案的适用边界，再选择并记录取舍；旧 ADR 正文保留，只更新取代状态。付费、公开上传和 PR 合并按各自实际授权执行。

## 相关

- [GitHub Free](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [GitHub Releases 限制](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Hugging Face 存储政策](https://huggingface.co/docs/hub/en/storage-limits)
- [R2 价格](https://developers.cloudflare.com/r2/pricing/)
