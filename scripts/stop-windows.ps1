$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

docker compose down
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
