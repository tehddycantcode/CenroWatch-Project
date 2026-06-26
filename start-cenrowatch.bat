@echo off
REM CENROWATCH one-click dev launcher. Double-click this file in File Explorer,
REM or run it from a terminal, to start the backend (5000) and web (5173) servers.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cenrowatch.ps1"
