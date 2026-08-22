@echo off
cd /d "%~dp0"
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
echo.
echo   Current branch: %BRANCH%
if /i "%BRANCH%"=="main" (
  echo.
  echo   ^>^> WARNING: you are on MAIN, which is the LIVE site.
  echo      Day-to-day changes belong on testing.
  echo      Ctrl+C to stop, or press a key to continue anyway.
  pause >nul
)
echo.
set /p MSG="  What changed? (short description): "
if "%MSG%"=="" set MSG=Update
git add -A
git commit -m "%MSG%"
git push
echo.
if errorlevel 1 (
  echo   ^>^> Push failed - copy the error above and send it to Claude.
) else (
  echo   ^>^> Pushed to %BRANCH%. Cloudflare will build and deploy it.
)
echo.
pause
