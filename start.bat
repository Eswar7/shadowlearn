@echo off
title ShadowLearn
echo Starting ShadowLearn...

:: Kill any old server on port 8765
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8765"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start Python server in background
start /B python -m http.server 8765

:: Wait 1 second for server to start
timeout /t 1 /nobreak >nul

:: Open in Chrome (falls back to default browser)
start "" "http://localhost:8765"

echo ShadowLearn is running at http://localhost:8765
echo Close this window to stop the server.
echo.

:: Keep window open (server dies when this closes)
python -m http.server 8765 2>nul
