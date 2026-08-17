@echo off
setlocal
cd /d "%~dp0"
where bun >nul 2>nul || (echo Bun is required. Install Bun, then run this command again. & exit /b 1)
where go >nul 2>nul || (echo Go is required. Install Go, then run this command again. & exit /b 1)
echo Running the TypeScript/Bun regression suite...
bun test || exit /b 1
echo Running the Go regression suite...
pushd impl\go
go test ./...
set RESULT=%ERRORLEVEL%
popd
exit /b %RESULT%
