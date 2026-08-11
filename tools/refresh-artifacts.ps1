[CmdletBinding()]
param(
    [string]$Python = "python",
    [string]$Pdftoppm
)

$ErrorActionPreference = "Stop"

if (-not $Pdftoppm) {
    $command = Get-Command pdftoppm -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "pdftoppm was not found on PATH. Re-run with -Pdftoppm <absolute-path-to-pdftoppm.exe>."
    }
    $Pdftoppm = $command.Source
}

& $Python -m tools.artifacts refresh-core --pdftoppm $Pdftoppm
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}