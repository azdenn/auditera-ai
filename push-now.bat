@echo off
cd /d "%~dp0"
set LOG=push-log.txt
echo Push log > %LOG%
echo ======== >> %LOG%

echo   Setting your global git identity (was your friend's)...
git config --global user.name "Azden Kumar"
git config --global user.email "313647053+azdenn@users.noreply.github.com"
echo [global identity now] >> %LOG%
git config --global user.name >> %LOG% 2>&1
git config --global user.email >> %LOG% 2>&1
echo. >> %LOG%

echo   Committing and pushing...
echo [branch] >> %LOG%
git rev-parse --abbrev-ref HEAD >> %LOG% 2>&1
echo. >> %LOG%
echo [add] >> %LOG%
git add -A >> %LOG% 2>&1
echo [commit] >> %LOG%
git commit -m "Add changelog; rename to Auditera AI" >> %LOG% 2>&1
echo. >> %LOG%
echo [push] >> %LOG%
git push >> %LOG% 2>&1
echo. >> %LOG%
echo [state after] >> %LOG%
git log --oneline -3 >> %LOG% 2>&1
echo. >> %LOG%
git ls-remote --heads origin >> %LOG% 2>&1

type %LOG%
echo.
echo   ^>^> Saved to push-log.txt - Claude will read it.
echo.
pause
