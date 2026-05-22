# Nexis production build
# Usage: .\build.ps1
# Output: src-tauri/target/release/bundle/nsis/Nexis_*-setup.exe

$env:Path = "$env:Path;C:\Users\Ryan\.cargo\bin"
$pnpm = "C:\Users\Ryan\AppData\Roaming\npm\pnpm.cmd"
$override = @{ build = @{ beforeBuildCommand = "" } } | ConvertTo-Json -Compress

Write-Host "Building frontend..." -ForegroundColor Cyan
& $pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Building Tauri bundle..." -ForegroundColor Cyan
& $pnpm tauri build --config $override
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done!" -ForegroundColor Green
Get-ChildItem src-tauri\target\release\bundle\nsis\*.exe | Select-Object Name, LastWriteTime
