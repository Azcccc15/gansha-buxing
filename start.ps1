$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'api')
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($taskNodeCommand) {
    $taskNodePath = $taskNodeCommand.Source
} else {
    $taskNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $taskNodePath)) {
    throw 'Please install Node.js 22 or later.'
}
& $taskNodePath (Join-Path $PSScriptRoot 'api\src\server.mjs')
