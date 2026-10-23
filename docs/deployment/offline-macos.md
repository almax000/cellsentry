# macOS 离线首装与 lean 更新

构建方案见已接受的 ADR-0017。此流程只携带公式复核 v2，不代表 PII 模型已交付。实际公开制品版本及签名状态以 Release 说明为准；下述后台准备流程是 RC.20261023.1 之后的增量，不能据 main 源码推断旧安装包已包含它。

## 构件

| 目录 | 内容 | 使用场景 |
|---|---|---|
| `offline/` | 包含固定五文件模型包的 `.app` 与完整 DMG | 新用户离线首装 |
| `update/` | 没有模型的 `.app`、ZIP、更新清单/生成的 blockmap | 已安装用户未来更高版本的程序更新 |

两次构建必须使用相同源码、App ID 和版本，输出目录隔离。更新清单只采用 `update/` 生成的 ZIP；发布时也要包含其 blockmap，不能使用旧工作流的缺失 glob。没有同版更新或发布后立刻剥离 bundle 的行为。

## 本地准备与构建

先运行既有类型检查、单测、`npm run build`、原生 runtime 校验和 `build:docreader`。建立独立 app staging，复制 package.json、package-lock.json、out、resources 和物理独立的 node_modules。不要在共享 node_modules symlink 上运行 electron-builder。

用 `scripts/stage-formula-cancellation-v2.mjs` 的既有产物作为模型包；新工具会再次完整验证固定五文件，不下载模型，不上传。

```sh
node scripts/prepare-offline-mac-build.mjs \
  --app-dir /absolute/candidate/staging/app \
  --model-package /absolute/verified-five-file-package \
  --native-dir /absolute/prepared/darwin-arm64 \
  --out /absolute/new-candidate-output
```

随后在输出 JSON 指定的 `cwd`，串行运行两次 electron-builder。始终显式 `--publish never`。未签名本地候选还需显式 `-c.mac.identity=null -c.mac.notarize=false`，不能把它当发行包。复用已校验同版本 Electron 的本机 `electronDist` 可避免重新下载。

```sh
./node_modules/.bin/electron-builder --mac --arm64 \
  --config /absolute/new-candidate-output/offline.json --publish never \
  -c.mac.identity=null -c.mac.notarize=false
./node_modules/.bin/electron-builder --mac --arm64 \
  --config /absolute/new-candidate-output/update.json --publish never \
  -c.mac.identity=null -c.mac.notarize=false
```

全机只运行一个重型验证。开始前检查内存和其他构建进程。默认工作流未接入此原型：自动从新模型源取权重、上传 HF/SourceForge、发布安装包另行决定。

## 运行时行为

正式目录仍为 `userData/models`；测试可用既有独立目录覆盖。bundle 源只从 `process.resourcesPath/offline-model` 取得。App 先注册 IPC 并创建工作区窗口，再在后台 bootstrap。复制百分比、校验与失败状态经模型状态接口显示；规则脱敏、公式检查和模板提取不等待模型。准备期间禁止模型导入、下载、启动与直接 AI 分析，防止争用；失败后设置页提供空间或重试指导及本地导入恢复。只读源、检查固定清单与普通文件、目标卷容量预检、校验暂存副本 SHA256，许可先提交，模型最后 rename。导入失败不删除旧最终模型。

退出会 abort 当前复制；进程被强制终止遗留的私有 `.offline-importing` 在下次有效 bootstrap 复制前清理。已有正确模型按完整哈希复核后复用；lean 更新没有该载荷时直接保留模型，不额外做启动期全文件读取。运行推理仍沿用 native runtime 的完整 SHA256 校验。

许可、NOTICE、manifest、SHA256SUMS 另存 `models/licenses/<model-version>/`，在程序更新后保留。首装约两份模型占用；运行时不删除 bundle 内容。

## 验收边界

- 检查实际离线 `.app` 恰有五文件模型包；解开实际更新 ZIP，确认没有 GGUF 或 offline-model。
- 用独立 userData 从完整包隐藏启动，验证完整模型哈希、许可、源 bundle 未变；重启复用。
- 先有模型，再用 lean `.app` 启动同一个 userData；确认模型、许可和模型 mtime 不变。此项是文件持久化验收，不能称为真实 electron-updater 安装已通过。
- 真正网络离线测试不通过清空代理或改代理配置来模拟；用没有外部连接的受控测试/观测，另按本机规则验生产网络行为。
- 失败、取消、空间不足和坏哈希以小 fixture 单测覆盖，不改坏真实权重或原有用户目录。
- 签名、公证、Gatekeeper、DMG 隔离属性、真实更高版本下载/安装、全球速度与稳定性仍需单独验证。

## 后台准备的本机验收

使用独立 staging 构建的 `1.1.0-beta.2-rc.20261023.2` 本地未签名 App，通过隐藏窗口、新 userData 和真实固定 1.56 GB 模型验收。首窗 489ms 时仍在 copying，准备完成 5005ms；full 重启首窗 463ms、校验完成 2642ms；lean 首窗 2516ms、包含原生模型加载共 12242ms。缓存、存储及机器负载影响结果，这些数字不是跨机器性能保证，也不是 RC.20261023.1 的成绩。

实际准备中完成了合成文字规则脱敏，import/download/start IPC 均拒绝冲突操作；最终模型 SHA256、四件元数据、重启及 lean 复用、模型 mtime、源包五文件完整性均通过。受控监听器安装后未观测到外部请求，不覆盖最早启动阶段及 updater 的生产行为。没有验收真实 electron-updater 更高版本安装。验收脚本使用 Node 侧轮询 IPC，避免把浏览器内异步谓词当作已完成。
