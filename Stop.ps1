$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot '.runtime\server.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Host 'No background server started by this project.'; exit }
$saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$serverProcess = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
if (-not $serverProcess) { Write-Host 'Server is already stopped.'; exit }
if ($serverProcess.StartTime.ToUniversalTime().Ticks -ne $saved.started -or $serverProcess.Path -ne $saved.executable) { throw 'Process identity has changed. Refusing to stop an unrelated process.' }
# Windows venv launchers can own the actual Python process as a child.
# Kill only this verified process tree, including its worker process.
& taskkill.exe /PID $serverProcess.Id /T /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the verified server process tree.' }
Remove-Item -LiteralPath $statePath
Write-Host 'Ligou Lab background server stopped.'
