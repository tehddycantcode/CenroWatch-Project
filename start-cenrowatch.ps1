# CENROWATCH dev launcher.
#
#   start-cenrowatch.bat                 one-click; auto-detects the setup
#   .\start-cenrowatch.ps1 -NoPrompt     never waits for a keypress
#   .\start-cenrowatch.ps1 -Mode native  force the host/npm setup
#   .\start-cenrowatch.ps1 -Mode docker  force the container setup
#
# THIS REPO RUNS ON TWO DIFFERENT SETUPS, and the launcher has to match the one
# it is on or it starts the wrong backend against the wrong database:
#
#   native  backend/node_modules EXISTS on the host. The API runs as
#           `npm run dev` on port 5000 and talks to the local MySQL80 service on
#           port 3306. Docker is not involved at all.
#   docker  backend/node_modules does NOT exist on the host - the dependencies
#           live inside the image. The API runs in the cenrowatch_api container
#           and MySQL in cenrowatch_db (host port 3307).
#
# Detection is that same node_modules test, the one documented in CLAUDE.md
# under "Environment Notes". -Mode overrides it if you ever need to.
#
# Either way, the web app is a host-side Vite dev server on port 5173.

[CmdletBinding()]
param(
    [ValidateSet('auto', 'native', 'docker')]
    [string]$Mode = 'auto',

    # Double-clicking the .bat opens a window that would vanish with the result
    # still on it, so by default this waits for Enter before closing. Pass
    # -NoPrompt when something else is driving it and nobody is there to answer.
    [switch]$NoPrompt
)

$root = $PSScriptRoot

# This machine has installed Node user-scoped in the past and a fresh shell does
# not always inherit it; rebuild PATH from User + Machine so node/npm are found.
$pathFix = "`$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')"
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')

# The only interactive moment in the script, and it is skippable. Every exit path
# goes through this, so -NoPrompt is genuinely non-interactive rather than almost.
function Wait-ForClose {
    if (-not $NoPrompt) { Read-Host 'Press Enter to close' | Out-Null }
}

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

function Test-Api {
    try { return (Invoke-WebRequest 'http://localhost:5000/api/health' -TimeoutSec 3 -UseBasicParsing).StatusCode -eq 200 }
    catch { return $false }
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

# -- Which setup is this? ----------------------------------------------------
if ($Mode -eq 'auto') {
    $Mode = if (Test-Path "$root\backend\node_modules") { 'native' } else { 'docker' }
    $how = 'detected'
}
else {
    $how = 'forced with -Mode'
}

$script:steps = if ($Mode -eq 'native') { 3 } else { 4 }
$script:step = 0
function Step {
    param([string]$Title)
    $script:step++
    Write-Host ("[{0}/{1}] {2}" -f $script:step, $script:steps, $Title) -ForegroundColor Cyan
}

Write-Host ''
Write-Host "Starting CENROWATCH - $Mode setup ($how)" -ForegroundColor Green
Write-Host ''

if ($Mode -eq 'docker') {
    # -- 1. Docker -----------------------------------------------------------
    Step 'Docker Desktop'
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
                Wait-ForClose
                exit 1
            }
        }
        else {
            Write-Host '      Docker Desktop not found. Install it, or start it manually.' -ForegroundColor Red
            Wait-ForClose
            exit 1
        }
    }
    Write-Host '      ready' -ForegroundColor Green

    # -- 2. Backend + database -----------------------------------------------
    Step 'Backend + MySQL  (docker compose up -d)'
    Push-Location $root
    docker compose up -d
    $composeCode = $LASTEXITCODE
    Pop-Location
    if ($composeCode -ne 0) {
        Write-Host '      compose failed - see the error above.' -ForegroundColor Red
        Wait-ForClose
        exit 1
    }
}
else {
    # -- 1. Backend on the host ----------------------------------------------
    Step 'Backend  (npm run dev on the host, port 5000)'
    if (Test-Port -Port 5000) {
        Write-Host '      already running on 5000 - reusing it' -ForegroundColor DarkGray
    }
    else {
        if (-not (Test-Path "$root\backend\node_modules")) {
            Write-Host '      backend/node_modules missing - run:  cd backend ; npm install' -ForegroundColor Red
            Write-Host '      (or start the container setup instead: -Mode docker)' -ForegroundColor DarkGray
            Wait-ForClose
            exit 1
        }
        # Without MySQL the API still boots and then fails every query, with the
        # real cause buried in the other window. Say it here instead.
        if (-not (Test-Port -Port 3306)) {
            Write-Host '      MySQL is not listening on 3306 - the API would start but every' -ForegroundColor Red
            Write-Host '      query would fail. Start the service first:  net start MySQL80' -ForegroundColor Red
            Write-Host '      (that needs an administrator shell)' -ForegroundColor DarkGray
            Wait-ForClose
            exit 1
        }
        Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', `
            "$pathFix; Set-Location '$root\backend'; Write-Host 'API -> http://localhost:5000' -ForegroundColor Cyan; npm run dev"
        Write-Host '      starting in its own window' -NoNewline -ForegroundColor DarkGray
    }
}

Write-Host '      waiting for the API' -NoNewline -ForegroundColor DarkGray
$apiUp = Wait-For -TimeoutSeconds 120 -What 'http://localhost:5000/api/health' -Condition { Test-Api }
Write-Host ''
if (-not $apiUp) {
    if ($Mode -eq 'docker') {
        Write-Host '      API never became healthy. Check: docker compose logs api' -ForegroundColor Red
    }
    else {
        Write-Host '      API never became healthy. Check the API window for the error.' -ForegroundColor Red
    }
    Wait-ForClose
    exit 1
}
Write-Host '      API ready -> http://localhost:5000' -ForegroundColor Green

# -- Web app -----------------------------------------------------------------
Step 'Web app'
if (-not (Test-Path "$root\web\node_modules")) {
    Write-Host '      web/node_modules missing - run:  cd web ; npm install' -ForegroundColor Red
    Wait-ForClose
    exit 1
}
if (Test-Port -Port 5173) {
    # Closing a `npm run dev` window can leave the Vite child alive holding 5173.
    # Reuse it rather than starting a second dev server on a different port.
    Write-Host '      already running on 5173 - reusing it' -ForegroundColor DarkGray
}
else {
    # --strictPort so Vite fails loudly instead of quietly moving to 5174 and
    # leaving every browser check pointed at a stale server on 5173.
    Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', `
        "$pathFix; Set-Location '$root\web'; Write-Host 'WEB -> http://localhost:5173' -ForegroundColor Cyan; npm run dev -- --strictPort"
    Write-Host '      starting in its own window' -NoNewline -ForegroundColor DarkGray
    $webUp = Wait-For -TimeoutSeconds 90 -What 'the Vite dev server on 5173' -Condition { Test-Port -Port 5173 }
    Write-Host ''
    if (-not $webUp) {
        Write-Host '      Vite did not come up - check the web window for errors.' -ForegroundColor Red
    }
}
if (Test-Port -Port 5173) { Write-Host '      web ready -> http://localhost:5173' -ForegroundColor Green }

# -- Prove it actually works -------------------------------------------------
Step 'Verifying the running system'
Write-Host ''
if ($Mode -eq 'docker') {
    node "$root\scripts\preflight.mjs"
    $verified = ($LASTEXITCODE -eq 0)
}
else {
    # preflight.mjs drives every deep check through `docker exec cenrowatch_api`,
    # so on the native setup it reports the whole system as broken instead of
    # telling you anything true. Until it learns this setup, smoke-test what can
    # be reached from here and be explicit about what went unchecked.
    $verified = $true
    if (Test-Api) {
        Write-Host '  PASS  API health        200 /api/health' -ForegroundColor Green
    }
    else {
        Write-Host '  FAIL  API health        no 200 from /api/health' -ForegroundColor Red
        $verified = $false
    }
    if (Test-Port -Port 5173) {
        Write-Host '  PASS  Web dev server    listening on 5173' -ForegroundColor Green
    }
    else {
        Write-Host '  FAIL  Web dev server    nothing listening on 5173' -ForegroundColor Red
        $verified = $false
    }
    if (Test-Port -Port 3306) {
        Write-Host '  PASS  MySQL             listening on 3306' -ForegroundColor Green
    }
    else {
        Write-Host '  FAIL  MySQL             nothing listening on 3306' -ForegroundColor Red
        $verified = $false
    }
    Write-Host ''
    Write-Host '  NOT checked here: migrations, schema drift, SMTP auth, uploads and the' -ForegroundColor Yellow
    Write-Host '  mobile API target. scripts/preflight.mjs covers those but is Docker-only,' -ForegroundColor Yellow
    Write-Host '  so run it on the container setup before a demo or the defense.' -ForegroundColor Yellow
}

Write-Host ''
if ($verified) {
    Write-Host '  ==================================================' -ForegroundColor Green
    Write-Host '    CENROWATCH is up.' -ForegroundColor Green
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
Wait-ForClose
if ($verified) { exit 0 } else { exit 1 }
