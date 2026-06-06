# Check if LightRAG submodule already exists and is valid
$lightragPath = Join-Path (Get-Location) "LightRAG"
$gitPath = Join-Path $lightragPath ".git"

Write-Host "Checking LightRAG at: $lightragPath" -ForegroundColor Cyan

if (Test-Path $gitPath) {
    Write-Host "LightRAG submodule already initialized. Skipping..." -ForegroundColor Green
    exit 0
}

if (Test-Path $lightragPath) {
    Write-Host "LightRAG folder exists but is not a valid submodule. Removing..." -ForegroundColor Yellow
    try {
        Remove-Item -Path $lightragPath -Recurse -Force -ErrorAction Stop
        Write-Host "Removed existing LightRAG folder" -ForegroundColor Green
    } catch {
        Write-Host "Failed to remove LightRAG: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Initializing Git LFS and submodules..." -ForegroundColor Cyan

git lfs install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git LFS install warning (may be already installed)" -ForegroundColor Yellow
}

git submodule update --init --recursive
if ($LASTEXITCODE -eq 0) {
    Write-Host "Git LFS and submodules initialized successfully" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Git submodule update failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}
