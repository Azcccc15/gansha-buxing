# 干啥不行

干啥不行目标规划管理软件 V1.0，面向安卓手机的个人目标规划与行动记录工具。

项目仓库：https://github.com/Azcccc15/gansha-buxing 。当前为私密仓库。

输入目标和期限，由 DeepSeek 拆解方案；必要时只用点选“是／否”补充信息。确认方案后保存行动，完成时再次确认并锁定记录。目标是否真正达成由用户按成果标准明确确认。

## 安卓使用

1. 安装正式签名的 gansha-buxing-v1.0.apk。支持 Android 8.0 及以上，需要更新的 Android System WebView。
2. 打开“设置”，填写自己的 DeepSeek API 密钥并保存，可先测试连接。
3. 在“＋ 新目标”输入目标与周期，检查 AI 方案后确认开始。
4. 在“今日行动”执行任务；完成时再次确认，记录随后锁定。
5. 在设置中开启行动提醒并允许通知，或从行动卡片打开系统日历。

安卓端直接通过 HTTPS 连接 DeepSeek，不需要电脑一直运行。密钥使用 Android Keystore 加密保存，不内置于 APK。目标和记录保存在当前设备；卸载或清除数据会移除记录。支持导出 JSON 留存，暂不支持导入恢复。

## 已实现

- 任意领域的文字目标与期限、AI 阶段方案、成果标准和建议时间。
- 一轮简短是非题，优先一道、最多三道，支持修改与失败重试。
- 确认方案后保存目标，后续行动每次最多生成七天并再次确认。
- 未完成行动可删除；完成记录锁定；结束目标保留完成历史。
- 单项和当日行动反馈、单独的目标达成庆祝与成就历史。
- 安卓本地通知、重启和时区变化后恢复未到期提醒、系统日历入口。
- 密钥加密保存、个人记录导出、隐私说明与错误处理。

通知使用非精确系统调度，可能受省电、通知权限和强行停止应用影响。AI 使用用户自己的账户额度，不自动进行付费重试，也不保证健康、收入或考试等现实结果。

## 电脑开发预览

需要 Node.js 22 或更新版本，无需服务端依赖。双击“启动接口.cmd”，打开 http://localhost:8787 ，在设置中填写本机密钥。调试页面位于 /developer。浏览器与手机的记录分别保存在各自设备，不进行云同步。

    cd api
    node src/server.mjs

    node --test

## 安卓构建

使用 Android Studio 打开 android 文件夹，或在 JDK 17、SDK 35 环境下运行：

    cd android
    ./gradlew assembleDebug lintDebug testDebugUnitTest

Windows 使用 gradlew.bat。正式签名配置见 android/signing.properties.example，不要上传真实配置或签名文件；未配置签名时 release 产物未签名。CI 构建可安装的调试包供测试。

本机可用 tools/bootstrap_android.py 准备工具，使用 tools/prepare-signing.ps1 生成本机签名、tools/build-android.ps1 构建。构建从 api/public 和 api/src/system-prompt.txt 同步资源，不要修改生成的 assets 目录。

这些 Windows 辅助脚本使用 PowerShell 7；Python 脚本需要 Python 3.9 或更新版本。中文目录下的 Java 测试可使用 tools/build-android-ascii.ps1，在临时英文路径完成构建。也可直接在英文路径使用 Android Studio，不依赖本机构建辅助脚本。

## 项目结构

    api/public/       共用界面与目标记录逻辑
    api/src/          电脑开发服务、DeepSeek 接口和结构校验
    api/test/         接口与数据规则检查
    android/          安卓壳、密钥、网络和系统联动
    docs/             使用说明、接口、隐私和发布说明
    tools/            构建、检查和材料整理

交付生成文件位于 deliverables，个人申请材料与签名位于 private，均不进 Git 仓库。

## 发布与登记

GitHub 操作见 docs/RELEASE.md。仓库包含自动检查流程，目前未选择开源许可证，权利说明见 COPYRIGHT.md。公开访问与 MIT 等开源授权是不同的决定。

软著材料使用真实生产源码和操作说明。姓名、版本、实际功能、完成和发表信息应据实统一。身份证明、实名认证、本人签章须由著作权人在官方系统完成，不得上传公共仓库。公开 GitHub 仓库后需据实更新发表状态。

详细说明见 docs/USER_GUIDE.md、docs/ARCHITECTURE.md、docs/API.md、docs/PRIVACY.md。
