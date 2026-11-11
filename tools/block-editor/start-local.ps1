param([int]$Port = 4173)
$ErrorActionPreference = 'Stop'
$editorPath = $PSScriptRoot
$workspacePath = Split-Path (Split-Path $editorPath -Parent) -Parent
$logPath = Join-Path $workspacePath 'tmp'
$healthUrl = "http://localhost:$Port/api/play/health"
try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.service -eq 'zaibatsu-play') {
        Write-Output "Zaibatsu is already running: http://localhost:$Port/play/"
        exit 0
    }
} catch { }
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$bunExecutable = (Get-Command bun -ErrorAction Stop).Source
$previousPort = $env:BLOCK_EDITOR_PORT
try {
    $env:BLOCK_EDITOR_PORT = [string]$Port
    $gameProcess = Start-Process -FilePath $bunExecutable -ArgumentList @('run', 'server.ts') -WorkingDirectory $editorPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'play-server.stdout.log') -RedirectStandardError (Join-Path $logPath 'play-server.stderr.log') -PassThru
} finally {
    $env:BLOCK_EDITOR_PORT = $previousPort
}
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($gameProcess.HasExited) { throw "Zaibatsu did not start. See $(Join-Path $logPath 'play-server.stderr.log')." }
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.service -eq 'zaibatsu-play') {
            Write-Output "Zaibatsu is running: http://localhost:$Port/play/"
            exit 0
        }
    } catch { }
    Start-Sleep -Milliseconds 200
}
throw 'Zaibatsu did not become ready. Check the play-server logs in tmp.'
