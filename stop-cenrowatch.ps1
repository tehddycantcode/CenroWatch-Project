# Stops CENROWATCH: the web dev server on the host, and the backend + MySQL
# containers. You normally run this by double-clicking stop-cenrowatch.bat.
#
# Uses `docker compose stop` rather than `down`: the containers are kept so the
# next start is fast, and the database volume (backend_db_data) is never at risk.

$root = $PSScriptRoot

Write-Host ''
Write-Host 'Stopping CENROWATCH...' -ForegroundColor Yellow
Write-Host ''

# -- Web dev server (host) ---------------------------------------------------
# Closing the npm window kills the npm wrapper but can orphan the Vite child,
# which keeps holding port 5173 - so match vite explicitly and verify after.
$procs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match 'node' -and $_.CommandLine -match 'vite|nodemon'
}
if ($procs) {
    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-Host ("  web: stopped {0} process(es)" -f @($procs).Count) -ForegroundColor Green
}
else {
    Write-Host '  web: nothing was running' -ForegroundColor DarkGray
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
    Write-Host '  backend + database: Docker is not running, nothing to stop' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  Data is safe - the database volume is untouched.' -ForegroundColor DarkGray
Write-Host '  Start again with: start-cenrowatch.bat' -ForegroundColor DarkGray
Write-Host ''
Start-Sleep -Seconds 3
