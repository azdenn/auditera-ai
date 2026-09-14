@echo off
cd /d "%~dp0"
node ..\build.cjs --check
if errorlevel 1 (
  echo   Build verification failed. Run node build.cjs from the repository root first.
  pause >nul
  exit /b 1
)
echo.
echo   Deploying Auditera AI to Cloudflare...
echo.
call npx wrangler deploy
echo.
if errorlevel 1 (
  echo   ^>^> DEPLOY FAILED - see the error above.
) else (
  echo   ^>^> Done. Live at https://auditera.net
)
echo.
echo   Press any key to close.
pause >nul
