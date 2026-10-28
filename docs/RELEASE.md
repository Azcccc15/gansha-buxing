# GitHub 发布操作

1. 先使用私密仓库保存代码。交付目录中的 GitHub 源码包不含真实密钥、签名文件、个人申请材料或本地工具缓存。
2. 在自己的 GitHub 账号新建空仓库，建议仓库名 gansha-buxing。将源码包解压后的内容上传，或者在项目目录添加自己的远程仓库地址后推送 main 分支。
3. 仓库已提供自动检查流程：Node 接口和数据规则检查、安卓测试包构建及 Android Lint。远程执行结果要在 Actions 页面核实，本地通过不代表远程已经运行。
4. 安装包建议通过 GitHub Releases 发布，版本标签 v1.0.0。交付的正式签名 APK 与 CI 自动生成的调试包分开使用。签名私密备份必须单独保管，不上传仓库或公开 Release。
5. 若决定使用开源许可证，需要由权利人另行选择。目前只提供权利保留说明，公开访问不等于 MIT 或 Apache 授权。
6. 公开仓库或公开发布安装包可能影响软著表格中的“发表状态”。首次公开日期、地点和开发完成日期应按实际情况填写；不能在公开后继续声称尚未发表。

2026年10月28日已创建私密仓库 https://github.com/Azcccc15/gansha-buxing 并上传 main 分支。首次源码上传的接口测试与安卓构建检查均已通过。尚未将仓库改为公开、发布安装包 Release 或提交软著申请。实际公开发布前请核对软著填报中的发表状态。

## 本机构建

使用 JDK 17、Android SDK 35、Build Tools 35.0.0、Gradle 8.11.1、Android Gradle Plugin 8.9.3。使用 Android Studio 打开 android 文件夹后同步构建；也可使用 Gradle Wrapper。

安卓源码使用 Java 17，最低 Android 8.0（API 26），需要更新的 Android System WebView。运行时只依赖系统库，无广告或分析 SDK。界面资源由构建任务从 api/public 同步，AI 提示词从 api/src/system-prompt.txt 同步，请修改源文件而非生成目录。

正式签名在本机 android/signing.properties 配置，示例为 android/signing.properties.example。配置及对应签名文件都不进仓库。没有签名配置时 assembleRelease 只生成未签名产物，不能将其当成已签名安装包交付。

Windows 中文目录可能影响 Java 测试进程，可使用 tools/build-android-ascii.ps1 -Release：在本机临时目录创建受标记保护的构建副本，构建通过后复制产物和报告回项目；临时签名副本会在结束时移除。使用前需已准备本机工具和签名。详细验证与待设备确认范围见 docs/VERIFICATION.md。
