@echo off
title Flow custom background - INSTALL
echo.
echo   Flow custom background - install
echo   --------------------------------
echo.
echo   A Windows "Do you want to allow this app to make changes?" prompt is
echo   expected - click Yes. That is only needed this once.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-FlowGifBg.ps1" -Pause