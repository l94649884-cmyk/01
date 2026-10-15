param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required. Install Node.js 22.12+ or 24 LTS.' }
& node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Please install Node.js 22.12+ or 24 LTS.' }
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    & $Python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create Python environment. Use -Python with a Python 3.12+ executable path.' }
}
& '.\.venv\Scripts\python.exe' -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)"
if ($LASTEXITCODE -ne 0) { throw 'The locked NumPy/SciPy versions require Python 3.12+. Recreate .venv with a supported Python version.' }
& '.\.venv\Scripts\python.exe' -m pip install -r backend\requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
Push-Location frontend
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }
Write-Host 'Ready. Run .\Start.ps1 and visit http://127.0.0.1:8000' -ForegroundColor Green
