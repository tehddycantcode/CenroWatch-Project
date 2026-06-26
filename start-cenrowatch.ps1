# CENROWATCH dev launcher.
# Starts the backend (port 5000) and the web app (port 5173), each in its own
# PowerShell window so you can read each server's logs separately.
# You normally run this by double-clicking start-cenrowatch.bat (which calls this
# with the right execution policy) - you do not need to run it by hand.

$root = $PSScriptRoot

# This machine installs Node user-scoped and a fresh shell does not always inherit
# it; each child window rebuilds PATH from the User + Machine env so npm is found.
$pathFix = "`$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')"

Write-Host 'Starting CENROWATCH dev servers...' -ForegroundColor Green

Start-Process powershell -ArgumentList '-NoExit','-NoProfile','-Command',
  "$pathFix; Set-Location '$root\backend'; Write-Host 'BACKEND -> http://localhost:5000' -ForegroundColor Cyan; npm run dev"

Start-Process powershell -ArgumentList '-NoExit','-NoProfile','-Command',
  "$pathFix; Set-Location '$root\web'; Write-Host 'WEB -> http://localhost:5173' -ForegroundColor Cyan; npm run dev"

Write-Host ''
Write-Host 'Two windows opened: backend (5000) and web (5173).' -ForegroundColor Green
Write-Host 'When both say they are ready, open:  http://localhost:5173' -ForegroundColor Green
Write-Host 'To stop: close the two windows, or run stop-cenrowatch.bat' -ForegroundColor DarkGray
Start-Sleep -Seconds 3
