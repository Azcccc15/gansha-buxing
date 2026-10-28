$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$privateRoot = Join-Path $projectRoot 'private'
$properties = Join-Path $projectRoot 'android/signing.properties'
if (Test-Path -LiteralPath $properties) { Write-Output '已有签名配置，继续保留。'; exit 0 }
$toolRoot = Join-Path (Split-Path -Parent $projectRoot) '.gansha-tools'
$jdkFolder = Get-ChildItem -LiteralPath (Join-Path $toolRoot 'jdk') -Directory | Select-Object -First 1
New-Item -ItemType Directory -Force -Path $privateRoot | Out-Null
$keyFile = Join-Path $privateRoot 'gansha-release.jks'
if (Test-Path -LiteralPath $keyFile) { throw '发现已有签名文件但缺少配置，请先恢复配置，不会覆盖已有签名。' }
$password = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:GANSHA_STOREPASS = $password
try {
    & (Join-Path $jdkFolder.FullName 'bin/keytool.exe') -genkeypair -keystore $keyFile -storetype JKS -alias gansha -keyalg RSA -keysize 3072 -validity 10000 -storepass:env GANSHA_STOREPASS -keypass:env GANSHA_STOREPASS -dname 'CN=Gansha Buxing, OU=Personal Software, O=Gansha Buxing, C=CN'
    if ($LASTEXITCODE -ne 0) { throw '签名生成失败。' }
    $lines = @('storeFile=../private/gansha-release.jks', ('storePassword=' + $password), 'keyAlias=gansha', ('keyPassword=' + $password))
    [System.IO.File]::WriteAllLines($properties, $lines, [System.Text.Encoding]::ASCII)
    Write-Output '发布签名已生成。请备份 private/gansha-release.jks 和 android/signing.properties，不要上传至 GitHub。'
} finally { Remove-Item Env:GANSHA_STOREPASS -ErrorAction SilentlyContinue }
