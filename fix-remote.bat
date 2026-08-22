@echo off
cd /d "%~dp0"
echo.
echo   Repointing this repo at github.com/azdenn/auditera-ai
echo   and pushing both branches.
echo.

git remote remove origin 2>nul
git remote add origin https://github.com/azdenn/auditera-ai.git

git rev-parse --verify main >nul 2>&1
if errorlevel 1 (
  git branch -M main
)
git checkout main 2>nul

git add -A
git -c core.autocrlf=false commit -m "Auditly AI - initial import" 2>nul

echo.
echo   Pushing main...
git push -u origin main || goto :fail

echo.
echo   Creating and pushing testing...
git checkout -B testing || goto :fail
git push -u origin testing || goto :fail

echo.
echo   ^>^> Done. Both branches are on GitHub and you are on testing.
echo      Now go back to Cloudflare and connect the repo - the
echo      Production branch dropdown should offer "main".
echo.
pause
exit /b 0

:fail
echo.
echo   ^>^> Push failed. Copy the WHOLE error above and send it to Claude.
echo      Most likely: the repo name is different, or git needs you to
echo      sign in to GitHub in the browser window it opened.
echo.
pause
exit /b 1
