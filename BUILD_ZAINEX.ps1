$ErrorActionPreference = "Stop"

$Project  = "C:\Users\FARMINIUM\Desktop\zainex"
$Backend  = Join-Path $Project "backend"
$Frontend = Join-Path $Project "frontend"
$Stamp    = Get-Date -Format "yyyyMMdd_HHmmss"
$LogDir   = Join-Path $Project "_zainex_logs"
$Log      = Join-Path $LogDir "zainex_build_$Stamp.txt"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Start-Transcript -Path $Log -Force | Out-Null

$BuildOk = $false

try {
    Set-Location $Backend

    php artisan test

    if ($LASTEXITCODE -ne 0) {
        throw "Laravel tests failed."
    }

    php artisan route:list --path=api

    if ($LASTEXITCODE -ne 0) {
        throw "Laravel API route check failed."
    }

    Set-Location $Frontend

    npm.cmd run lint

    if ($LASTEXITCODE -ne 0) {
        throw "Frontend lint failed."
    }

    npx.cmd tsc --noEmit --pretty false

    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript check failed."
    }

    npm.cmd run build

    if ($LASTEXITCODE -ne 0) {
        throw "Next.js build failed."
    }

    $BuildOk = $true

    Write-Host "BUILD_OK=True" -ForegroundColor Green
}
catch {
    Write-Host "BUILD_OK=False" -ForegroundColor Red
    Write-Host "ERROR=$($_.Exception.Message)" -ForegroundColor Red
}
finally {
    try {
        Stop-Transcript | Out-Null
    }
    catch {
    }

    Write-Host "LOG=$Log"
    notepad.exe $Log
}

if (-not $BuildOk) {
    throw "ZAINEX build did not complete successfully."
}