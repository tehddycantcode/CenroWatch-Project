@echo off
REM Stops CENROWATCH: the web dev server on the host, and the backend + MySQL
REM containers. The database volume is left untouched, so no data is lost.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-cenrowatch.ps1"
