param([switch]$Release)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path $env:TEMP 'gansha-build-v1'
$marker = Join-Path $stageRoot '.gansha-source'
if (Test-Path -LiteralPath $stageRoot) {
    if (-not (Test-Path -LiteralPath $marker) -or [System.IO.File]::ReadAllText($marker) -ne $projectRoot) { throw '构建缓存目录不是本项目创建的，未覆盖。' }
} else {
    New-Item -ItemType Directory -Path $stageRoot | Out-Null
    [System.IO.File]::WriteAllText($marker, $projectRoot)
}
$files = @('api/src/system-prompt.txt','android/settings.gradle','android/build.gradle','android/gradle.properties','android/app/build.gradle','android/app/src/main/AndroidManifest.xml')
foreach ($folder in @('api/public','android/app/src/main/java','android/app/src/main/res','android/app/src/test')) {
    $full = Join-Path $projectRoot $folder
    Get-ChildItem -LiteralPath $full -File -Recurse | ForEach-Object { $files += [System.IO.Path]::GetRelativePath($projectRoot, $_.FullName) }
}
if ($Release) { $files += @('private/gansha-release.jks','android/signing.properties') }
foreach ($file in $files) {
    $source = Join-Path $projectRoot $file
    $destination = Join-Path $stageRoot $file
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}
try {
    & (Join-Path $PSScriptRoot 'build-android.ps1') -Release:$Release -SourceRoot $stageRoot
    foreach ($folder in @('outputs/apk','reports','test-results')) {
        $source = Join-Path $stageRoot ('android/app/build/' + $folder)
        $destination = Join-Path $projectRoot ('android/app/build/' + $folder)
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Get-ChildItem -LiteralPath $source | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force }
    }
} finally {
    foreach ($file in @('private/gansha-release.jks','android/signing.properties')) {
        $temporarySecret = [System.IO.Path]::GetFullPath((Join-Path $stageRoot $file))
        if (-not $temporarySecret.StartsWith([System.IO.Path]::GetFullPath($stageRoot) + [System.IO.Path]::DirectorySeparatorChar)) { throw '临时文件路径检查失败。' }
        if (Test-Path -LiteralPath $temporarySecret) { Remove-Item -LiteralPath $temporarySecret -Force }
    }
}
