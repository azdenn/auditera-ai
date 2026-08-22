@echo off
cd /d "%~dp0"
echo.
echo   Promote TESTING to MAIN (this updates the LIVE site)
echo   ----------------------------------------------------
echo   Only do this once you have tested the change on the
echo   testing URL and it works.
echo.
pause

git checkout testing || goto :fail
git push || goto :fail
git checkout main || goto :fail
git pull || goto :fail
git merge testing -m "Promote testing to main" || goto :fail
git push || goto :fail
git checkout testing || goto :fail

echo.
echo   ^>^> Live site updated. You are back on testing.
echo.
pause
exit /b 0

:fail
echo.
echo   ^>^> Something failed above. Copy the error and send it to Claude.
echo      Nothing was force-pushed, so the live site is unchanged.
echo.
pause
exit /b 1
