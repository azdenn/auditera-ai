@echo off
cd /d "%~dp0"
set LOG=promote-log.txt
echo Promote log > %LOG%
echo =========== >> %LOG%

echo.
echo   Promoting TESTING to MAIN (updates the LIVE site)
echo   -------------------------------------------------
echo   Only do this once the change works on the testing URL.
echo.
pause

rem One-time: stop tracking control/log files. A modified tracked file blocks
rem `git checkout` and silently aborts the whole promote.
git rm --cached -q --ignore-unmatch .commitmsg push-log.txt promote-log.txt diagnose.txt >> %LOG% 2>&1

echo [start] >> %LOG%
git rev-parse --abbrev-ref HEAD >> %LOG% 2>&1

echo   Committing anything outstanding on testing...
git checkout testing >> %LOG% 2>&1
git add -A >> %LOG% 2>&1
git commit -m "Pre-promote: commit outstanding changes" >> %LOG% 2>&1
git push -u origin testing >> %LOG% 2>&1

echo   Switching to main...
git checkout main >> %LOG% 2>&1
git rev-parse --abbrev-ref HEAD > current_branch.tmp 2>&1
set /p NOWON=<current_branch.tmp
del /q current_branch.tmp
if /i not "%NOWON%"=="main" (
  echo   ^>^> COULD NOT SWITCH TO MAIN. Stopped before changing anything. >> %LOG%
  echo.
  echo   ^>^> COULD NOT SWITCH TO MAIN - live site untouched.
  echo      Send promote-log.txt to Claude.
  type %LOG%
  pause
  exit /b 1
)

echo   Merging and pushing...
git fetch origin main >> %LOG% 2>&1
git merge --ff-only origin/main >> %LOG% 2>&1
git merge testing -m "Promote testing to main" >> %LOG% 2>&1
git push -u origin main >> %LOG% 2>&1

echo [end] >> %LOG%
git log --oneline -3 >> %LOG% 2>&1
git ls-remote --heads origin >> %LOG% 2>&1
git checkout testing >> %LOG% 2>&1

type %LOG%
echo.
findstr /C:"rejected" /C:"error:" /C:"fatal:" %LOG% >nul
if not errorlevel 1 (
  echo   ^>^> PROBLEM - send promote-log.txt to Claude.
) else (
  echo   ^>^> main updated. Cloudflare is deploying the live site.
)
echo.
pause
