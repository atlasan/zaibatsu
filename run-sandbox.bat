@echo off
setlocal
cd /d "%~dp0tools\block-editor"
where bun >nul 2>nul || (echo Bun is required. Install Bun, then run this command again. & exit /b 1)
echo Starting the local Speedrunners rules sandbox...
echo Open http://localhost:4173/play/ after the server reports ready.
bun run dev
