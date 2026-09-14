@echo off
cd /d "%~dp0"
node ..\build.cjs --check
if errorlevel 1 (
  echo   Build verification failed. Run node build.cjs from the repository root first.
  pause >nul
  exit /b 1
)
echo.
echo   Deploying to the TESTING site only.
echo   Live auditera.net is NOT touched by this.
echo.
call npx wrangler deploy --config wrangler.testing.jsonc
echo.
if errorlevel 1 (
  echo   ^>^> TESTING DEPLOY FAILED - see the error above.
) else (
  echo   ^>^> Done. Testing site:
  echo      https://testing.auditera.net
  echo.
  echo   When it looks right, run redeploy.bat to put the SAME files live.
)
echo.
echo   Press any key to close.
pause ^>nul
