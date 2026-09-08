@echo off
REM CENROWATCH pre-demo check. Double-click this file in File Explorer before any
REM demo or the defense: it verifies the system is ACTUALLY running correctly,
REM not just that the code looks finished. The window stays open with the result.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-cenrowatch.ps1"
