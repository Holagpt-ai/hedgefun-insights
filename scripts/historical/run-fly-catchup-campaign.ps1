# Operator: sequential Fly historical catch-up with persisted campaign budget.
param(
  [int]$MaxRuns = 20,
  [int]$MaxCumulativeProvider = 50000,
  [string]$App = "stocksist-historical-backfill-job",
  [string]$LogOut = "",
  [string]$StatePath = "",
  [switch]$SingleRun,
  [int]$MaxWaitMinutes = 52
)
$ErrorActionPreference = "Stop"
if (-not $LogOut) { $LogOut = Join-Path $PSScriptRoot "_campaign-nov26.jsonl" }
if (-not $StatePath) { $StatePath = Join-Path $PSScriptRoot "campaign-state.nov26.json" }

function Get-ProviderTotal($Provider) {
  if (-not $Provider) { return $null }
  return [int]$Provider.dailyRequests + [int]$Provider.referenceRequests + [int]$Provider.nextPages
}

function Assert-ZeroMachines {
  $list = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
  if ($list.Count -gt 0) { throw "expected zero machines on $App" }
}

function Ensure-ScaleZero {
  $scaled = & fly scale count 0 --process-group backfill -a $App --yes 2>&1 | Out-String
  Start-Sleep 4
  $list = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
  if ($list.Count -gt 0) { throw "scale to zero failed: $($list.Count) machine(s) remain" }
  return $scaled
}

function Restore-PreflightGuard {
  & fly secrets set -a $App HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1 2>&1 | Out-Null
}

function Get-LatestRunEvents([string]$MachineId) {
  $raw = & fly logs -a $App --no-tail 2>&1 | Out-String
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

if (-not (Test-Path $StatePath)) { throw "missing campaign state: $StatePath" }
$state = Get-Content $StatePath -Raw | ConvertFrom-Json
$runStart = [int]$state.executionsCompleted + 1
$maxRuns = [Math]::Min($MaxRuns, [int]$state.maxExecutions - [int]$state.executionsCompleted)
if ($SingleRun) { $maxRuns = 1 }
$providerBudget = [int]$state.providerUsed + [int]$state.providerReservedUncertain
if ([int]$state.executionsCompleted -ge [int]$state.maxExecutions) { throw "execution budget exhausted" }
if ($providerBudget -ge [int]$state.maxProviderRequests) { throw "provider budget exhausted ($providerBudget)" }

$haltReason = $null
$terminal = $null
$lockPath = Join-Path $PSScriptRoot ".historical-catchup.lock"

try {
  if (Test-Path $lockPath) { throw "campaign lock exists: $lockPath" }
  New-Item -ItemType File -Path $lockPath -Force | Out-Null
  Assert-ZeroMachines

  if ($state.queueAfterSymbol) {
    & fly secrets set -a $App "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL=$($state.queueAfterSymbol)" 2>&1 | Out-Null
  }
  & fly secrets unset -a $App HISTORICAL_CATCHUP_PREFLIGHT_ONLY 2>&1 | Out-Null

  for ($run = $runStart; $run -lt ($runStart + $maxRuns); $run++) {
    $providerBudget = [int]$state.providerUsed + [int]$state.providerReservedUncertain
    if ($providerBudget -ge $MaxCumulativeProvider -or $providerBudget -ge [int]$state.maxProviderRequests) {
      $haltReason = "campaign_provider_budget"
      break
    }

    Assert-ZeroMachines
    $null = & fly scale count 1 --process-group backfill -a $App --yes 2>&1
    Start-Sleep 8
    $machines = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
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
      Start-Sleep 25
      $list = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
      $logsTail = & fly logs -a $App --no-tail 2>&1 | Out-String
      if ($logsTail -match "$machineId.*catch_up_partial_stop" `
        -or $logsTail -match "$machineId.*rollout_complete" `
        -or $logsTail -match "$machineId.*catch_up_stop") {
        Start-Sleep 8
        $outcomeKnown = $true
        break
      }
      if ($list.Count -eq 0 -and $logsTail -match "$machineId.*Main child exited") {
        $outcomeKnown = $true
        break
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
    } elseif ($exitCode -eq 1 -and ($logsTail -match "$machineId.*batch_skipped.*scanned.:([0-9]+)")) {
      $runProvider = [int]$Matches[1] * 2
      $providerReliable = $false
    }

    if (-not $outcomeKnown -and $null -eq $exitCode) {
      $haltReason = "unknown_machine_outcome"
      Ensure-ScaleZero | Out-Null
      throw "machine $machineId outcome unknown after $MaxWaitMinutes minutes"
    }

    Ensure-ScaleZero | Out-Null

    $state.executionsCompleted = [int]$state.executionsCompleted + 1
    if ($providerReliable) {
      $state.providerUsed = [int]$state.providerUsed + [int]$runProvider
    } else {
      $reserve = if ($null -ne $runProvider -and $runProvider -gt 0) { [int]$runProvider } else { 1 }
      $state.providerReservedUncertain = [int]$state.providerReservedUncertain + $reserve
    }
    if ($queueState -and $queueState.queueAfterSymbol) {
      $state.queueAfterSymbol = [string]$queueState.queueAfterSymbol
      Ensure-ScaleZero | Out-Null
      & fly secrets set -a $App "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL=$($state.queueAfterSymbol)" 2>&1 | Out-Null
    }
    $state | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding utf8

    $record = @{
      run = $run
      machineId = $machineId
      exitCode = $exitCode
      runProvider = $runProvider
      providerReliable = $providerReliable
      providerBudget = [int]$state.providerUsed + [int]$state.providerReservedUncertain
      terminal = $terminal
    }
    Add-Content -Path $LogOut -Value ($record | ConvertTo-Json -Compress -Depth 8)

    if ($null -ne $exitCode -and $exitCode -ne 0) {
      $haltReason = "worker_exit_$exitCode"
      break
    }
    if ($terminal -and $terminal.event -eq 'rollout_complete') { $haltReason = "queue_exhausted"; break }
    if ($terminal -and $terminal.eligibleSymbolsRemaining -eq 0) { $haltReason = "queue_exhausted"; break }
    if ($terminal -and $terminal.stopReason -in @('no_progress','job_paused','provider_request_limit','unresolvable_queue_window','provider_rate_limited','provider_transient','provider_entitlement_failure')) {
      $haltReason = $terminal.stopReason
      break
    }
  }
}
finally {
  if (Test-Path $lockPath) { Remove-Item -Force $lockPath }
  try { Ensure-ScaleZero | Out-Null } catch { }
  try { Restore-PreflightGuard } catch { }
}

$summary = @{
  event = "campaign_summary"
  haltReason = $haltReason
  state = $state
  lastEligibleRemaining = $terminal.eligibleSymbolsRemaining
} | ConvertTo-Json -Compress -Depth 8
Add-Content -Path $LogOut -Value $summary
Write-Output $summary
if ($haltReason -eq "unknown_machine_outcome") { exit 2 }
if ($haltReason -match '^worker_exit_') { exit 1 }