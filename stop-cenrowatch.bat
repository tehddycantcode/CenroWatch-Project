@echo off
REM Stops the CENROWATCH backend (nodemon) and web (vite) dev servers.
REM You can also just close the two server windows instead of running this.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node' -and $_.CommandLine -match 'nodemon|vite|src\\server\.js' }; if ($p) { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Write-Host ('Stopped ' + $p.Count + ' CENROWATCH server process(es).') -ForegroundColor Green } else { Write-Host 'No CENROWATCH dev servers were running.' -ForegroundColor DarkGray }"
timeout /t 3 >nul
