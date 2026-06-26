# Kill orphaned `pnpm tauri dev` processes.
#
# Ctrl+C in PowerShell usually only stops the foreground `tauri` process, not
# the Vite, cargo, and nexis.exe children it spawned. Those orphans keep holding
# port 1420 (Vite) and the src-tauri/target build lock (cargo / nexis.exe), so
# the next `pnpm tauri dev` fails with "Port 1420 is already in use" and
# "Blocking waiting for file lock on artifact directory".
#
# Run this (or `pnpm dev:kill`) to clear them. It only targets processes whose
# command line references this project's dev toolchain, so it will not touch VS
# Code, language servers, or unrelated node apps.
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads a UTF-8 .ps1
# without a BOM as Windows-1252, which can turn a non-ASCII byte into a
# "smart quote" that it treats as a string delimiter and mis-parses the script.

$ErrorActionPreference = "Stop"

$targets = Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='cargo.exe' OR Name='nexis.exe' OR Name='rustc.exe'" |
  Where-Object { $_.CommandLine -match 'tauri|vite|nexis|\\Nexis\\' }

if (-not $targets) {
  Write-Host "No orphaned tauri dev processes found."
} else {
  foreach ($p in $targets) {
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      Write-Host "Killed $($p.ProcessId) ($($p.Name))"
    } catch {
      Write-Host "Skipped $($p.ProcessId) (already gone)"
    }
  }
}

$port = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
if ($port) {
  Write-Warning "Port 1420 still in use by PID $($port.OwningProcess) - not a tauri dev process; investigate manually."
  exit 1
}
Write-Host "Port 1420: FREE - safe to run pnpm tauri dev."
