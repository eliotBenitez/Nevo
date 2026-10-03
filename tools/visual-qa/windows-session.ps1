[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'status', 'stop')]
  [string] $Action,

  [ValidateRange(1, 65535)]
  [int] $Port = 9223
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$sessionRoot = Join-Path $repoRoot '.qa/windows'
$statePath = Join-Path $sessionRoot 'session.json'
$vitePort = 1420

function Test-TcpPort([int] $Number) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Number)
  try {
    $listener.Start()
    return $false
  } catch [System.Net.Sockets.SocketException] {
    return $true
  } finally {
    $listener.Stop()
  }
}

function Write-Session($State) {
  $State.updatedAt = [DateTime]::UtcNow.ToString('o')
  $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding utf8
}

function Read-Session {
  if (-not (Test-Path -LiteralPath $statePath)) { throw "No QA session exists at $statePath" }
  return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}

function Get-ProcessCreationUtc($Process) {
  if ($Process.CreationDate -is [DateTime]) { return $Process.CreationDate.ToUniversalTime() }
  return [System.Management.ManagementDateTimeConverter]::ToDateTime([string]$Process.CreationDate).ToUniversalTime()
}

function Get-RecordedRoot($Record, $AllProcesses) {
  $proc = $AllProcesses | Where-Object { $_.ProcessId -eq [int]$Record.pid } | Select-Object -First 1
  if (-not $proc -or $proc.ExecutablePath -ne $Record.executable -or $proc.CommandLine -notlike "*$($Record.commandMarker)*") { return $null }
  $createdUtc = Get-ProcessCreationUtc $proc
  $recordCreated = $Record.createdAtUtc
  if ($recordCreated -is [DateTime]) {
    $recordCreatedUtc = $recordCreated.ToUniversalTime()
  } else {
    $recordCreatedUtc = [DateTimeOffset]::Parse([string]$recordCreated, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime
  }
  if ([Math]::Abs(($createdUtc - $recordCreatedUtc).TotalSeconds) -gt 3) { return $null }
  return $proc
}

function Get-OwnedProcessTree($State) {
  $all = @(Get-CimInstance Win32_Process)
  $owned = [System.Collections.Generic.HashSet[int]]::new()
  foreach ($root in @($State.processes)) {
    $proc = Get-RecordedRoot $root $all
    if (-not $proc) { continue }
    $rootCreated = Get-ProcessCreationUtc $proc
    [void]$owned.Add([int]$proc.ProcessId)
    $changed = $true
    while ($changed) {
      $changed = $false
      foreach ($child in $all) {
        if ($owned.Contains([int]$child.ParentProcessId) -and (Get-ProcessCreationUtc $child) -ge $rootCreated -and $owned.Add([int]$child.ProcessId)) { $changed = $true }
      }
    }
  }
  return @($all | Where-Object { $owned.Contains([int]$_.ProcessId) })
}

function Stop-OwnedTree($State) {
  $tree = @(Get-OwnedProcessTree $State)
  foreach ($proc in ($tree | Sort-Object @{ Expression = { $_.ParentProcessId }; Descending = $true })) {
    Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction SilentlyContinue
  }
}

function Add-OwnedProcess($State, [string]$Name, [string]$Executable, [string]$Marker, [string[]]$Arguments, [string]$OutLog, [string]$ErrLog, [hashtable]$Environment) {
  $oldEnv = @{}
  foreach ($key in $Environment.Keys) { $oldEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  try {
    foreach ($key in $Environment.Keys) { [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], 'Process') }
    $quotedArguments = @($Arguments | ForEach-Object { '"' + ([string]$_).Replace('"', '\"') + '"' }) -join ' '
    $process = Start-Process -FilePath $Executable -ArgumentList $quotedArguments -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru
  } finally {
    foreach ($key in $Environment.Keys) { [Environment]::SetEnvironmentVariable($key, $oldEnv[$key], 'Process') }
  }
  $State.processes += [pscustomobject]@{ name = $Name; pid = $process.Id; executable = $Executable; commandMarker = $Marker; createdAtUtc = $process.StartTime.ToUniversalTime().ToString('o') }
  Write-Session $State
  return $process
}

function Wait-Cdp([int]$Number, [int]$TimeoutSeconds = 30) {
  $until = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    try {
      $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Number/json/list" -TimeoutSec 2
      return $true
    } catch { Start-Sleep -Milliseconds 400 }
  } while ([DateTime]::UtcNow -lt $until)
  return $false
}

if ($Action -eq 'status') {
  if (-not (Test-Path -LiteralPath $statePath)) { [pscustomobject]@{ status = 'stopped'; message = 'No recorded QA session.' } | ConvertTo-Json; exit 0 }
  $state = Read-Session
  $live = @(Get-OwnedProcessTree $state)
  $allProcesses = @(Get-CimInstance Win32_Process)
  $tauriRecord = @($state.processes | Where-Object name -eq 'tauri') | Select-Object -First 1
  $viteRecord = @($state.processes | Where-Object name -eq 'vite') | Select-Object -First 1
  $tauriRoot = if ($tauriRecord) { Get-RecordedRoot $tauriRecord $allProcesses } else { $null }
  $viteRoot = if ($viteRecord) { Get-RecordedRoot $viteRecord $allProcesses } else { $null }
  if ($state.status -ne 'stopped' -and (-not $tauriRoot -or -not $viteRoot)) {
    $missing = @()
    if (-not $viteRoot) { $missing += 'Vite' }
    if (-not $tauriRoot) { $missing += 'Tauri' }
    $state.status = 'failed'
    $state.error = "$($missing -join ' and ') process exited; inspect $($state.logs.viteError), $($state.logs.tauriError), and the corresponding stdout logs."
    Write-Session $state
  } elseif ($state.status -ne 'stopped') {
    if (Wait-Cdp ([int]$state.cdpPort) 2) {
      $state.status = 'ready'
      $state.error = $null
    } else {
      $state.status = 'starting'
      $state.error = $null
    }
    Write-Session $state
  }
  [pscustomobject]@{ status = $state.status; error = $state.error; port = $state.cdpPort; pids = @($live | ForEach-Object ProcessId); logs = $state.logs; session = $statePath } | ConvertTo-Json -Depth 5
  exit 0
}

if ($Action -eq 'stop') {
  if (-not (Test-Path -LiteralPath $statePath)) { [pscustomobject]@{ status = 'stopped'; message = 'No recorded QA session.' } | ConvertTo-Json; exit 0 }
  $state = Read-Session
  Stop-OwnedTree $state
  $state.status = 'stopped'
  Write-Session $state
  [pscustomobject]@{ status = 'stopped'; session = $statePath; logs = $state.logs } | ConvertTo-Json -Depth 5
  exit 0
}

if (Test-Path -LiteralPath $statePath) {
  $oldState = Read-Session
  if (@(Get-OwnedProcessTree $oldState).Count -gt 0) { throw 'An owned QA session is already running. Use -Action status or stop first.' }
}
if (Test-TcpPort $Port) { throw "CDP port $Port is already occupied; refusing to attach to an unknown process." }
if (Test-TcpPort $vitePort) { throw "Vite port $vitePort is already occupied; refusing to reuse an unverified development server." }

$null = New-Item -ItemType Directory -Force -Path $sessionRoot, (Join-Path $sessionRoot 'logs'), (Join-Path $sessionRoot 'webview-profile')
$logsDir = Join-Path $sessionRoot 'logs'
$session = [pscustomobject]@{
  status = 'starting'; repoRoot = $repoRoot; cdpPort = $Port; vitePort = $vitePort
  startedAt = [DateTime]::UtcNow.ToString('o'); updatedAt = $null; error = $null; message = $null; processes = @();
  logs = @{ vite = (Join-Path $logsDir 'vite.log'); viteError = (Join-Path $logsDir 'vite-error.log'); tauri = (Join-Path $logsDir 'tauri.log'); tauriError = (Join-Path $logsDir 'tauri-error.log') }
}
Write-Session $session

try {
  $overlayPath = Join-Path $sessionRoot 'tauri.conf.json'
  $viteOverlayPath = Join-Path $sessionRoot 'vite.config.mjs'
  $bootstrapHtml = Join-Path $sessionRoot 'bootstrap.html'
  $bootstrapJs = Join-Path $sessionRoot 'bootstrap.js'
  $overlay = @{
    identifier = 'com.eliotBenitezhvat.nevo.qa'
    build = @{ beforeDevCommand = ''; devUrl = "http://127.0.0.1:$vitePort" }
    app = @{ windows = @(@{ label = 'main'; title = 'Nevo QA'; width = 1440; height = 900; maximized = $false; visible = $false; decorations = $false; url = '.qa/windows/bootstrap.html'; additionalBrowserArgs = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port" }) }
  }
  $overlay | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $overlayPath -Encoding utf8
  @'
import { mergeConfig } from 'vite'
import baseConfig from '../../vite.config.ts'

export default async (env) => {
  const config = await baseConfig(env)
  return mergeConfig(config, { server: { watch: { ignored: ['**/.qa/**'] } } })
}
'@ | Set-Content -LiteralPath $viteOverlayPath -Encoding utf8
  '<!doctype html><html><head><meta charset="utf-8"><script src="./bootstrap.js"></script></head><body></body></html>' | Set-Content -LiteralPath $bootstrapHtml -Encoding utf8
  "localStorage.setItem('nevo.legacyCloudCleanupDone', 'true'); location.replace('/');" | Set-Content -LiteralPath $bootstrapJs -Encoding utf8

  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $viteScript = Join-Path $repoRoot 'node_modules/vite/bin/vite.js'
  $tauriScript = Join-Path $repoRoot 'node_modules/@tauri-apps/cli/tauri.js'
  foreach ($script in @($viteScript, $tauriScript)) { if (-not (Test-Path -LiteralPath $script)) { throw "Required installed script not found: $script" } }

  $viteMarker = $viteScript
  $null = Add-OwnedProcess $session 'vite' $node $viteMarker @($viteScript, '--config', $viteOverlayPath, '--host', '127.0.0.1', '--port', "$vitePort", '--strictPort') $session.logs.vite $session.logs.viteError @{}
  $envVars = @{
    WEBVIEW2_USER_DATA_FOLDER = (Join-Path $sessionRoot 'webview-profile')
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port"
  }
  $configArg = (Resolve-Path -LiteralPath $overlayPath).Path
  $tauriMarker = $tauriScript
  $null = Add-OwnedProcess $session 'tauri' $node $tauriMarker @($tauriScript, 'dev', '--no-watch', '--config', $configArg) $session.logs.tauri $session.logs.tauriError $envVars
  if (Wait-Cdp $Port) { $session.status = 'ready' } else { $session.status = 'starting'; $session.message = 'Tauri is still starting; poll -Action status.' }
  Write-Session $session
  [pscustomobject]@{ status = $session.status; port = $Port; pids = @($session.processes | ForEach-Object pid); session = $statePath; logs = $session.logs } | ConvertTo-Json -Depth 5
} catch {
  Stop-OwnedTree $session
  $session.status = 'failed'
  $session.error = $_.Exception.Message
  Write-Session $session
  throw
}
