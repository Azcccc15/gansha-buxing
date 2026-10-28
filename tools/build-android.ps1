param([switch]$Release, [string]$SourceRoot)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path (Split-Path -Parent $projectRoot) '.gansha-tools'
$toolAlias = Join-Path $env:TEMP 'gansha-android-tools'
if (-not (Test-Path -LiteralPath $toolAlias)) { New-Item -ItemType Junction -Path $toolAlias -Target $toolRoot | Out-Null }
if ((Get-Item -LiteralPath $toolAlias).Target -ne $toolRoot) { throw '测试工具别名已由其他内容占用。' }
$toolRoot = $toolAlias
$jdkFolder = Get-ChildItem -LiteralPath (Join-Path $toolRoot 'jdk') -Directory | Select-Object -First 1
if (-not $jdkFolder) { throw '请先运行 tools/bootstrap_android.py 或安装 JDK 17 和 Android SDK。' }
$env:JAVA_HOME = $jdkFolder.FullName
$env:ANDROID_HOME = Join-Path $toolRoot 'sdk'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-cache'
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
$gradle = Join-Path $toolRoot 'gradle-8.11.1/bin/gradle.bat'
$tasks = if ($Release) { @('assembleRelease', 'lintRelease', 'testReleaseUnitTest') } else { @('assembleDebug', 'lintDebug', 'testDebugUnitTest') }
$buildRoot = if ($SourceRoot) { $SourceRoot } else { $projectRoot }
Push-Location (Join-Path $buildRoot 'android')
try {
    & $gradle --no-daemon --console=plain @tasks
    if ($LASTEXITCODE -ne 0) { throw '安卓构建未通过，请查看上方错误。' }
} finally { Pop-Location }
