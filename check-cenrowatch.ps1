# CENROWATCH pre-demo check.
# Normally you run this by double-clicking check-cenrowatch.bat (which calls this
# with the right execution policy) - you do not need to run it by hand.
#
# It answers one question: is the system ACTUALLY working right now, or does it
# only look finished in the repo? See scripts/preflight.mjs for what is checked.

$root = $PSScriptRoot

# This machine has installed Node user-scoped in the past and a fresh shell does
# not always inherit it; rebuild PATH from User + Machine so node is always found.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ''
    Write-Host '  Node.js was not found on PATH, so the check cannot run.' -ForegroundColor Red
    Write-Host '  Open the project in VS Code and run:  node scripts\preflight.mjs' -ForegroundColor DarkGray
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}

node "$root\scripts\preflight.mjs"
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 0) {
    Write-Host '  ============================================' -ForegroundColor Green
    Write-Host '    READY - everything checks out. Safe to demo.' -ForegroundColor Green
    Write-Host '  ============================================' -ForegroundColor Green
    Write-Host ''
    Write-Host '  For the web app, also start it with:  cd web; npm run dev' -ForegroundColor DarkGray
    Write-Host '  then confirm http://localhost:5173 loads.' -ForegroundColor DarkGray
}
else {
    Write-Host '  ============================================' -ForegroundColor Red
    Write-Host '    NOT READY - fix the FAIL items listed above.' -ForegroundColor Red
    Write-Host '  ============================================' -ForegroundColor Red
    Write-Host ''
    Write-Host '  Most common fixes:' -ForegroundColor DarkGray
    Write-Host '   - Docker not reachable      -> start Docker Desktop, wait a minute, run again' -ForegroundColor DarkGray
    Write-Host '   - Container not running     -> docker compose up -d' -ForegroundColor DarkGray
    Write-Host '   - Mobile API target changed -> update mobile\src\config.js AND rebuild the APK' -ForegroundColor DarkGray
    Write-Host '   - Schema drift              -> do not demo; the missing SQL is printed above' -ForegroundColor DarkGray
}
Write-Host ''
Read-Host 'Press Enter to close'
exit $code
