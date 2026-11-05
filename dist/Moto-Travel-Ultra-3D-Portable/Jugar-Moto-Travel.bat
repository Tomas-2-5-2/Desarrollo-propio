@echo off
title MotoTravel 3D - Lanzador Portable
set "GAME_HTML=%~dp0Moto-Travel-Offline.html"

REM Intentar abrir en modo App de Escritorio con Chrome o Edge (sin barra de direcciones)
where chrome >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  start "" chrome --app="file:///%GAME_HTML:\=/%" --start-maximized
  exit /b
)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="file:///%GAME_HTML:\=/%" --start-maximized
  exit /b
)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="file:///%GAME_HTML:\=/%" --start-maximized
  exit /b
)

REM Alternativa: abrir con el navegador predeterminado
start "" "%GAME_HTML%"
exit /b