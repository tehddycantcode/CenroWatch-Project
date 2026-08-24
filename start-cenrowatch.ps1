# CENROWATCH dev launcher.
#
# Brings up the whole system in the correct order and then PROVES it works:
#   1. Docker Desktop (started for you if it is not already running)
#   2. backend + MySQL via `docker compose up -d`  -> API on port 5000
#   3. the web app via `npm run dev` in its own window -> port 5173
#   4. scripts/preflight.mjs, so you find out now - not mid-demo - if
#      migrations, email, uploads or the mobile API target are broken
#
# You normally run this by double-clicking start-cenrowatch.bat (which calls this
# with the right execution policy) - you do not need to run it by hand.
#
# NOTE: the backend is NOT started with `npm run dev` any more. It runs inside the
# `cenrowatch_api` container and backend/node_modules does not exist on the host,
# so a host-side `npm run dev` fails instantly and fights Docker for port 5000.

$root = $PSScriptRoot

# This machine has installed Node user-scoped in the past and a fresh shell does
# not always inherit it; rebuild PATH from User + Machine so node/npm are found.
$pathFix = "`$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')"
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')

# Is anything LISTENING on this port?
# Vite binds IPv6 loopback (::1) ONLY, so probing IPv4 127.0.0.1 reports the dev
# server as down while it is actually running - which made this launcher wait the
# full timeout and then wrongly claim Vite had failed. Get-NetTCPConnection is
# address-family agnostic and needs no admin rights; the TCP connect below is a
# fallback for hosts where that cmdlet is unavailable, and tries BOTH families.
function Test-Port {
    param([int]$Port)
    try {
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop) { return $true }
    }
    catch { }
    foreach ($target in @('::1', '127.0.0.1')) {
        try {
            $client = [Net.Sockets.TcpClient]::new($target, $Port)
            $client.Close()
            return $true
        }
        catch { }
    }
    return $false
}

function Wait-For {
    param([scriptblock]$Condition, [int]$TimeoutSeconds, [string]$What)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) { return $true }
        Start-Sleep -Seconds 2
        Write-Host '.' -NoNewline -ForegroundColor DarkGray
    }
    Write-Host ''
    Write-Host "  Timed out after $TimeoutSeconds s waiting for $What." -ForegroundColor Red
    return $false
}

Write-Host ''
Write-Host 'Starting CENROWATCH...' -ForegroundColor Green
Write-Host ''

# -- 1. Docker ---------------------------------------------------------------
Write-Host '[1/4] Docker Desktop' -ForegroundColor Cyan
docker info *>$null
if ($LASTEXITCODE -ne 0) {
    $dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dockerExe) {
        Write-Host '      not running - launching it, this takes a minute' -NoNewline -ForegroundColor DarkGray
        Start-Process $dockerExe | Out-Null
        $up = Wait-For -TimeoutSeconds 180 -What 'the Docker engine' -Condition {
            docker info *>$null
            $LASTEXITCODE -eq 0
        }
        Write-Host ''
        if (-not $up) {
            Write-Host '      Start Docker Desktop manually, then run this again.' -ForegroundColor Red
            Read-Host 'Press Enter to close'
            exit 1
        }
    }
    else {
        Write-Host '      Docker Desktop not found. Install it, or start it manually.' -ForegroundColor Red
        Read-Host 'Press Enter to close'
        exit 1
    }
}
Write-Host '      ready' -ForegroundColor Green

# -- 2. Backend + database ---------------------------------------------------
Write-Host '[2/4] Backend + MySQL  (docker compose up -d)' -ForegroundColor Cyan
Push-Location $root
docker compose up -d
$composeCode = $LASTEXITCODE
Pop-Location
if ($composeCode -ne 0) {
    Write-Host '      compose failed - see the error above.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
Write-Host '      waiting for the API' -NoNewline -ForegroundColor DarkGray
$apiUp = Wait-For -TimeoutSeconds 120 -What 'http://localhost:5000/api/health' -Condition {
    try { (Invoke-WebRequest 'http://localhost:5000/api/health' -TimeoutSec 3 -UseBasicParsing).StatusCode -eq 200 }
    catch { $false }
}
Write-Host ''
if (-not $apiUp) {
    Write-Host '      API never became healthy. Check: docker compose logs api' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
Write-Host '      API ready -> http://localhost:5000' -ForegroundColor Green

# -- 3. Web app --------------------------------------------------------------
Write-Host '[3/4] Web app' -ForegroundColor Cyan
if (-not (Test-Path "$root\web\node_modules")) {
    Write-Host '      web/node_modules missing - run:  cd web ; npm install' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
if (Test-Port -Port 5173) {
    # Closing a `npm run dev` window can leave the Vite child alive holding 5173.
    # Reuse it rather than starting a second dev server on a different port.
    Write-Host '      already running on 5173 - reusing it' -ForegroundColor DarkGray
}
else {
    Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', `
        "$pathFix; Set-Location '$root\web'; Write-Host 'WEB -> http://localhost:5173' -ForegroundColor Cyan; npm run dev"
    Write-Host '      starting in its own window' -NoNewline -ForegroundColor DarkGray
    $webUp = Wait-For -TimeoutSeconds 90 -What 'the Vite dev server on 5173' -Condition { Test-Port -Port 5173 }
    Write-Host ''
    if (-not $webUp) {
        Write-Host '      Vite did not come up - check the web window for errors.' -ForegroundColor Red
    }
}
if (Test-Port -Port 5173) { Write-Host '      web ready -> http://localhost:5173' -ForegroundColor Green }

# -- 4. Prove it actually works ----------------------------------------------
Write-Host '[4/4] Verifying the running system' -ForegroundColor Cyan
Write-Host ''
node "$root\scripts\preflight.mjs"
$preflight = $LASTEXITCODE

Write-Host ''
if ($preflight -eq 0) {
    Write-Host '  ==================================================' -ForegroundColor Green
    Write-Host '    CENROWATCH is up and verified. Safe to demo.' -ForegroundColor Green
    Write-Host '  ==================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host '    Web    http://localhost:5173' -ForegroundColor Green
    Write-Host '    API    http://localhost:5000' -ForegroundColor Green
}
else {
    Write-Host '  ==================================================' -ForegroundColor Red
    Write-Host '    Started, but the checks above found problems.' -ForegroundColor Red
    Write-Host '    Do not demo until they are fixed.' -ForegroundColor Red
    Write-Host '  ==================================================' -ForegroundColor Red
}
Write-Host ''
Write-Host '  To stop everything: stop-cenrowatch.bat' -ForegroundColor DarkGray
Write-Host ''
Read-Host 'Press Enter to close'
exit $preflight
