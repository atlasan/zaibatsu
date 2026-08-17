@echo off
setlocal
cd /d "%~dp0"
where bun >nul 2>nul || (echo Bun is required. Install Bun, then run this command again. & exit /b 1)
echo Validating documentation, rebuilding knowledge, and checking source/spec links...
bun tools\validate-docs.ts || exit /b 1
bun tools\build-knowledge.ts || exit /b 1
bun tools\validate-spec.ts || exit /b 1
bun tools\verify-artifacts.ts
