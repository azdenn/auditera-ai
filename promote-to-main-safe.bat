@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem Promotes testing -> main WITHOUT ever checking out main locally.
rem This is VERSION CONTROL, not a deploy. See dist\README-DEPLOY.md.
rem This sidesteps both bugs the old promote-to-main.bat hit:
rem   1) a batch-parsing glitch on a redirected git-checkout line
rem   2) OneDrive holding a lock on files during a local checkout of main,
rem      which left half-deleted folders behind
rem Nothing here checks out main on disk at all -- it only pushes testing's
rem commits directly onto main on GitHub, which is a clean fast-forward as
rem long as main has nothing testing doesn't already have (checked below,
rem automatically, before anything is pushed).

if not exist ".git" (
  echo.
  echo   This does not look like the repo folder -- no .git here.
  echo   Move this script into the repo folder (the one with push.bat in it)
  echo   and run it again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Fetching the latest from GitHub...
git fetch origin
if errorlevel 1 (
  echo.
  echo   ^>^> FETCH FAILED. Nothing was changed. Tell Claude what it said above.
  echo.
  pause
  exit /b 1
)

echo.
echo   Checking that promoting won't lose anything...
set SAFE=1
for /f "delims=" %%i in ('git log --oneline origin/testing..origin/main') do set SAFE=0

if "!SAFE!"=="0" (
  echo.
  echo   ^>^> STOP: main has commit^(s^) that testing does not have.
  echo   Promoting right now would lose them. Nothing was changed --
  echo   tell Claude before running this again.
  echo.
  pause
  exit /b 1
)

echo   Safe -- testing has everything main has, and nothing would be lost.
echo.
echo   Promoting: pushing testing straight onto main on GitHub...
git push origin testing:main
if errorlevel 1 (
  echo.
  echo   ^>^> PUSH FAILED. Nothing was changed. Tell Claude what it said above.
  echo.
  pause
  exit /b 1
)

echo.
echo   Done -- main now matches testing exactly.
echo.
echo   NOTE: this changed the RECORD, not the site. Git does not deploy.
echo   The live site changes when you run dist\redeploy.bat, and the testing
echo   site when you run dist\redeploy-testing.bat.
echo.
echo   Switching your local folder back to the testing branch...
git checkout testing

echo.
echo   All done. main now records what shipped, so a bad change can be undone.
echo.
pause
