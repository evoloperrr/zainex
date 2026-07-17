$ErrorActionPreference = "Stop"

$Project  = "C:\Users\FARMINIUM\Desktop\zainex"
$Backend  = Join-Path $Project "backend"
$Frontend = Join-Path $Project "frontend"

if (-not (Test-Path $Backend)) {
    throw "Backend folder not found: $Backend"
}

if (-not (Test-Path $Frontend)) {
    throw "Frontend folder not found: $Frontend"
}

Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Backend'; php artisan serve --host=127.0.0.1 --port=8000"
)

Start-Sleep -Seconds 2

Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Frontend'; npm.cmd run dev"
)

Write-Host "ZAINEX_DEV_STARTED=True" -ForegroundColor Green
Write-Host "Frontend=http://localhost:3000"
Write-Host "Backend=http://127.0.0.1:8000"
Write-Host "API Health=http://127.0.0.1:8000/api/health"