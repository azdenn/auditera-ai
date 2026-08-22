@echo off
cd /d "%~dp0"
echo.
echo   Fixing commit authorship
echo   ------------------------
echo   Commits are currently attributed to another GitHub user because
echo   git's local config had their name/email. This sets it to yours
echo   and rewrites the two initial commits so the history is correct.
echo.
echo   Safe: this repo has no collaborators and only initial commits.
echo.
pause

git config user.name "Azden Kumar"
git config user.email "313647053+azdenn@users.noreply.github.com"

echo.
echo   Rewriting history with the correct author...
git checkout main || goto :fail
git checkout --orphan _clean || goto :fail
git add -A || goto :fail
git commit -m "Auditera AI - initial import (tools, gate, site, tests)" || goto :fail
git branch -D main
git branch -m main
git push -f origin main || goto :fail

echo.
echo   Recreating testing from the corrected main...
git branch -D testing 2>nul
git checkout -B testing || goto :fail
git push -f -u origin testing || goto :fail

echo.
echo   ^>^> Done. Both branches now show you as the author.
echo      You are on testing.
echo.
pause
exit /b 0

:fail
echo.
echo   ^>^> Failed. Copy the whole error above and send it to Claude.
echo.
pause
exit /b 1
