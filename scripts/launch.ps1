# Desktop shortcut target: starts the release build of Nito, rebuilding it first
# when the repo has a newer commit than the last build. Before a rebuild the
# live database is copied to <app data>/backups (last 5 kept), because a new
# build may run new migrations on it.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $repo "src-tauri\target\release\nito.exe"
$stamp = Join-Path $repo "src-tauri\target\release\.launch-commit"
$head = (git -C $repo rev-parse HEAD).Trim()
$built = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { "" }

if (-not (Test-Path $exe) -or $built -ne $head) {
  $host.UI.RawUI.WindowTitle = "Nito güncelleniyor"
  Write-Host "Nito güncelleniyor (birkaç dakika sürebilir)..." -ForegroundColor Cyan

  $data = Join-Path $env:APPDATA "com.ibrahimtaskiran.nito"
  $db = Join-Path $data "nito.sqlite"
  if (Test-Path $db) {
    $backups = Join-Path $data "backups"
    New-Item -ItemType Directory -Force $backups | Out-Null
    Copy-Item $db (Join-Path $backups ("launch-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".sqlite"))
    Get-ChildItem $backups -Filter "launch-*.sqlite" | Sort-Object Name -Descending | Select-Object -Skip 5 | Remove-Item -Force
    Write-Host "Veritabanı yedeklendi: $backups"
  }

  Push-Location $repo
  try {
    npx tauri build --no-bundle
    $ok = $LASTEXITCODE -eq 0
  } finally { Pop-Location }

  if ($ok) {
    Set-Content -Path $stamp -Value $head -Encoding ascii
  } elseif (Test-Path $exe) {
    Write-Host "Derleme başarısız; önceki sürüm açılıyor." -ForegroundColor Yellow
    Start-Sleep -Seconds 4
  } else {
    Write-Host "Derleme başarısız. Pencereyi kapatmak için bir tuşa bas." -ForegroundColor Red
    [void][Console]::ReadKey($true)
    exit 1
  }
}

Start-Process $exe -WorkingDirectory (Split-Path $exe)
