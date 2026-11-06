$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Test-Path .env)) {
    Write-Warning '.env not found. Copy .env.example to .env and set OPENROUTER_API_KEY.'
}

docker compose up --detach --build --wait
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Prelegal is running at http://localhost:8000'
