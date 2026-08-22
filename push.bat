@echo off
cd /d "%~dp0"
set LOG=push-log.txt

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
echo.
echo   Branch: %BRANCH%
if /i "%BRANCH%"=="main" (
  echo.
  echo   ^>^> WARNING: MAIN is the LIVE site. Day-to-day work belongs on testing.
  echo      Close this window to stop, or press a key to continue anyway.
  pause >nul
)

rem Claude writes .commitmsg describing the change. Fall back to a timestamp.
set MSG=Update %DATE% %TIME%
if exist .commitmsg set /p MSG=<.commitmsg

echo   Message: %MSG%
echo.

echo Push log > %LOG%
echo [branch] %BRANCH% >> %LOG%
echo [message] %MSG% >> %LOG%
echo. >> %LOG%
git add -A >> %LOG% 2>&1
git commit -m "%MSG%" >> %LOG% 2>&1
git push >> %LOG% 2>&1
echo [state] >> %LOG%
git log --oneline -3 >> %LOG% 2>&1
git ls-remote --heads origin >> %LOG% 2>&1

findstr /C:"rejected" /C:"error:" /C:"fatal:" %LOG% >nul
if not errorlevel 1 (
  echo   ^>^> PUSH FAILED. Tell Claude - the details are in push-log.txt
) else (
  echo   ^>^> Pushed to %BRANCH%. Cloudflare will build it.
)
echo.
pause
