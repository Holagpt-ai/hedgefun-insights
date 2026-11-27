# Shared lock, Fly invocation, and cleanup helpers for historical catch-up.
# Dot-source from operator scripts. Not a scheduled entrypoint.

function Get-CatchupLockOwner {
  param([Parameter(Mandatory = $true)][string]$LockPath)
  if (-not (Test-Path -LiteralPath $LockPath)) { return $null }
  try {
    $parsed = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json
    if ($parsed.ownerId) { return [string]$parsed.ownerId }
  } catch {
    return $null
  }
  return $null
}

function Acquire-CatchupLock {
  param(
    [Parameter(Mandatory = $true)][string]$LockPath,
    [Parameter(Mandatory = $true)][string]$OwnerId
  )
  $dir = Split-Path -Parent $LockPath
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $payload = @{
    ownerId = $OwnerId
    pid = $PID
    createdAt = [DateTime]::UtcNow.ToString("o")
  } | ConvertTo-Json -Compress
  try {
    $fs = [System.IO.File]::Open(
      $LockPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::None
    )
    try {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
      $fs.Write($bytes, 0, $bytes.Length)
    } finally {
      $fs.Dispose()
    }
    return $true
  } catch [System.IO.IOException] {
    return $false
  }
}

function Assert-CatchupLockOwner {
  param(
    [Parameter(Mandatory = $true)][string]$LockPath,
    [Parameter(Mandatory = $true)][string]$OwnerId
  )
  $existing = Get-CatchupLockOwner -LockPath $LockPath
  if (-not $existing) { throw "expected lock at $LockPath for owner $OwnerId" }
  if ($existing -ne $OwnerId) {
    throw "lock at $LockPath is owned by $existing, not $OwnerId"
  }
}

function Release-CatchupLock {
  param(
    [Parameter(Mandatory = $true)][string]$LockPath,
    [Parameter(Mandatory = $true)][string]$OwnerId
  )
  if (-not (Test-Path -LiteralPath $LockPath)) { return }
  Assert-CatchupLockOwner -LockPath $LockPath -OwnerId $OwnerId
  Remove-Item -LiteralPath $LockPath -Force
}

function Invoke-FlyNative {
  param(
    [Parameter(Mandatory = $true)][string]$FlyExe,
    [Parameter(Mandatory = $true)][string[]]$FlyArgs
  )
  if ($FlyExe -like "*.ps1") {
    $quoted = @($FlyArgs | ForEach-Object { "'" + ($_ -replace "'", "''") + "'" })
    $script = ($FlyExe -replace "'", "''")
    $command = "& '$script' " + ($quoted -join " ")
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $command 2>&1 | Out-String
  } else {
    $output = & $FlyExe @FlyArgs 2>&1 | Out-String
  }
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  if ($code -ne 0) {
    throw "fly $($FlyArgs -join ' ') failed with exit $code : $output"
  }
  return $output
}

function Get-FlyMachines {
  param(
    [Parameter(Mandatory = $true)][string]$FlyExe,
    [Parameter(Mandatory = $true)][string]$App
  )
  $raw = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("machines", "list", "-a", $App, "--json")
  $trimmed = $raw.Trim()
  if (-not $trimmed) { return }
  if ($trimmed -match '(\[\s*\{[\s\S]*\}\s*\])') { $trimmed = $Matches[1] }
  elseif ($trimmed -match '(\[\s*\])') { $trimmed = $Matches[1] }
  if ($trimmed -eq "[]") { return }
  $parsed = $trimmed | ConvertFrom-Json
  if ($null -eq $parsed) { return }
  foreach ($row in @($parsed)) { $row }
}

function Assert-ZeroFlyMachines {
  param(
    [Parameter(Mandatory = $true)][string]$FlyExe,
    [Parameter(Mandatory = $true)][string]$App
  )
  $list = @(Get-FlyMachines -FlyExe $FlyExe -App $App)
  if (@($list).Count -gt 0) {
    throw "expected zero machines on $App (found $($list.Count))"
  }
}

function Ensure-FlyScaleZero {
  param(
    [Parameter(Mandatory = $true)][string]$FlyExe,
    [Parameter(Mandatory = $true)][string]$App,
    [int]$SettleSeconds = 4
  )
  $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("scale", "count", "0", "--process-group", "backfill", "-a", $App, "--yes")
  if ($SettleSeconds -gt 0) { Start-Sleep -Seconds $SettleSeconds }
  Assert-ZeroFlyMachines -FlyExe $FlyExe -App $App
}

function Test-FlyPreflightGuard {
  param(
    [Parameter(Mandatory = $true)][string]$FlyExe,
    [Parameter(Mandatory = $true)][string]$App
  )
  $raw = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("secrets", "list", "-a", $App, "--json")
  if ($raw -match "HISTORICAL_CATCHUP_PREFLIGHT_ONLY") { return $true }
  $trimmed = $raw.Trim()
  if (-not $trimmed) { return $false }
  try {
    $parsed = @($trimmed | ConvertFrom-Json)
  } catch {
    return $false
  }
  foreach ($row in $parsed) {
    $name = $null
    if ($row.Name) { $name = [string]$row.Name }
    elseif ($row.name) { $name = [string]$row.name }
    if ($name -eq "HISTORICAL_CATCHUP_PREFLIGHT_ONLY") { return $true }
  }
  return $false
}

function Restore-FlyPreflightGuard {
  param(
    [Parameter(Mandatory = $true)][string]$FlyExe,
    [Parameter(Mandatory = $true)][string]$App
  )
  $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("secrets", "set", "-a", $App, "HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1")
  if (-not (Test-FlyPreflightGuard -FlyExe $FlyExe -App $App)) {
    throw "preflight guard HISTORICAL_CATCHUP_PREFLIGHT_ONLY was not restored on $App"
  }
}

function Import-CatchupCampaignStateWithDefaults {
  param([Parameter(Mandatory = $true)][string]$StatePath)
  if (-not (Test-Path -LiteralPath $StatePath)) { throw "missing campaign state: $StatePath" }
  $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  if (-not ($state.PSObject.Properties.Name -contains "pendingRun")) {
    $state | Add-Member -NotePropertyName pendingRun -NotePropertyValue $false
  }
  if (-not ($state.PSObject.Properties.Name -contains "pendingProviderReservation")) {
    $state | Add-Member -NotePropertyName pendingProviderReservation -NotePropertyValue 0
  }
  if (-not ($state.PSObject.Properties.Name -contains "lastEmptyWindowFingerprint")) {
    $state | Add-Member -NotePropertyName lastEmptyWindowFingerprint -NotePropertyValue $null
  }
  if (-not ($state.PSObject.Properties.Name -contains "consecutiveIdenticalEmptyRuns")) {
    $state | Add-Member -NotePropertyName consecutiveIdenticalEmptyRuns -NotePropertyValue 0
  }
  return $state
}

function Save-CatchupCampaignStateFile {
  param(
    [Parameter(Mandatory = $true)][string]$StatePath,
    [Parameter(Mandatory = $true)]$State
  )
  $json = $State | ConvertTo-Json -Depth 6
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($StatePath, $json + "`n", $utf8)
}
