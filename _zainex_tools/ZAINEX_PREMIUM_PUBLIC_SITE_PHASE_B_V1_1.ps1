& {
    $ErrorActionPreference = "Stop"
    Set-StrictMode -Version 2.0

    $ZainexRoot = "C:\Users\FARMINIUM\Desktop\zainex"
    $AimagentRoot = "C:\Users\FARMINIUM\Desktop\aimagent"
    $Root = $ZainexRoot
    $Front = Join-Path $Root "frontend"
    $Logs = Join-Path $Root "_zainex_logs"
    $Backups = Join-Path $Root "_zainex_backups"
    $Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $BackupDir = Join-Path $Backups "premium_public_site_phase_b_v1_1_$Stamp"
    $ReportPath = Join-Path $Logs "ZAINEX_PREMIUM_PUBLIC_SITE_PHASE_B_V1_1_$Stamp.txt"
    $RollbackPath = Join-Path $BackupDir "ROLLBACK_PREMIUM_PUBLIC_SITE_PHASE_B_V1_1.ps1"
    $TscOut = Join-Path $Logs "PREMIUM_PUBLIC_SITE_PHASE_B_V1_1_TSC_OUT_$Stamp.txt"
    $TscErr = Join-Path $Logs "PREMIUM_PUBLIC_SITE_PHASE_B_V1_1_TSC_ERR_$Stamp.txt"
    $BuildOut = Join-Path $Logs "PREMIUM_PUBLIC_SITE_PHASE_B_V1_1_BUILD_OUT_$Stamp.txt"
    $BuildErr = Join-Path $Logs "PREMIUM_PUBLIC_SITE_PHASE_B_V1_1_BUILD_ERR_$Stamp.txt"

    $RootPage = Join-Path $Front "src\app\page.tsx"
    $Layout = Join-Path $Front "src\app\layout.tsx"
    $Proxy = Join-Path $Front "src\proxy.ts"
    $Globals = Join-Path $Front "src\app\globals.css"
    $Package = Join-Path $Front "package.json"
    $Component = Join-Path $Front "src\components\public-site\public-site.tsx"
    $Css = Join-Path $Front "src\components\public-site\public-site.module.css"
    $Report = New-Object System.Collections.Generic.List[string]
    $Success = $false
    $BackupReady = $false

    function Log {
        param([AllowNull()][string]$Text = "")
        if ($null -eq $Text) { $Text = "" }
        [void]$Report.Add($Text)
        Write-Host $Text
    }

    function Expand-GzipBase64 {
        param([string]$Text)
        $Bytes = [Convert]::FromBase64String(($Text -replace "\s",""))
        $Input = New-Object System.IO.MemoryStream -ArgumentList (, $Bytes)
        $Gzip = New-Object System.IO.Compression.GzipStream -ArgumentList @(
            $Input,
            [System.IO.Compression.CompressionMode]::Decompress
        )
        $Reader = New-Object System.IO.StreamReader -ArgumentList @(
            $Gzip,
            [System.Text.Encoding]::UTF8
        )
        try { return $Reader.ReadToEnd() }
        finally { $Reader.Dispose(); $Gzip.Dispose(); $Input.Dispose() }
    }

    function Write-Utf8 {
        param([string]$Path,[string]$Content)
        New-Item -ItemType Directory -Path (Split-Path $Path -Parent) -Force | Out-Null
        $Encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($Path,$Content,$Encoding)
    }

    function Run-Command {
        param([string]$Command,[string]$Out,[string]$Err)
        Remove-Item -LiteralPath $Out -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $Err -Force -ErrorAction SilentlyContinue
        Log "COMMAND=$Command"
        $Process = Start-Process -FilePath $env:ComSpec -ArgumentList @(
            "/d","/s","/c",$Command
        ) -WorkingDirectory $Front -Wait -PassThru -NoNewWindow `
          -RedirectStandardOutput $Out -RedirectStandardError $Err
        if (Test-Path -LiteralPath $Out -PathType Leaf) {
            Get-Content -LiteralPath $Out | ForEach-Object { Log ([string]$_) }
        }
        if (Test-Path -LiteralPath $Err -PathType Leaf) {
            Get-Content -LiteralPath $Err | ForEach-Object { Log ([string]$_) }
        }
        Log "EXIT_CODE=$($Process.ExitCode)"
        return [int]$Process.ExitCode
    }

    $NewRouteFiles = @(
        "src\app\platform\page.tsx"
        "src\app\markets\page.tsx"
        "src\app\intellibrain\page.tsx"
        "src\app\strategies\page.tsx"
        "src\app\wallets\page.tsx"
        "src\app\security\page.tsx"
        "src\app\company\page.tsx"
    )

    function Restore-All {
        if ($BackupReady) {
            Copy-Item -LiteralPath (Join-Path $BackupDir "page.tsx.before") -Destination $RootPage -Force
            Copy-Item -LiteralPath (Join-Path $BackupDir "layout.tsx.before") -Destination $Layout -Force
            Copy-Item -LiteralPath (Join-Path $BackupDir "proxy.ts.before") -Destination $Proxy -Force
        }
        foreach ($Relative in $NewRouteFiles) {
            $Target = Join-Path $Front $Relative
            if (Test-Path -LiteralPath $Target -PathType Leaf) { Remove-Item -LiteralPath $Target -Force }
        }
        Log "PHASE_A_FILES_PRESERVED=True"
        Log "AUTOMATIC_RESTORE=True"
    }

    try {
        New-Item -ItemType Directory -Path $Logs -Force | Out-Null
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        Log "ZAINEX PREMIUM PUBLIC SITE PHASE B V1.1"
        Log "Generated=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
        Log "ProjectRoot=$Root"
        Log "TARGET=INSTALL_EIGHT_PUBLIC_ROUTES_LAYOUT_AND_PROXY"
        Log "VALIDATION_FIX=EXACT_MATCHER_LINES_ONLY"
        Log "PHASE_A_PRESERVED_ON_FAILURE=True"
        Log "BACKEND_CHANGED=False"
        Log "DATABASE_CHANGED=False"
        Log "TRADING_SOURCE_CHANGED=False"
        Log "PROCESSES_KILLED=False"
        Log ""

        $PhaseAGuards = @(
            @{ Path = $Component; Hash = "D5C1B58D637A7727ED6374C237317D81486A3668C11CAD7CFE6AEC75A18CFFEF" }
            @{ Path = $Css; Hash = "0388EF6278B2F2B79D2785B0E05B697B1370AC8190AC021E38627AA18A77CC37" }
        )
        foreach ($Guard in $PhaseAGuards) {
            if (-not (Test-Path -LiteralPath $Guard.Path -PathType Leaf)) { throw "Run Phase A first: $($Guard.Path)" }
            $Actual = (Get-FileHash -LiteralPath $Guard.Path -Algorithm SHA256).Hash
            Log "PHASE_A_FILE=$($Guard.Path)|ACTUAL_SHA256=$Actual"
            if ($Actual -ne $Guard.Hash) { throw "Phase A hash guard failed: $($Guard.Path)" }
        }

        $ExistingGuards = @(
            @{ Path = $RootPage; Hash = "49168ECCF9F6EC9EEB4C0940268C740012F52F143F6D0974EA0F0E6632896BCC" }
            @{ Path = $Layout; Hash = "043830F1C2762D8897ACC346B41065C011FDAA212E017DF5A85237154B5B3D52" }
            @{ Path = $Proxy; Hash = "9BF858C43DAC5683D63116B4726D61B450E26E38B43D36CC62BFA693E31BE165" }
            @{ Path = $Globals; Hash = "57F2AA9E85B498927A22357E226E051D9790889ED2EC478A33AE11CE8B944873" }
            @{ Path = $Package; Hash = "02AD60F826D4A9A3B7F14F280577AAAF1582583D2EA36AC92E28C506443C47A8" }
        )
        foreach ($Guard in $ExistingGuards) {
            $Actual = (Get-FileHash -LiteralPath $Guard.Path -Algorithm SHA256).Hash
            Log "FILE=$($Guard.Path)|ACTUAL_SHA256=$Actual"
            if ($Actual -ne $Guard.Hash) { throw "Current source hash guard failed: $($Guard.Path)" }
        }
        foreach ($Relative in $NewRouteFiles) {
            $Target = Join-Path $Front $Relative
            if (Test-Path -LiteralPath $Target -PathType Leaf) { throw "New route already exists: $Target" }
        }

        Copy-Item -LiteralPath $RootPage -Destination (Join-Path $BackupDir "page.tsx.before") -Force
        Copy-Item -LiteralPath $Layout -Destination (Join-Path $BackupDir "layout.tsx.before") -Force
        Copy-Item -LiteralPath $Proxy -Destination (Join-Path $BackupDir "proxy.ts.before") -Force
        $BackupReady = $true

        $Rollback = New-Object System.Collections.Generic.List[string]
        [void]$Rollback.Add('$ErrorActionPreference = "Stop"')
        [void]$Rollback.Add(('$Front = "{0}"' -f $Front))
        [void]$Rollback.Add(('Copy-Item -LiteralPath "{0}" -Destination "{1}" -Force' -f (Join-Path $BackupDir "page.tsx.before"),$RootPage))
        [void]$Rollback.Add(('Copy-Item -LiteralPath "{0}" -Destination "{1}" -Force' -f (Join-Path $BackupDir "layout.tsx.before"),$Layout))
        [void]$Rollback.Add(('Copy-Item -LiteralPath "{0}" -Destination "{1}" -Force' -f (Join-Path $BackupDir "proxy.ts.before"),$Proxy))
        [void]$Rollback.Add('$Targets = @(')
        [void]$Rollback.Add('    "src\app\platform\page.tsx"')
        [void]$Rollback.Add('    "src\app\markets\page.tsx"')
        [void]$Rollback.Add('    "src\app\intellibrain\page.tsx"')
        [void]$Rollback.Add('    "src\app\strategies\page.tsx"')
        [void]$Rollback.Add('    "src\app\wallets\page.tsx"')
        [void]$Rollback.Add('    "src\app\security\page.tsx"')
        [void]$Rollback.Add('    "src\app\company\page.tsx"')
        [void]$Rollback.Add(')')
        [void]$Rollback.Add('foreach ($Relative in $Targets) { $Target = Join-Path $Front $Relative; if (Test-Path -LiteralPath $Target -PathType Leaf) { Remove-Item -LiteralPath $Target -Force } }')
        [void]$Rollback.Add('Set-Location -LiteralPath $Front')
        [void]$Rollback.Add('npx.cmd tsc --noEmit --pretty false')
        [void]$Rollback.Add('Write-Host "Premium public site rollback complete." -ForegroundColor Green')
        $RollbackEncoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($RollbackPath,$Rollback,$RollbackEncoding)
        Log "BACKUP_DIR=$BackupDir"
        Log "ROLLBACK_SCRIPT=$RollbackPath"

        $Files = @(
            @{
                Relative = "src\app\page.tsx"
                Expected = "CB2FB7A5F054A4C837862AD076A71C9B1C8644F0FB8A6D55341150501D892D8A"
                Data = @'
H4sIAA+HWWoC/03NQQrCMBQE0P0/xZCVgpIDVMWly0JPUOOPBpqfkP6AIL27IRvdDcxjJsSciuJDwFjvS3BTUD7QBl9ShLlal5oQFl1t7uC4NvGfzUDE7z7z
YD/XReGrOA1JcEuRx/nJu32/KKy1CE6/K+TWns2rOQN7GWijL1CxUqCTAAAA
'@
            }
            @{
                Relative = "src\app\platform\page.tsx"
                Expected = "9CF14912076301919B0C40A409CF832DA46D581126B20EEEA195FEE7922D8164"
                Data = @'
H4sIAA+HWWoC/03NUQpCIRAF0P9ZxeBXQeECXkVLEFqB2RiCjjJvhCDe3hMJ6u/CPdybSqui+AZE1+85hVtSOsCGUWpBc7WhDsHEuto2wXEd4j+bBYBec+ZB
0fesGDsHTZXRZa+xSnH+Sbv9vBHSLoyn3x220Z5N+1qD9rLABh+aBqJVmwAAAA==
'@
            }
            @{
                Relative = "src\app\markets\page.tsx"
                Expected = "B2ABBADB7E2D31B38D53891A8B51CFB7A9312F141D622F610EDD823A130B157B"
                Data = @'
H4sIAA+HWWoC/03NQQoCMQwF0H1OEbpSUHqAUfECwoAnqDWV4jQtaQqCzN0tdaG7D//xf0wli+IbEOd2W6K/RqUdrBgkJzRn63MXTKzVlgH2tYv/bCYAeo2Z
OwXXFsXQ2GvMjBcnT9I6uwdttuNFSJswHn5vWHp7NOlLDdrTBCt8AAhEYH6ZAAAA
'@
            }
            @{
                Relative = "src\app\intellibrain\page.tsx"
                Expected = "BF09097F1DEB280722578D47D1334B569275ECAB4CE8EC1ED31DABE8AA7C3743"
                Data = @'
H4sIAA+HWWoC/03NQQrCMBAF0P2cYshKQckBqiLu3BU8QRonMpBOQjoBQXp302x09+E//uc5p6L4AcSxTpH9g5UOsGIoaUZztT41ISS62NzBcWniP5sBgN59
5knB1agYqnjlJHgXpci34lhG96Ldvj8V0loET79HzK09G9545GnzBu1lgBW+fU5CcKIAAAA=
'@
            }
            @{
                Relative = "src\app\strategies\page.tsx"
                Expected = "C7961C6C654FD4253D69471B7C29CAA7380D810B990FE4CD896ACDE98B1754B9"
                Data = @'
H4sIAA+HWWoC/03NQQrCMBAF0P2cYshKQckBquIRCj1BTCdloJ2EZAKC9O6GLKq7D//xP28pZsUPII71tbKfWOkCO4YcNzRP62MTQqLFpg6upYn/bAYAeveZ
mYKrq2Ko4pWj4KTZKS1MZXQLnc79KJPWLHj7HWJq7d2UQxu0jwF2+AJzpZ79nwAAAA==
'@
            }
            @{
                Relative = "src\app\wallets\page.tsx"
                Expected = "E64B66E162A4BF55FF07A5ADC6A3E4E48FF9BE2EE9ABC27707536E454FEF8A4A"
                Data = @'
H4sIAA+HWWoC/03NwQpCIRQE0P39isFVQeEHvIo+4UGL1mbXEHwqeqUg3r8ntqjdwBxm/JJTEbwJmNsteHvxwjta4UpaoM7api4iR6k6D7CvXfxnNRHxa8zc
2ZkWBK5FKz5FXE0ILHU2D95sx0thaSXi8HtD7u1RPb9UQZ8mWukDdLT785kAAAA=
'@
            }
            @{
                Relative = "src\app\security\page.tsx"
                Expected = "437809A2B19EC9D7460B1F8A474C8EFC6C88942BF8B68C1B7DC4FD8ADF68A57F"
                Data = @'
H4sIAA+HWWoC/03NUQoCMQwE0P+cIvRLQekBVsUjLOwJ1ppKYDctaQqK7N0tRdC/gXnM8JqTGr4Bcay3hcPERgfYMGpa0V19SE0IiRWfOziWJv6zGwDo2Wfu
FOe6GMYqwTgJThSqsr3G+UG7fb9RsqqCp98d5taeXflah/4ywAYfVEhqrJsAAAA=
'@
            }
            @{
                Relative = "src\app\company\page.tsx"
                Expected = "91C8B346A370BC4581E944716A18B6B511BAC169EFF84B5B839023F1D70BFF88"
                Data = @'
H4sIAA+HWWoC/02NQQoCMRAE7/OKJicFJQ9YFcEPLPiCGCcS2J2E7AQU2b8b4kFvDV3dFeeciuJNwFhvU/TXqLyjFaGkGeZsfWqEsOhicwf2SyP+sxmI+Nlv
7hxcnRShiteYBJe2dvIa3YM3224prLUIDj8bcmuPxn9RA3saaKUPfxseJZkAAAA=
'@
            }
            @{
                Relative = "src\app\layout.tsx"
                Expected = "2E3E2507593C95A6C11C575A25999A1C634D1DBC2E7FCE59E6339C39A31C5DC0"
                Data = @'
H4sIAA+HWWoC/21SwW7bMAy9+ysIAwNawEvubhqghx0CrDn0VGzYQZFoV4hMGhLdxOj875PkOM2AXgiK5Ht8T5LtevYCMvYIHwXAM4oySlRVTNB47qAkPEv5
UBR2nixX69bxQbmw0iGkBp5zQzMFge6Cr69M8JiJxYrDOqcABhs1OKnzAaD89bTb/3iFv/C0+75XYt8RnpU/osCOBJ2zLZLGssrzgl3vlOAV/S1E5EyRR6YU
DAbtbS+WaR5clgxkG4sBunmBvVlQRZSg7yzZIFaDt+GYfIlnF6qIoEE56FWPHvCMekjsFQTxUU4bSSs4KedQYqLIRDegPRorIa4BJoTec4MhRFgiii4a9t0q
qz7ieGJvQg2/b/VeTJeRK64xltorbmnNgi7dpfiFvaWVbUUzqsUOSZay9mMv/B/PnxQ8H1jC8nSWDJ7rODXgjGvYOT59VuLtT5+/4vLS0Ayk023BC7P8VCMP
cpcI9Zt1xiNFUA0vqAyTGze3nVzWsspxzwYfiml7n9V4lMET3GUdmzfpHDhF7WOJVG4vv2NzYDNuPxa2abPOhRmyTpiU30fS4h+CidSTDAMAAA==
'@
            }
            @{
                Relative = "src\proxy.ts"
                Expected = "7D1767A11F275BE94E1612BD1F9C75958ED1804117205400DD01F4C64989CDA5"
                Data = @'
H4sIAA+HWWoC/31U34+TQBB+568YeaKmB17iU5taayWVpD/OtqjRGLLCQNcubN1d7CWX/u/uAhXaXu4FmJlvZr7ZbxaaH7hQ8GQBkFLt+tYJUsFzsN97xraH
lkVbyBIf1RrlgRcSW2ihvZ5E8ReFwXsefJ8ES/9btAjn2yAKN/46mq1Ws7kfTcLtp+jLfQfzsPYXQbiIHsIP82AabYKtbwAWPlZdE0xJyVRFznEE/ilRqh6M
3lV8Yk1EAeaEMhhpG6BBuAY/dkvNauxW8SoKMHaVoLnTa0xX8Tk/opgSiU4PxmOwzQgANAWnrvtqNNLOXtXP1FelKC4OwjXzO72hjp/OqRdcTDwUzD0QtStI
jq5URCj5leqRGh62Rw7Us/uVaci91O+35MU58al5A/D9AFLCjDBnFwrBxaCDMSeW4KBj69ZGE3+5DaaTbbBaRmv/cxis/Y92vwPLUUqSXWduaFYALeCoJwEC
Wn+aUkxgxnnGEEgc87JQbqfS6fz5/6Mlp09FlXIAb9/ctwk7JAkKeTmEPSXxDu+mvFCCM3ugV5DfScUFvtCqFajeGrMhWpWrvTlrFTNeoBG1uRhd/WBk9Kpv
RxuVSES8M7F6g55TTmBCBcaqVq/JNPR0o5Np1mx9zVA/U5rpimb2nCg9s1bzh1UvTE7EHpU3MKxeN3Pb3pEwduv9RRmjRXYD5mKfMn689h8ETynDazeh+pAF
UZhRlDdBvb/PUzIRnZZcEfipfyBD6x91tZBrgAQAAA==
'@
            }
        )
        foreach ($File in $Files) {
            $Target = Join-Path $Front $File.Relative
            Write-Utf8 -Path $Target -Content (Expand-GzipBase64 -Text $File.Data)
            $Actual = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash
            Log "WRITTEN=$Target|ACTUAL_SHA256=$Actual"
            if ($Actual -ne $File.Expected) { throw "Generated file hash failed: $Target" }
        }

        $ProxyText = Get-Content -LiteralPath $Proxy -Raw
        $RootMatcherCount = ([regex]::Matches($ProxyText,'(?m)^\s*"/",\s*$')).Count
        Log "ROOT_PROTECTED_MATCHER_COUNT=$RootMatcherCount"
        if ($RootMatcherCount -ne 0) { throw "Root route remains protected." }
        foreach ($Matcher in @("/market/:path*","/wallet/:path*","/ai-strategies/:path*","/api/trading/:path*")) {
            $MatcherPattern = '(?m)^\s*"' + [regex]::Escape($Matcher) + '",?\s*$'
            $Count = ([regex]::Matches($ProxyText,$MatcherPattern)).Count
            Log "PROTECTED_MATCHER=$Matcher|EXACT_LINE_COUNT=$Count"
            if ($Count -ne 1) { throw "Protected matcher exact-line verification failed: $Matcher" }
        }
        $RouteFiles = @(
            "src\app\page.tsx"
            "src\app\platform\page.tsx"
            "src\app\markets\page.tsx"
            "src\app\intellibrain\page.tsx"
            "src\app\strategies\page.tsx"
            "src\app\wallets\page.tsx"
            "src\app\security\page.tsx"
            "src\app\company\page.tsx"
        )
        foreach ($Relative in $RouteFiles) {
            $Text = Get-Content -LiteralPath (Join-Path $Front $Relative) -Raw
            $Count = ([regex]::Matches($Text,"PublicSite page=")).Count
            Log "ROUTE_FILE=$Relative|PUBLIC_SITE_COUNT=$Count"
            if ($Count -ne 1) { throw "Public route verification failed: $Relative" }
        }

        $TscExit = Run-Command -Command "npx.cmd tsc --noEmit --pretty false" -Out $TscOut -Err $TscErr
        if ($TscExit -ne 0) { throw "Phase B TypeScript validation failed." }

        $Locks = @(
            (Join-Path $Front ".next\dev\lock")
            (Join-Path $Front ".next\lock")
        ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
        if (@($Locks).Count -gt 0) {
            Log "BUILD_SKIPPED=True"
            Log "BUILD_SKIP_REASON=NEXT_DEV_LOCK_PRESENT"
            foreach ($Lock in $Locks) { Log "NEXT_LOCK=$Lock" }
        }
        else {
            $BuildExit = Run-Command -Command "npm.cmd run build" -Out $BuildOut -Err $BuildErr
            if ($BuildExit -ne 0) { throw "Phase B production build failed." }
            Log "BUILD_SKIPPED=False"
            Log "BUILD_PASSED=True"
        }

        Log "PATCH_SUCCESS=True"
        Log "PUBLIC_PAGE_COUNT=8"
        Log "SPA_CLIENT_NAVIGATION=True"
        Log "PUBLIC_HOME_ENABLED=True"
        Log "DASHBOARD_PRESERVED_AT=/market"
        Log "TRADING_ROUTES_STILL_PROTECTED=True"
        Log "BACKEND_CHANGED=False"
        Log "DATABASE_CHANGED=False"
        Log "TRADING_SOURCE_CHANGED=False"
        Log "PROCESSES_KILLED=False"
        Log "RESTART_FRONTEND_REQUIRED=True"
        Log "REPORT=$ReportPath"
        $Success = $true
    }
    catch {
        Log ""
        Log "=== FAILURE ==="
        Log "PATCH_SUCCESS=False"
        Log "ERROR_TYPE=$($_.Exception.GetType().FullName)"
        Log "ERROR_MESSAGE=$($_.Exception.Message)"
        Restore-All
    }

    $Encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($ReportPath,$Report,$Encoding)
    try { [System.IO.File]::ReadAllText($ReportPath) | Set-Clipboard } catch {}
    Start-Process -FilePath "notepad.exe" -ArgumentList @($ReportPath)
    Write-Host ""
    Write-Host "REPORT: $ReportPath" -ForegroundColor Cyan
    if (-not $Success) { throw "Premium public site Phase B failed. Review Notepad." }
    Write-Host "PREMIUM PUBLIC SITE PHASE B V1.1: SUCCESS" -ForegroundColor Green
}