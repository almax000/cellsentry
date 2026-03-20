============================================================
  CellSentry Beta — Installation Guide
============================================================

STEP 1: Drag "CellSentry Beta" to the Applications folder.

STEP 2: If macOS says the app "is damaged" or "can't be
        opened", open Terminal and run:

        xattr -cr /Applications/CellSentry\ Beta.app

        Then open the app again.

STEP 3: On first launch, the AI model (~1 GB) will download
        automatically. This takes 1-2 minutes.

WHY THIS HAPPENS: CellSentry is open source (MIT) and not
signed with an Apple Developer certificate ($99/year).
macOS quarantines unsigned apps downloaded from the internet.
The xattr command removes this quarantine flag.

Website:  https://cellsentry.pro
GitHub:   https://github.com/almax000/cellsentry
Support:  https://github.com/almax000/cellsentry/issues

============================================================
  CellSentry Beta — 安装指南
============================================================

步骤 1: 将 "CellSentry Beta" 拖入 Applications 文件夹。

步骤 2: 如果 macOS 提示应用"已损坏"或"无法打开"，
        请打开终端，运行：

        xattr -cr /Applications/CellSentry\ Beta.app

        然后重新打开应用。

步骤 3: 首次启动时，AI 模型（约 1 GB）将自动下载，
        大约需要 1-2 分钟。

为什么会出现这个提示：CellSentry 是开源软件 (MIT)，
没有 Apple 开发者证书签名（$99/年）。macOS 会对从
网上下载的未签名应用进行隔离。xattr 命令用于移除
这个隔离标记。
