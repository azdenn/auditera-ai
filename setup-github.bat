@echo off
cd /d "%~dp0"
echo.
echo   One-time GitHub setup for Auditly AI
echo   ------------------------------------
echo   Before running this, create an EMPTY private repo at:
echo     https://github.com/new
echo   Name it: auditly-ai    Private: yes    Do NOT add a README.
echo.
pause

git init
git branch -M main
git add -A
git commit -m "Auditly AI - initial import (tools, gate, site, tests)"
git remote remove origin 2>nul
git remote add origin https://github.com/azdenn/auditly-ai.git
git push -u origin main
git checkout -b testing
git push -u origin testing
git checkout main

echo.
if errorlevel 1 (
  echo   ^>^> Something failed above. Copy the error and send it to Claude.
) else (
  echo   ^>^> Done. main and testing are both on GitHub.
)
echo.
pause
