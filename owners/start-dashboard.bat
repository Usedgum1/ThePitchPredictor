@echo off
setlocal

cd /d "%~dp0"

set PORT=8090
set URL=http://localhost:%PORT%/

echo.
echo Starting PitchIQ Owners Portal...
echo.
echo   %URL%
echo.
echo   Press Ctrl+C to stop the server.
echo.

start "" "%URL%"
python -m http.server %PORT% --bind 127.0.0.1

endlocal
