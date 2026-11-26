# Operator-only: sequential Fly historical catch-up (stdout JSONL per run)
param(
  [int]$MaxRuns = 20,
  [int]$MaxCumulativeProvider = 50000,
  [string]$App = "stocksist-historical-backfill-job",
  [string]$LogOut = ""
)
if (-not $LogOut) { $LogOut = Join-Path $PSScriptRoot "_campaign-nov26.jsonl" }

$cumulativeProvider = 0
$totals = @{
  symbolsAttempted = 0
  symbolsResolved = 0
  symbolsSkipped = 0
  rowsWritten = 0
  episodesWritten = 0
  batchesRun = 0
  jobIds = [System.Collections.Generic.HashSet[string]]::new()
}

function Get-LatestRunEvents {
  param([string]$MachineId)
  $raw = & fly logs -a $App --no-tail 2>&1 | Out-String
  $lines = $raw -split "`n" | Where-Object { $_ -match $MachineId -and $_ -match '\{.*event.*\}' }
  $events = @()
  foreach ($line in $lines) {
    if ($line -match '\{(.*)\}') {
      try {
        $json = "{" + $Matches[1] + "}"
        $obj = $json | ConvertFrom-Json
        if ($obj.event) { $events += $obj }
      } catch {}
    }
  }
  return $events
}

$haltReason = $null
for ($run = 1; $run -le $MaxRuns; $run++) {
  if ($cumulativeProvider -ge $MaxCumulativeProvider) {
    $haltReason = "campaign_provider_budget"
    break
  }

  $scale = & fly scale count 1 --process-group backfill -a $App --yes 2>&1 | Out-String
  Start-Sleep 8
  $machines = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
  if ($machines.Count -lt 1) {
    $haltReason = "scale_up_failed"
    $record = @{ run = $run; halt = $haltReason; scale = $scale } | ConvertTo-Json -Compress
    Add-Content -Path $LogOut -Value $record
    break
  }
  $machineId = $machines[0].id
  $start = Get-Date
  $deadline = $start.AddMinutes(50)
  $exited = $false
  $logsTail = ""
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 25
    $list = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
    if ($list.Count -eq 0) { $exited = $true; break }
    $logsTail = & fly logs -a $App --no-tail 2>&1 | Out-String
    if ($logsTail -match "$machineId.*catch_up_partial_stop" -or $logsTail -match "$machineId.*rollout_complete" -or $logsTail -match "$machineId.*catch_up_stop") {
      Start-Sleep 8
      $exited = $true
      break
    }
    if ($logsTail -match "$machineId.*Main child exited" -and $logsTail -match "$machineId.*(catch_up|historical backfill failed)") {
      $exited = $true
      break
    }
  }

  $events = Get-LatestRunEvents -MachineId $machineId
  $terminal = $events | Where-Object { $_.event -in @('catch_up_partial_stop','rollout_complete','catch_up_stop') } | Select-Object -Last 1
  $queueState = $events | Where-Object { $_.event -eq 'catch_up_queue_state' } | Select-Object -Last 1
  $batches = $events | Where-Object { $_.event -eq 'batch_complete' }
  $exitCode = 0
  if ($logsTail -match "$machineId.*exited normally with code: (\d+)") {
    $exitCode = [int]$Matches[1]
  } elseif ($logsTail -match "$machineId.*historical backfill failed") {
    $exitCode = 1
  }

  $runProvider = 0
  if ($terminal -and $terminal.provider) {
    $runProvider = [int]$terminal.provider.dailyRequests + [int]$terminal.provider.referenceRequests + [int]$terminal.provider.nextPages
  } elseif ($logsTail -match "$machineId.*catch_up_start") {
    $startEv = $events | Where-Object { $_.event -eq 'catch_up_start' } | Select-Object -Last 1
    if ($startEv -and $startEv.provider) {
      $runProvider = [int]$startEv.provider.dailyRequests + [int]$startEv.provider.referenceRequests + [int]$startEv.provider.nextPages
    }
  }
  if ($runProvider -eq 0 -and $exitCode -ne 0 -and $logsTail -match "$machineId.*scanned.:([0-9]+)") {
    $runProvider = [int]$Matches[1] * 2
  }
  $cumulativeProvider += $runProvider

  foreach ($b in $batches) {
    if ($b.jobId) { [void]$totals.jobIds.Add([string]$b.jobId) }
    if ($b.rowsWritten) { $totals.rowsWritten += [int]$b.rowsWritten }
    if ($b.episodesWritten) { $totals.episodesWritten += [int]$b.episodesWritten }
  }
  if ($terminal) {
    if ($null -ne $terminal.symbolsAttempted) { $totals.symbolsAttempted += [int]$terminal.symbolsAttempted }
    if ($null -ne $terminal.symbolsResolved) { $totals.symbolsResolved += [int]$terminal.symbolsResolved }
    if ($null -ne $terminal.symbolsSkipped) { $totals.symbolsSkipped += [int]$terminal.symbolsSkipped }
    if ($null -ne $terminal.batchesRun) { $totals.batchesRun += [int]$terminal.batchesRun }
  }

  $record = @{
    run = $run
    machineId = $machineId
    elapsedSec = [int](((Get-Date) - $start).TotalSeconds)
    exitCode = $exitCode
    cumulativeProvider = $cumulativeProvider
    runProvider = $runProvider
    terminal = $terminal
    batchCount = $batches.Count
    jobIds = @($batches | ForEach-Object { $_.jobId } | Where-Object { $_ })
  }
  Add-Content -Path $LogOut -Value ($record | ConvertTo-Json -Compress -Depth 8)

  if ($queueState -and $null -ne $queueState.queueOffset) {
    & fly secrets set -a $App "HISTORICAL_CATCHUP_QUEUE_OFFSET=$($queueState.queueOffset)" 2>&1 | Out-Null
  }

  & fly scale count 0 --process-group backfill -a $App --yes 2>&1 | Out-Null
  Start-Sleep 3

  if ($exitCode -ne 0) {
    $haltReason = "worker_exit_$exitCode"
    break
  }
  if ($terminal -and $terminal.event -eq 'rollout_complete') {
    $haltReason = "queue_exhausted"
    break
  }
  if ($terminal -and $terminal.eligibleSymbolsRemaining -eq 0) {
    $haltReason = "queue_exhausted"
    break
  }
  if ($terminal -and $terminal.stopReason -in @('no_progress','job_paused','provider_request_limit','unresolvable_queue_window')) {
    $haltReason = $terminal.stopReason
    break
  }
  if ($terminal -and $terminal.provider -and [int]$terminal.provider.http429 -gt 5) {
    $haltReason = "rate_limit"
    break
  }
  if ($terminal -and $terminal.provider -and [int]$terminal.provider.http403 -gt 20) {
    $haltReason = "provider_auth"
    break
  }
}

$summary = @{
  event = "campaign_summary"
  runs = $run
  haltReason = $haltReason
  cumulativeProvider = $cumulativeProvider
  totals = @{
    symbolsAttempted = $totals.symbolsAttempted
    symbolsResolved = $totals.symbolsResolved
    symbolsSkipped = $totals.symbolsSkipped
    rowsWritten = $totals.rowsWritten
    episodesWritten = $totals.episodesWritten
    batchesRun = $totals.batchesRun
    jobIds = @($totals.jobIds)
  }
  lastEligibleRemaining = $terminal.eligibleSymbolsRemaining
} | ConvertTo-Json -Compress -Depth 6
Add-Content -Path $LogOut -Value $summary
Write-Output $summary