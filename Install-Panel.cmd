@echo off
title Flow Background panel - INSTALL (no admin needed)
echo.
echo   Flow Background panel - install
echo   --------------------------------
echo.
echo   This one needs no administrator rights at all: it installs the panel
echo   into your own user CEP folder. After Effects will need a restart, then
echo   open Window > Extensions > Flow Background.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Panel.ps1" -Pause