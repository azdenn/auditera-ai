@echo off
cd /d "%~dp0"
echo.
echo   Deploying Auditera AI to Cloudflare...
echo.
call npx wrangler deploy
echo.
if errorlevel 1 (
  echo   ^>^> DEPLOY FAILED - see the error above.
) else (
  echo   ^>^> Done. Live at https://auditera.azden-kumar.workers.dev
)
echo.
echo   Press any key to close.
pause >nul
