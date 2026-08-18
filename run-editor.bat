@echo off
setlocal
cd /d "%~dp0tools\block-editor"
where bun >nul 2>nul || (echo Bun is required. Install Bun, then run this command again. & exit /b 1)
call "%~dp0stop-local-server.bat" || exit /b 1
echo Starting the local Zaibatsu data editor...
echo Open http://localhost:4173/ after the server reports ready.
bun run dev
