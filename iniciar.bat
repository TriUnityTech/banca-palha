@echo off
title Banca de Palha
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado neste computador.
  echo Instale em https://nodejs.org e abra este arquivo de novo.
  pause
  exit /b 1
)
start "" "http://localhost:4180"
node servidor.js
pause
