# Operator: sequential Fly historical catch-up with persisted campaign budget.
param(
  [int]$MaxRuns = 20,
  [int]$MaxCumulativeProvider = 50000,
  [int]$MaxProviderPerRun = 2500,
  [string]$App = "stocksist-historical-backfill-job",
  [string]$LogOut = "",
  [string]$StatePath = "",
  [string]$LockPath = "",
  [string]$LockOwnerId = "",
  [switch]$AssumeLockHeld,
  [switch]$SingleRun,
  [int]$MaxWaitMinutes = 52,
  [string]$FlyExe = "fly",
  [int]$ScaleSettleSeconds = 8,
  [int]$PollSeconds = 25,
  [int]$LogSettleSeconds = 8,
  [int]$ScaleZeroSettleSeconds = 4
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "catchup-ops.ps1")

if (-not $LogOut) { $LogOut = Join-Path $PSScriptRoot "_campaign-nov26.jsonl" }
if (-not $StatePath) { $StatePath = Join-Path $PSScriptRoot "campaign-state.nov26.json" }
if (-not $LockPath) { $LockPath = Join-Path $PSScriptRoot ".historical-catchup.lock" }
if (-not $LockOwnerId) { $LockOwnerId = [guid]::NewGuid().ToString("N") }

function Get-ProviderTotal($Provider) {
  if (-not $Provider) { return $null }
  return [int]$Provider.dailyRequests + [int]$Provider.referenceRequests + [int]$Provider.nextPages
}

function Get-LatestRunEvents([string]$MachineId) {
  $raw = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("logs", "-a", $App, "--no-tail")
  $events = @()
  foreach ($line in ($raw -split "`n")) {
    if ($line -notmatch $MachineId -or $line -notmatch '\{.*event.*\}') { continue }
    if ($line -match '\{(.*)\}') {
      try {
        $obj = "{" + $Matches[1] + "}" | ConvertFrom-Json
        if ($obj.event) { $events += $obj }
      } catch {}
    }
  }
  return $events
}

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
$StuckEmptyRunLimit = 2

$haltReason = $null
$terminal = $null
$ownsLock = $false
$ownsCampaign = $false
$cleanupFailed = $false
$cleanupError = $null
$runError = $null

try {
  if ($AssumeLockHeld) {
    Assert-CatchupLockOwner -LockPath $LockPath -OwnerId $LockOwnerId
    $ownsCampaign = $true
  } else {
    if (-not (Acquire-CatchupLock -LockPath $LockPath -OwnerId $LockOwnerId)) {
      throw "campaign lock exists: $LockPath"
    }
    $ownsLock = $true
    $ownsCampaign = $true
  }

  Assert-ZeroFlyMachines -FlyExe $FlyExe -App $App

  if ($state.pendingRun -eq $true) {
    $state.pendingRun = $false
    $state.pendingProviderReservation = 0
    Save-CatchupCampaignStateFile -StatePath $StatePath -State $state
  }

  $runStart = [int]$state.executionsCompleted + 1
  $maxRuns = [Math]::Min($MaxRuns, [int]$state.maxExecutions - [int]$state.executionsCompleted)
  if ($SingleRun) { $maxRuns = 1 }
  $providerBudget = [int]$state.providerUsed + [int]$state.providerReservedUncertain
  if ([int]$state.executionsCompleted -ge [int]$state.maxExecutions) { throw "execution budget exhausted" }
  $providerCap = [Math]::Min([int]$state.maxProviderRequests, $MaxCumulativeProvider)
  $remaining = $providerCap - $providerBudget
  if ($remaining -lt $MaxProviderPerRun) {
    throw "remaining provider budget $remaining is below next run allowance $MaxProviderPerRun"
  }

  $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("secrets", "unset", "-a", $App, "HISTORICAL_CATCHUP_PREFLIGHT_ONLY")

  for ($run = $runStart; $run -lt ($runStart + $maxRuns); $run++) {
    $providerBudget = [int]$state.providerUsed + [int]$state.providerReservedUncertain
    $remaining = [Math]::Min([int]$state.maxProviderRequests, $MaxCumulativeProvider) - $providerBudget
    if ($remaining -lt $MaxProviderPerRun) {
      $haltReason = "campaign_provider_budget"
      break
    }

    Assert-ZeroFlyMachines -FlyExe $FlyExe -App $App

    # Refresh exclusive queue cursor before every machine start (survives multi-run campaigns).
    if ($state.queueAfterSymbol) {
      $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("secrets", "set", "-a", $App, "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL=$($state.queueAfterSymbol)")
    }

    $state.executionsCompleted = [int]$state.executionsCompleted + 1
    $state.providerReservedUncertain = [int]$state.providerReservedUncertain + $MaxProviderPerRun
    $state.pendingRun = $true
    $state.pendingProviderReservation = $MaxProviderPerRun
    Save-CatchupCampaignStateFile -StatePath $StatePath -State $state

    $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("scale", "count", "1", "--process-group", "backfill", "-a", $App, "--yes")
    if ($ScaleSettleSeconds -gt 0) { Start-Sleep -Seconds $ScaleSettleSeconds }
    $machines = @(Get-FlyMachines -FlyExe $FlyExe -App $App)
    if ($machines.Count -lt 1) {
      $haltReason = "scale_up_failed"
      break
    }
    $machineId = $machines[0].id
    $started = Get-Date
    $deadline = $started.AddMinutes($MaxWaitMinutes)
    $logsTail = ""
    $outcomeKnown = $false

    while ((Get-Date) -lt $deadline) {
      if ($PollSeconds -gt 0) { Start-Sleep -Seconds $PollSeconds } else { break }
      $list = Get-FlyMachines -FlyExe $FlyExe -App $App
      $logsTail = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("logs", "-a", $App, "--no-tail")
      if ($logsTail -match "$machineId.*catch_up_partial_stop" `
        -or $logsTail -match "$machineId.*rollout_complete" `
        -or $logsTail -match "$machineId.*catch_up_stop") {
        if ($LogSettleSeconds -gt 0) { Start-Sleep -Seconds $LogSettleSeconds }
        $outcomeKnown = $true
        break
      }
      if ($list.Count -eq 0 -and $logsTail -match "$machineId.*Main child exited") {
        $outcomeKnown = $true
        break
      }
    }

    if (-not $outcomeKnown -and $MaxWaitMinutes -le 0) {
      $logsTail = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("logs", "-a", $App, "--no-tail")
      if ($logsTail -match "$machineId.*catch_up_partial_stop" `
        -or $logsTail -match "$machineId.*rollout_complete" `
        -or $logsTail -match "$machineId.*catch_up_stop" `
        -or $logsTail -match "$machineId.*Main child exited") {
        $outcomeKnown = $true
      }
    }

    $events = Get-LatestRunEvents -MachineId $machineId
    $terminal = $events | Where-Object { $_.event -in @('catch_up_partial_stop','rollout_complete','catch_up_stop') } | Select-Object -Last 1
    $queueState = $events | Where-Object { $_.event -eq 'catch_up_queue_state' } | Select-Object -Last 1

    $exitCode = $null
    if ($logsTail -match "$machineId.*exited normally with code: (\d+)") {
      $exitCode = [int]$Matches[1]
    } elseif ($logsTail -match "$machineId.*historical backfill failed") {
      $exitCode = 1
    }

    $runProvider = Get-ProviderTotal $terminal.provider
    $providerReliable = $false
    if ($null -ne $runProvider -and $runProvider -gt 0) {
      $providerReliable = $true
    }

    if (-not $outcomeKnown -and $null -eq $exitCode) {
      $haltReason = "unknown_machine_outcome"
    }

    Ensure-FlyScaleZero -FlyExe $FlyExe -App $App -SettleSeconds $ScaleZeroSettleSeconds

    $reserved = [int]$state.pendingProviderReservation
    if ($reserved -lt 1) { $reserved = $MaxProviderPerRun }
    $state.pendingRun = $false
    $state.pendingProviderReservation = 0
    $state.providerReservedUncertain = [int]$state.providerReservedUncertain - $reserved
    if ($providerReliable) {
      $state.providerUsed = [int]$state.providerUsed + [int]$runProvider
    } else {
      $state.providerReservedUncertain = [int]$state.providerReservedUncertain + $reserved
    }
    if ($queueState -and $queueState.queueAfterSymbol) {
      $state.queueAfterSymbol = [string]$queueState.queueAfterSymbol
      Ensure-FlyScaleZero -FlyExe $FlyExe -App $App -SettleSeconds $ScaleZeroSettleSeconds
      $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("secrets", "set", "-a", $App, "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL=$($state.queueAfterSymbol)")
    } elseif ($terminal -and $terminal.queueAfterSymbol) {
      $state.queueAfterSymbol = [string]$terminal.queueAfterSymbol
    }

    $resolvedAny = $false
    if ($terminal -and [int]$terminal.symbolsResolved -gt 0) { $resolvedAny = $true }
    if ($terminal -and [int]$terminal.batchesRun -gt 0) { $resolvedAny = $true }
    $fingerprint = $null
    if ($terminal -and $terminal.emptyWindowFingerprint) {
      $fingerprint = [string]$terminal.emptyWindowFingerprint
    } elseif ($terminal -and $terminal.stopReason -in @('unresolvable_queue_window','queue_cycle_exhausted') -and $terminal.unresolvedDeferred) {
      $kindParts = @()
      foreach ($p in $terminal.unresolvedDeferred.PSObject.Properties) {
        $kindParts += "$($p.Name):$($p.Value)"
      }
      $kindKey = ($kindParts | Sort-Object) -join ","
      $fingerprint = "$($state.queueAfterSymbol)|$($terminal.symbolsAttempted)|$($terminal.eligibleSymbolsRemaining)|$kindKey"
    }
    if ($resolvedAny -or -not $fingerprint) {
      $state.lastEmptyWindowFingerprint = $null
      $state.consecutiveIdenticalEmptyRuns = 0
    } elseif ($fingerprint -eq $state.lastEmptyWindowFingerprint) {
      $state.consecutiveIdenticalEmptyRuns = [int]$state.consecutiveIdenticalEmptyRuns + 1
    } else {
      $state.lastEmptyWindowFingerprint = $fingerprint
      $state.consecutiveIdenticalEmptyRuns = 1
    }

    Save-CatchupCampaignStateFile -StatePath $StatePath -State $state

    $record = @{
      run = $run
      machineId = $machineId
      exitCode = $exitCode
      runProvider = $runProvider
      providerReliable = $providerReliable
      providerBudget = [int]$state.providerUsed + [int]$state.providerReservedUncertain
      terminal = $terminal
      emptyWindowFingerprint = $fingerprint
      consecutiveIdenticalEmptyRuns = [int]$state.consecutiveIdenticalEmptyRuns
    }
    Add-Content -Path $LogOut -Value ($record | ConvertTo-Json -Compress -Depth 8)

    if ($haltReason -eq "unknown_machine_outcome") {
      throw "machine $machineId outcome unknown after $MaxWaitMinutes minutes"
    }
    if ($null -ne $exitCode -and $exitCode -ne 0) {
      $haltReason = "worker_exit_$exitCode"
      break
    }
    if ($terminal -and $terminal.event -eq 'rollout_complete') { $haltReason = "queue_exhausted"; break }
    if ($terminal -and $terminal.eligibleSymbolsRemaining -eq 0) { $haltReason = "queue_exhausted"; break }
    if ([int]$state.consecutiveIdenticalEmptyRuns -ge $StuckEmptyRunLimit) {
      $haltReason = "stuck_queue_cursor"
      break
    }
    if ($terminal -and $terminal.stopReason -eq 'queue_cycle_exhausted') {
      $haltReason = "queue_cycle_exhausted"
      break
    }
    # Soft empty window: cursor should have advanced; continue campaign unless hard provider/job stops.
    if ($terminal -and $terminal.stopReason -in @('no_progress','job_paused','provider_request_limit','provider_rate_limited','provider_transient','provider_entitlement_failure','provider_invalid_response')) {
      $haltReason = $terminal.stopReason
      break
    }
  }
}
catch {
  $runError = $_
}
finally {
  if ($ownsCampaign) {
    try {
      Ensure-FlyScaleZero -FlyExe $FlyExe -App $App -SettleSeconds $ScaleZeroSettleSeconds
    } catch {
      $cleanupFailed = $true
      $cleanupError = "scale-down cleanup failed: $($_.Exception.Message)"
    }
    try {
      Restore-FlyPreflightGuard -FlyExe $FlyExe -App $App
    } catch {
      $cleanupFailed = $true
      if ($cleanupError) { $cleanupError = "$cleanupError; $($_.Exception.Message)" }
      else { $cleanupError = "preflight restoration failed: $($_.Exception.Message)" }
    }
  }
  if ($ownsLock) {
    try {
      Release-CatchupLock -LockPath $LockPath -OwnerId $LockOwnerId
    } catch {
      $cleanupFailed = $true
      if ($cleanupError) { $cleanupError = "$cleanupError; $($_.Exception.Message)" }
      else { $cleanupError = "lock release failed: $($_.Exception.Message)" }
    }
  }
}

$summary = @{
  event = "campaign_summary"
  haltReason = $haltReason
  state = $state
  lastEligibleRemaining = $terminal.eligibleSymbolsRemaining
  cleanupFailed = $cleanupFailed
  cleanupError = $cleanupError
} | ConvertTo-Json -Compress -Depth 8
Add-Content -Path $LogOut -Value $summary
Write-Output $summary
if ($cleanupFailed) {
  [Console]::Error.WriteLine("CLEANUP FAILED: $cleanupError")
  exit 3
}
if ($haltReason -eq "unknown_machine_outcome") { exit 2 }
if ($haltReason -match '^worker_exit_') { exit 1 }
if ($haltReason -eq "scale_up_failed") { exit 1 }
if ($runError) { throw $runError }
