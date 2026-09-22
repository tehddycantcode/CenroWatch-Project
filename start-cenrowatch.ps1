# CENROWATCH dev launcher.
#
#   start-cenrowatch.bat                 one-click; auto-detects the setup
#   .\start-cenrowatch.ps1 -NoPrompt     never waits for a keypress
#   .\start-cenrowatch.ps1 -NoMobile     web only; skip Expo
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
# Either way, the web app is a host-side Vite dev server on port 5173, and the
# mobile app is Expo/Metro on port 8081 in its own window, with the QR code for
# Expo Go. Mobile is included by default; -NoMobile skips it for a web-only day.

[CmdletBinding()]
param(
    [ValidateSet('auto', 'native', 'docker')]
    [string]$Mode = 'auto',

    # Double-clicking the .bat opens a window that would vanish with the result
    # still on it, so by default this waits for Enter before closing. Pass
    # -NoPrompt when something else is driving it and nobody is there to answer.
    [switch]$NoPrompt,

    # Expo is another window and another minute of startup. Skip it when the
    # day's work is web-only; the API and web app do not depend on it.
    [switch]$NoMobile
)

$root = $PSScriptRoot

# Run at the top of every window this script opens.
#
# PATH: this machine has installed Node user-scoped in the past and a fresh shell
# does not always inherit it, so rebuild it from User + Machine.
#
# NO_COLOR / FORCE_COLOR: a dev server window should look the same whoever opened
# it. Launched from an automated shell, the child inherits that shell's NO_COLOR
# while npm sets FORCE_COLOR for scripts, and Expo then prints a warning pair on
# every reload about one overriding the other. Dropping both leaves each tool to
# its own default.
$childPrelude = "`$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine'); Remove-Item Env:NO_COLOR, Env:FORCE_COLOR -ErrorAction SilentlyContinue"
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

# Metro answers /status with the literal text packager-status:running. Windows
# PowerShell hands that back as a byte[] because the response carries no charset,
# so decode before matching or the test silently never passes.
function Test-Metro {
    try {
        $body = (Invoke-WebRequest 'http://localhost:8081/status' -TimeoutSec 3 -UseBasicParsing).Content
        if ($body -is [byte[]]) { $body = [Text.Encoding]::ASCII.GetString($body) }
        return ([string]$body) -match 'packager-status:running'
    }
    catch { return $false }
}

# The LAN address a phone would have to reach this PC on. Prefer the adapter
# that actually has a default gateway: a machine with VirtualBox or Hyper-V also
# has addresses like 192.168.56.1, and suggesting one of those sends whoever
# reads it off down a dead end.
function Get-LanIp {
    $gw = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        Select-Object -First 1
    if ($gw) { return $gw.IPv4Address.IPAddress }
    return (Get-LocalIps | Select-Object -First 1)
}

function Get-LocalIps {
    return @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { -not $_.IPAddress.StartsWith('127.') } |
        ForEach-Object { $_.IPAddress })
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
if (-not $NoMobile) { $script:steps++ }
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
            "$childPrelude; Set-Location '$root\backend'; Write-Host 'API -> http://localhost:5000' -ForegroundColor Cyan; npm run dev"
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
        "$childPrelude; Set-Location '$root\web'; Write-Host 'WEB -> http://localhost:5173' -ForegroundColor Cyan; npm run dev -- --strictPort"
    Write-Host '      starting in its own window' -NoNewline -ForegroundColor DarkGray
    $webUp = Wait-For -TimeoutSeconds 90 -What 'the Vite dev server on 5173' -Condition { Test-Port -Port 5173 }
    Write-Host ''
    if (-not $webUp) {
        Write-Host '      Vite did not come up - check the web window for errors.' -ForegroundColor Red
    }
}
if (Test-Port -Port 5173) { Write-Host '      web ready -> http://localhost:5173' -ForegroundColor Green }

# -- Mobile app --------------------------------------------------------------
$mobileReady = $false
$mobileSkipped = $true
if (-not $NoMobile) {
    Step 'Mobile app  (Expo / Metro on 8081)'
    if (-not (Test-Path "$root\mobile\node_modules")) {
        Write-Host '      mobile/node_modules missing - run:  cd mobile ; npm install' -ForegroundColor Yellow
        Write-Host '      skipped; the API and web app above are unaffected.' -ForegroundColor DarkGray
    }
    else {
        $mobileSkipped = $false

        # A phone cannot reach `localhost` - that name points at the phone - so
        # the app is compiled against this PC's LAN address. A new DHCP lease
        # therefore breaks the phone while the API and web app stay perfectly
        # healthy, which is a miserable thing to discover mid-demo. Check the
        # target BEFORE Metro starts, so the warning is not 40 lines up-screen.
        $target = $null
        $source = $null
        $envFile = "$root\mobile\.env"
        if (Test-Path $envFile) {
            $m = [regex]::Match((Get-Content $envFile -Raw), '(?m)^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)\s*$')
            if ($m.Success) {
                $target = $m.Groups[1].Value.Trim('"').Trim("'")
                $source = 'mobile\.env'
            }
        }
        if (-not $target) {
            $m = [regex]::Match((Get-Content "$root\mobile\src\config.js" -Raw), "EXPO_PUBLIC_API_URL\s*\|\|\s*'([^']+)'")
            if ($m.Success) {
                $target = $m.Groups[1].Value
                $source = 'the fallback in mobile\src\config.js'
            }
        }

        $lanIp = Get-LanIp
        $localIps = Get-LocalIps
        $targetHost = $null
        if ($target) { try { $targetHost = ([uri]$target).Host } catch { } }

        if (-not $targetHost) {
            Write-Host '      WARNING: could not read an API host out of the mobile config.' -ForegroundColor Yellow
        }
        elseif (@('localhost', '127.0.0.1') -contains $targetHost) {
            Write-Host "      WARNING: the app points at $targetHost ($source)." -ForegroundColor Yellow
            Write-Host '      On a phone that name means the phone itself, so nothing will load.' -ForegroundColor Yellow
            Write-Host "        fix:  mobile\.env  ->  EXPO_PUBLIC_API_URL=http://${lanIp}:5000/api/v1" -ForegroundColor DarkGray
        }
        elseif ($localIps -contains $targetHost) {
            Write-Host "      API target $targetHost is still this machine" -ForegroundColor Green
        }
        else {
            Write-Host "      WARNING: the app points at $targetHost ($source)," -ForegroundColor Yellow
            Write-Host ("      but this PC is {0} - the phone will not connect." -f ($localIps -join ', ')) -ForegroundColor Yellow
            Write-Host "        Expo Go:  mobile\.env  ->  EXPO_PUBLIC_API_URL=http://${lanIp}:5000/api/v1" -ForegroundColor DarkGray
            Write-Host '        an INSTALLED APK needs a REBUILD - that URL is baked in at build time.' -ForegroundColor DarkGray
        }

        # Expo Go must be the build for THIS project's SDK. The Play Store only
        # ever offers the newest one, and it auto-updates, so a phone that worked
        # last month can stop opening the project with "Project is incompatible
        # with this version of Expo Go" while nothing in the repo has changed.
        # Print the matching download every time, because the day it is needed is
        # the day nobody wants to go looking for it.
        $sdk = $null
        try {
            $expoDep = (Get-Content "$root\mobile\package.json" -Raw | ConvertFrom-Json).dependencies.expo
            if ($expoDep -match '(\d+)\.') { $sdk = $Matches[1] }
        }
        catch { }
        if ($sdk) {
            Write-Host "      phone needs the Expo Go build for SDK $sdk (the store ships the newest):" -ForegroundColor DarkGray
            Write-Host "        https://expo.dev/go?sdkVersion=$sdk&platform=android&device=true" -ForegroundColor DarkGray
        }

        # Checking the port first is also what keeps this non-interactive: Expo
        # asks "use port 8082 instead?" when 8081 is taken, and nobody may be
        # there to answer it.
        if (Test-Port -Port 8081) {
            Write-Host '      already running on 8081 - reusing it' -ForegroundColor DarkGray
        }
        else {
            Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', `
                "$childPrelude; Set-Location '$root\mobile'; Write-Host 'MOBILE -> scan the QR below with Expo Go' -ForegroundColor Cyan; npm start"
            Write-Host '      starting Expo in its own window' -NoNewline -ForegroundColor DarkGray
            $metroUp = Wait-For -TimeoutSeconds 150 -What 'the Metro bundler on 8081' -Condition { Test-Metro }
            Write-Host ''
            if (-not $metroUp) {
                Write-Host '      Expo did not come up - check the mobile window for errors.' -ForegroundColor Red
            }
        }
        if (Test-Metro) {
            $mobileReady = $true
            Write-Host '      Metro ready -> the QR code is in the Expo window' -ForegroundColor Green
        }
    }
}

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
}

# Metro is checked the same way in both modes: preflight.mjs knows nothing about
# it, and in native mode it is the one part of the system this script started
# that the checks above do not cover.
if (-not $NoMobile -and -not $mobileSkipped) {
    if ($mobileReady) {
        Write-Host '  PASS  Metro bundler     packager-status:running on 8081' -ForegroundColor Green
    }
    else {
        Write-Host '  FAIL  Metro bundler     no answer on 8081' -ForegroundColor Red
        $verified = $false
    }
}

if ($Mode -eq 'native') {
    Write-Host ''
    Write-Host '  NOT checked here: migrations, schema drift, SMTP auth and uploads.' -ForegroundColor Yellow
    Write-Host '  scripts/preflight.mjs covers those but is Docker-only, so run it on the' -ForegroundColor Yellow
    Write-Host '  container setup before a demo or the defense.' -ForegroundColor Yellow
}

Write-Host ''
if ($verified) {
    Write-Host '  ==================================================' -ForegroundColor Green
    Write-Host '    CENROWATCH is up.' -ForegroundColor Green
    Write-Host '  ==================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host '    Web    http://localhost:5173' -ForegroundColor Green
    Write-Host '    API    http://localhost:5000' -ForegroundColor Green
    if ($mobileReady) {
        Write-Host ("    Phone  Expo Go, same Wi-Fi as this PC ({0}) - QR is in the Expo window" -f (Get-LanIp)) -ForegroundColor Green
    }
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
