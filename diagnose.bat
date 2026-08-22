@echo off
cd /d "%~dp0"
set OUT=diagnose.txt
echo Auditera diagnostics > %OUT%
echo ==================== >> %OUT%
echo. >> %OUT%
echo [current branch] >> %OUT%
git rev-parse --abbrev-ref HEAD >> %OUT% 2>&1
echo. >> %OUT%
echo [remotes] >> %OUT%
git remote -v >> %OUT% 2>&1
echo. >> %OUT%
echo [local branches] >> %OUT%
git branch -vv >> %OUT% 2>&1
echo. >> %OUT%
echo [last 5 commits] >> %OUT%
git log --oneline -5 --all >> %OUT% 2>&1
echo. >> %OUT%
echo [uncommitted changes] >> %OUT%
git status --short >> %OUT% 2>&1
echo. >> %OUT%
echo [what GitHub actually has] >> %OUT%
git ls-remote --heads origin >> %OUT% 2>&1
echo. >> %OUT%
echo [author identity] >> %OUT%
git config user.name >> %OUT% 2>&1
git config user.email >> %OUT% 2>&1
echo [global identity] >> %OUT%
git config --global user.name >> %OUT% 2>&1
git config --global user.email >> %OUT% 2>&1
echo. >> %OUT%
echo [is CHANGELOG committed?] >> %OUT%
git log --oneline -1 -- CHANGELOG.md >> %OUT% 2>&1
echo. >> %OUT%
echo [does the pushed main have the new name?] >> %OUT%
git grep -c "Auditera AI" origin/main -- dist/index.html >> %OUT% 2>&1
echo. >> %OUT%
echo Done. >> %OUT%
type %OUT%
echo.
echo   ^>^> Saved to diagnose.txt - Claude will read it.
echo.
pause
