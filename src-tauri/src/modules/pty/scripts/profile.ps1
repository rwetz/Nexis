# ╔══════════════════════════════════════╗
# ║  Ryan Wetzstein                      ║
# ║  Nexis                               ║
# ║  2026                                ║
# ╚══════════════════════════════════════╝

# nexis-shell-integration (PowerShell)
# Emits OSC 7 (cwd) + OSC 133 A/B/D so the host tracks cwd and prompt boundaries.

if ($global:__NEXIS_HOOKS_LOADED) { return }
$global:__NEXIS_HOOKS_LOADED = $true

try {
    [Console]::InputEncoding  = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $global:OutputEncoding    = [System.Text.UTF8Encoding]::new($false)
} catch {}

# PowerShell calls SetConsoleTitleW during startup; ConPTY forwards that as
# OSC 0, so the tab label shows the executable path. Emit a clean OSC 0 to
# override it before the first prompt renders.
try {
    $_ne = [char]27
    $_nt = if ($PSVersionTable.PSEdition -eq 'Core') { 'pwsh' } else { 'PowerShell' }
    [Console]::Write("${_ne}]0;${_nt}${_ne}\")
    Remove-Variable _ne, _nt -ErrorAction SilentlyContinue
} catch {}

if (Test-Path Function:prompt) {
    Copy-Item Function:prompt Function:__nexis_user_prompt -Force -ErrorAction SilentlyContinue
}

function global:__nexis_urlencode {
    param([string]$s)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
    $sb = [System.Text.StringBuilder]::new($bytes.Length)
    foreach ($b in $bytes) {
        if (($b -ge 0x30 -and $b -le 0x39) -or
            ($b -ge 0x41 -and $b -le 0x5A) -or
            ($b -ge 0x61 -and $b -le 0x7A) -or
            $b -eq 0x2F -or $b -eq 0x2E -or $b -eq 0x5F -or
            $b -eq 0x7E -or $b -eq 0x2D) {
            [void]$sb.Append([char]$b)
        } else {
            [void]$sb.AppendFormat('%{0:X2}', $b)
        }
    }
    $sb.ToString()
}

function global:prompt {
    $lec = $LASTEXITCODE
    if ($null -eq $lec) { $lec = if ($?) { 0 } else { 1 } }
    $esc = [char]27

    $oscD = "$esc]133;D;$lec$esc\"
    $oscA = "$esc]133;A$esc\"
    $oscB = "$esc]133;B$esc\"

    $loc = Get-Location
    $osc7 = ''
    if ($loc.Provider.Name -eq 'FileSystem') {
        $cwd = $loc.ProviderPath -replace '\\','/'
        if ($cwd -match '^[A-Za-z]:') { $cwd = "/$cwd" }
        $cwdEnc = __nexis_urlencode $cwd
        $hostName = [System.Environment]::MachineName
        $osc7 = "$esc]7;file://$hostName$cwdEnc$esc\"
    }

    $original = if (Test-Path Function:__nexis_user_prompt) {
        try { & __nexis_user_prompt } catch { "PS $((Get-Location).Path)> " }
    } else {
        "PS $((Get-Location).Path)> "
    }

    $global:LASTEXITCODE = $lec
    "$oscD$oscA$osc7${original}${oscB}"
}

# ── OSC 133 C — command pre-execution ────────────────────────────────────────
#
# Every other shell Nexis integrates with emits C from a native pre-exec hook
# (bash's PS0, zsh/fish preexec). PowerShell has no such hook, so without this
# the sequence for a PS session is A, B, D — and B is the LAST marker a resting
# prompt emits, which left the frontend unable to tell "a command is running"
# from "sitting at the prompt". Everything that asked went on to get "running",
# which is why closing an idle terminal tab always warned about a live process.
#
# Enter is the only moment PowerShell offers that means "this line is about to
# run", so the marker is emitted from a PSReadLine key handler, which is the
# same mechanism Windows Terminal's own shell integration uses.
#
# Guarded rather than assumed: PSReadLine ships with PowerShell 5.1+ and pwsh
# but can be absent or blocked by policy, and a profile that throws here would
# cost the user their prompt to buy a confirmation dialog. Failing quietly
# leaves this one signal missing and nothing else worse.
if (Get-Module -ListAvailable -Name PSReadLine -ErrorAction SilentlyContinue) {
    try {
        Import-Module PSReadLine -ErrorAction Stop

        Set-PSReadLineKeyHandler -Chord Enter -BriefDescription 'NexisAcceptLine' `
            -LongDescription 'Emit OSC 133;C, then accept the line.' -ScriptBlock {
            # Only mark execution when the buffer actually holds something.
            # A bare Enter redraws the prompt without running anything, and
            # claiming otherwise would re-create the false positive this
            # exists to remove.
            $line = $null
            $cursor = $null
            [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState(
                [ref]$line, [ref]$cursor)
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                $esc = [char]27
                [Console]::Write("$esc]133;C$esc\")
            }
            [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        }
    } catch {
        # No pre-exec marker on this host. Liveness checks degrade to "not
        # running", which is the safe direction.
    }
}
