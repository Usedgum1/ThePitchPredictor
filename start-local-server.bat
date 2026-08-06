@echo off
setlocal

cd /d "%~dp0"

set PORT=8080
set URL=http://localhost:%PORT%/

echo.
echo Starting PitchIQ local site server...
echo.
echo   Home:     %URL%
echo   App:      %URL%app.html
echo   Login:    %URL%login.html
echo   Owners:   %URL%owners/
echo.
echo   Press Ctrl+C to stop the server.
echo.

start "" "%URL%"
python -m http.server %PORT% --bind 127.0.0.1

endlocal
