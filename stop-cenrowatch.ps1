# Stops CENROWATCH: the host dev servers - Vite always, plus the API when it is
# running natively under nodemon - and the backend + MySQL containers when the
# setup is the Docker one. You normally run this by double-clicking
# stop-cenrowatch.bat.
#
# Uses `docker compose stop` rather than `down`: the containers are kept so the
# next start is fast, and the database volume (backend_db_data) is never at risk.

$root = $PSScriptRoot

Write-Host ''
Write-Host 'Stopping CENROWATCH...' -ForegroundColor Yellow
Write-Host ''

# -- Host dev servers --------------------------------------------------------
# Closing the npm window kills the npm wrapper but can orphan the Vite child,
# which keeps holding port 5173 - so match vite explicitly and verify after.
# nodemon is matched too: on the native setup that is the API on port 5000.
$procs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match 'node' -and $_.CommandLine -match 'vite|nodemon'
}
if ($procs) {
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host ("  dev servers: stopped {0} process(es)" -f @($procs).Count) -ForegroundColor Green
}
else {
    Write-Host '  dev servers: nothing was running' -ForegroundColor DarkGray
}

# Confirm 5173 actually released; an orphan here is a known failure mode.
# NB: Vite listens on IPv6 loopback (::1) only, so an IPv4-only probe would
# report the port as free while an orphaned dev server still holds it - exactly
# the case this check exists to catch. Get-NetTCPConnection covers both families.
Start-Sleep -Seconds 1
$stillUp = $false
try {
    if (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop) { $stillUp = $true }
}
catch { $stillUp = $false }
if ($stillUp) {
    Write-Host '  web: WARNING - something is still listening on 5173' -ForegroundColor Red
    Write-Host '       find it with:  Get-NetTCPConnection -LocalPort 5173' -ForegroundColor DarkGray
}

# -- Backend + database (Docker) ---------------------------------------------
docker info *>$null
if ($LASTEXITCODE -eq 0) {
    Push-Location $root
    docker compose stop
    Pop-Location
    Write-Host '  backend + database: stopped' -ForegroundColor Green
}
else {
    # Also the normal case on the native setup, where there are no containers at
    # all and the API was already stopped with the dev servers above.
    Write-Host '  containers: Docker is not running, nothing to stop' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  Data is safe - neither the database volume nor the MySQL80 service' -ForegroundColor DarkGray
Write-Host '  is touched by this script.' -ForegroundColor DarkGray
Write-Host '  Start again with: start-cenrowatch.bat' -ForegroundColor DarkGray
Write-Host ''
Start-Sleep -Seconds 3
