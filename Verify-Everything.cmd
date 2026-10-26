@echo off
title Flow Background - verify everything
echo.
echo   Running every test suite. This takes a minute (the real-browser one starts
echo   Chrome headless twice) and writes preview.png so you can look at your
echo   current look without opening After Effects.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verify-Everything.ps1" -Pause