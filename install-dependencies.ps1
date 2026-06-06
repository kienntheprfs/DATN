param(
    [string]$ServicePath,
    [string]$PythonVersion = "3.11",
    [string]$Mode = "pip"  # "pip" or "sync"
)

if (-not $ServicePath) {
    Write-Host "Usage: .\install-dependencies.ps1 -ServicePath 'path/to/service' [-PythonVersion '3.11'] [-Mode 'pip|sync']" -ForegroundColor Red
    exit 1
}

$venvPath = Join-Path $ServicePath ".venv"

# Check if venv exists
if (Test-Path $venvPath) {
    Write-Host "Virtual environment already exists at: $venvPath" -ForegroundColor Green
    Write-Host "Skipping venv creation..." -ForegroundColor Cyan
} else {
    Write-Host "Creating virtual environment at: $venvPath" -ForegroundColor Cyan
    Set-Location $ServicePath
    uv venv --python $PythonVersion
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create virtual environment" -ForegroundColor Red
        exit 1
    }
}

# Install/Sync dependencies
Set-Location $ServicePath

if ($Mode -eq "pip") {
    if (Test-Path "requirements.txt") {
        Write-Host "Installing dependencies from requirements.txt..." -ForegroundColor Cyan
        uv pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to install dependencies" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "requirements.txt not found, skipping pip install" -ForegroundColor Yellow
    }
} elseif ($Mode -eq "sync") {
    Write-Host "Syncing dependencies..." -ForegroundColor Cyan
    uv sync
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to sync dependencies" -ForegroundColor Red
        exit 1
    }
} elseif ($Mode -eq "editable") {
    Write-Host "Installing in editable mode..." -ForegroundColor Cyan
    uv pip install -e ".[test,offline]"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install in editable mode" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Dependencies installation completed successfully" -ForegroundColor Green
exit 0
