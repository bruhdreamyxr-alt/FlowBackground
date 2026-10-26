@echo off
title Flow custom background - UNINSTALL
echo.
echo   Flow custom background - remove it again
echo   ---------------------------------------
echo.
echo   A Windows permission prompt is expected - click Yes.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-FlowGifBg.ps1" -Pause