param([int]$Port = 8000, [switch]$Background)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { throw 'Run .\Setup.ps1 first.' }
if (-not (Test-Path -LiteralPath 'frontend\dist\index.html')) { throw 'Frontend is not built. Run .\Setup.ps1 first.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be between 1024 and 65535.' }
if ($Background) {
    $runtimePath = Join-Path $PSScriptRoot '.runtime'
    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    $pythonPath = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    $backendPath = Join-Path $PSScriptRoot 'backend'
    $existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($existing) { throw "Port $Port is already in use. Open the existing app or use -Port with a free port." }
    $arguments = @('-m', 'uvicorn', 'app.main:app', '--app-dir', ('"' + $backendPath + '"'), '--host', '127.0.0.1', '--port', $Port)
    $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'server.log') -RedirectStandardError (Join-Path $runtimePath 'server-error.log')
    @{ pid = $serverProcess.Id; started = $serverProcess.StartTime.ToUniversalTime().Ticks; executable = $pythonPath; port = $Port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimePath 'server.json') -Encoding UTF8
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
            if ($health.status -eq 'ok') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 200 }
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) { break }
    }
    if (-not $ready) { throw 'Server failed to become ready. Inspect .runtime/server-error.log, then run Stop.ps1 before retrying.' }
    Write-Host "Started background server: http://127.0.0.1:$Port ; use .\Stop.ps1 to stop." -ForegroundColor Green
    exit
}
Write-Host "Ligou Lab: http://127.0.0.1:$Port (Ctrl+C to stop)" -ForegroundColor Green
& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port $Port
if ($LASTEXITCODE -ne 0) { throw "Server exited. Check whether port $Port is occupied; use -Port 8001 if needed." }
