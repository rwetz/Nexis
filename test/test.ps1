# Test PowerShell script — Nexis editor playground
# Exercises: classes, enums, advanced functions, pipelines, jobs, remoting stubs,
#            error handling, regex, DSC-style syntax, module patterns

#Requires -Version 7.2

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Enum ──────────────────────────────────────────────────────────────────────

enum LogLevel {
    Trace = 0
    Debug = 1
    Info  = 2
    Warn  = 3
    Error = 4
    Fatal = 5
}

enum ProjectStatus {
    Pending
    Active
    Paused
    Completed
    Archived
}

# ── Classes ───────────────────────────────────────────────────────────────────

class Logger {
    [LogLevel] $MinLevel
    [string]   $Prefix
    hidden [System.Collections.Generic.List[string]] $Buffer

    Logger([string] $prefix, [LogLevel] $minLevel = [LogLevel]::Info) {
        $this.Prefix   = $prefix
        $this.MinLevel = $minLevel
        $this.Buffer   = [System.Collections.Generic.List[string]]::new()
    }

    [void] Write([LogLevel] $level, [string] $message) {
        if ($level -lt $this.MinLevel) { return }
        $ts    = Get-Date -Format 'HH:mm:ss.fff'
        $entry = "[$ts] [$level] [$($this.Prefix)] $message"
        $this.Buffer.Add($entry)

        $colour = switch ($level) {
            ([LogLevel]::Error) { 'Red'    }
            ([LogLevel]::Warn)  { 'Yellow' }
            ([LogLevel]::Info)  { 'Cyan'   }
            default             { 'Gray'   }
        }
        Write-Host $entry -ForegroundColor $colour
    }

    [void] Info([string]  $msg) { $this.Write([LogLevel]::Info,  $msg) }
    [void] Warn([string]  $msg) { $this.Write([LogLevel]::Warn,  $msg) }
    [void] Error([string] $msg) { $this.Write([LogLevel]::Error, $msg) }

    [string[]] Flush() {
        $lines = $this.Buffer.ToArray()
        $this.Buffer.Clear()
        return $lines
    }
}

class Project {
    [string]        $Name
    [ProjectStatus] $Status
    [string[]]      $Tags
    [datetime]      $CreatedAt
    [nullable[datetime]] $CompletedAt
    hidden [Logger] $_log

    Project([string] $name) {
        $this.Name      = $name
        $this.Status    = [ProjectStatus]::Pending
        $this.Tags      = @()
        $this.CreatedAt = Get-Date
        $this._log      = [Logger]::new("Project:$name")
    }

    [void] Start() {
        if ($this.Status -ne [ProjectStatus]::Pending) {
            throw [InvalidOperationException]::new("Cannot start: status is $($this.Status)")
        }
        $this.Status = [ProjectStatus]::Active
        $this._log.Info("Project started")
    }

    [void] Complete() {
        $this.Status      = [ProjectStatus]::Completed
        $this.CompletedAt = Get-Date
        $this._log.Info("Project completed in $([math]::Round(($this.CompletedAt - $this.CreatedAt).TotalMinutes, 1)) min")
    }

    [timespan] Age() {
        return (Get-Date) - $this.CreatedAt
    }

    [string] ToString() {
        return "Project[$($this.Name), $($this.Status)]"
    }
}

# ── Advanced functions ────────────────────────────────────────────────────────

function Invoke-WithRetry {
    [CmdletBinding()]
    [OutputType([object])]
    param(
        [Parameter(Mandatory, Position = 0)]
        [scriptblock] $ScriptBlock,

        [Parameter()]
        [ValidateRange(1, 20)]
        [int] $MaxAttempts = 3,

        [Parameter()]
        [ValidateRange(0, 60)]
        [double] $DelaySeconds = 1.0,

        [Parameter()]
        [double] $BackoffMultiplier = 2.0,

        [Parameter()]
        [Type[]] $RetryOn = @([System.Net.WebException], [System.TimeoutException])
    )

    $attempt = 0
    $delay   = $DelaySeconds

    do {
        $attempt++
        try {
            return & $ScriptBlock
        }
        catch {
            $ex = $_.Exception
            $shouldRetry = $RetryOn | Where-Object { $ex -is $_ }
            if (-not $shouldRetry -or $attempt -ge $MaxAttempts) { throw }

            Write-Warning "Attempt $attempt/$MaxAttempts failed: $($ex.Message). Retrying in ${delay}s…"
            Start-Sleep -Seconds $delay
            $delay *= $BackoffMultiplier
        }
    } while ($attempt -lt $MaxAttempts)
}

function ConvertTo-FlatObject {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [hashtable] $InputObject,

        [string] $Separator = '.',
        [string] $Prefix    = ''
    )

    process {
        $result = [ordered]@{}
        foreach ($key in $InputObject.Keys) {
            $fullKey = if ($Prefix) { "$Prefix$Separator$key" } else { $key }
            $value   = $InputObject[$key]

            if ($value -is [hashtable]) {
                $nested = ConvertTo-FlatObject -InputObject $value -Separator $Separator -Prefix $fullKey
                $nested.GetEnumerator() | ForEach-Object { $result[$_.Key] = $_.Value }
            }
            else {
                $result[$fullKey] = $value
            }
        }
        $result
    }
}

function Get-SystemSummary {
    [CmdletBinding()]
    param()

    $cpu = Get-CimInstance Win32_Processor -Property Name, NumberOfCores, MaxClockSpeed |
           Select-Object -First 1

    $os = Get-CimInstance Win32_OperatingSystem -Property Caption, TotalVisibleMemorySize, FreePhysicalMemory

    [pscustomobject]@{
        Hostname    = $env:COMPUTERNAME
        OS          = $os.Caption
        CPU         = $cpu.Name.Trim()
        Cores       = $cpu.NumberOfCores
        GHz         = [math]::Round($cpu.MaxClockSpeed / 1000, 1)
        TotalRAM_GB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
        FreeRAM_GB  = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
        PSVersion   = $PSVersionTable.PSVersion.ToString()
    }
}

# ── Pipeline demo ─────────────────────────────────────────────────────────────

function Get-LargeFiles {
    [CmdletBinding()]
    param(
        [string] $Path      = $PWD,
        [double] $MinSizeMB = 10,
        [int]    $Top       = 20
    )

    Get-ChildItem -Path $Path -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object  { $_.Length -gt $MinSizeMB * 1MB } |
        Sort-Object   Length -Descending |
        Select-Object -First $Top |
        Select-Object @{ N = 'Path';   E = { $_.FullName } },
                      @{ N = 'SizeMB'; E = { [math]::Round($_.Length / 1MB, 2) } },
                      @{ N = 'Ext';    E = { $_.Extension } },
                      LastWriteTime
}

# ── Regex & string ops ────────────────────────────────────────────────────────

function ConvertFrom-SemVer {
    param([Parameter(Mandatory, ValueFromPipeline)] [string] $Version)

    process {
        if ($Version -match '^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<pre>[a-zA-Z0-9.]+))?(?:\+(?<build>[a-zA-Z0-9.]+))?$') {
            [pscustomobject]@{
                Major      = [int]   $Matches.major
                Minor      = [int]   $Matches.minor
                Patch      = [int]   $Matches.patch
                PreRelease = $Matches.pre
                Build      = $Matches.build
                IsStable   = -not $Matches.pre
            }
        }
        else {
            throw "Invalid SemVer: '$Version'"
        }
    }
}

# ── Error handling ────────────────────────────────────────────────────────────

function Test-ErrorHandling {
    # try/catch/finally
    try {
        $null.Length  # NullReferenceException
    }
    catch [System.Management.Automation.RuntimeException] {
        Write-Warning "Runtime error: $_"
    }
    catch {
        Write-Warning "Unexpected: $($_.Exception.GetType().Name): $_"
    }
    finally {
        Write-Verbose "Finally block always runs"
    }

    # $ErrorVariable
    Get-Item "C:\does\not\exist" -ErrorAction SilentlyContinue -ErrorVariable capturedErr
    if ($capturedErr) {
        Write-Warning "Captured: $($capturedErr[0].Exception.Message)"
    }
}

# ── Background jobs ───────────────────────────────────────────────────────────

function Start-ParallelWork {
    param([int[]] $Numbers)

    $jobs = $Numbers | ForEach-Object {
        $n = $_
        Start-Job -ScriptBlock {
            param($num)
            # Simulate work
            Start-Sleep -Milliseconds (Get-Random -Minimum 100 -Maximum 500)
            [pscustomobject]@{
                Input  = $num
                Square = $num * $num
                Cube   = $num * $num * $num
            }
        } -ArgumentList $n
    }

    $jobs | Wait-Job | Receive-Job | Sort-Object Input
    $jobs | Remove-Job
}

# ── Format output ─────────────────────────────────────────────────────────────

function Show-Table {
    param([object[]] $Data, [string] $Title)

    Write-Host "`n  $Title" -ForegroundColor Cyan
    Write-Host "  $('─' * 60)" -ForegroundColor DarkGray
    $Data | Format-Table -AutoSize | Out-String | ForEach-Object {
        Write-Host "  $_" -NoNewline
    }
}

# ── Entry point ───────────────────────────────────────────────────────────────

if ($MyInvocation.InvocationName -ne '.') {
    $log = [Logger]::new('Main', [LogLevel]::Info)
    $log.Info("Nexis PS playground started")

    # Class demo
    $proj = [Project]::new('nexis-test')
    $proj.Start()
    Start-Sleep -Milliseconds 10
    $proj.Complete()
    Write-Host $proj.ToString()

    # Flatten nested hashtable
    $nested = @{ app = @{ name = 'nexis'; version = '1.3.0'; db = @{ host = 'localhost'; port = 5432 } } }
    $flat = ConvertTo-FlatObject -InputObject $nested
    Show-Table -Data ($flat.GetEnumerator() | Select-Object Key, Value) -Title "Flat Object"

    # SemVer parsing
    '1.3.0', 'v2.0.0-alpha.1', '0.9.0+build.42' | ConvertFrom-SemVer | Show-Table -Title "SemVer"

    # Parallel jobs
    $results = Start-ParallelWork -Numbers 1..6
    Show-Table -Data $results -Title "Parallel Results"

    $log.Info("Done.")
}
