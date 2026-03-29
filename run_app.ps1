# --- Institutional Trading Terminal Bootstrapper (Windows/PS1) ---

# 1. Dependency Alignment
Write-Host ">>> Synchronizing Institutional Dependency Stack..." -ForegroundColor Cyan
pip install -r requirements.txt --upgrade

# 2. Environment Validation
if (!(Test-Path "backend")) {
    Write-Host "ERR: backend folder not found. Please run from project root." -ForegroundColor Red
    exit
}

# 3. Execution Phase
Write-Host ">>> Launching High-Fidelity Execution Gateway (FastAPI)..." -ForegroundColor Green
Set-Location "backend"
python -m uvicorn app.main:app --reload --port 8000
