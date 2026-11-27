# Execution-level orchestration tests for PR #276 lock, budget, and cleanup.
$ErrorActionPreference = "Stop"
Remove-Item Env:CATCHUP_TEST_DIR -ErrorAction SilentlyContinue
$here = $PSScriptRoot
$opsRoot = Split-Path -Parent $here
. (Join-Path $opsRoot "catchup-ops.ps1")

$failures = @()
function Assert-True($Condition, $Message) {
  if (-not $Condition) { $script:failures += $Message }
}

$campaign = Join-Path $opsRoot "run-fly-catchup-campaign.ps1"
$recurring = Join-Path $opsRoot "Invoke-RecurringHistoricalCatchup.ps1"
$mockFly = Join-Path $here "mock-fly.ps1"

function New-TestDir {
  $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("catchup-ops-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $dir | Out-Null
  Set-Content -Path (Join-Path $dir "machines.json") -Value "[]" -Encoding ascii
  Set-Content -Path (Join-Path $dir "secret-names.txt") -Value "HISTORICAL_CATCHUP_PREFLIGHT_ONLY" -Encoding ascii
  return $dir
}

function New-CampaignState($Path, $Used = 3010, $Reserved = 400, $Completed = 3, $QueueAfter = $null) {
  $queueJson = if ($QueueAfter) { "`"$QueueAfter`"" } else { "null" }
  $json = @"
{
  "campaignId": "nov26-historical-2026-11-25",
  "executionsCompleted": $Completed,
  "maxExecutions": 20,
  "providerUsed": $Used,
  "providerReservedUncertain": $Reserved,
  "maxProviderRequests": 50000,
  "queueAfterSymbol": $queueJson,
  "pendingRun": false,
  "pendingProviderReservation": 0,
  "lastEmptyWindowFingerprint": null,
  "consecutiveIdenticalEmptyRuns": 0
}
"@
  Set-Content -Path $Path -Value $json -Encoding utf8
}

function Invoke-Campaign($Dir, $ExtraArgs = @()) {
  $env:CATCHUP_TEST_DIR = $Dir
  $state = Join-Path $Dir "state.json"
  $lock = Join-Path $Dir "catch.lock"
  $log = Join-Path $Dir "out.jsonl"
  $all = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $campaign,
    "-StatePath", $state,
    "-LockPath", $lock,
    "-LogOut", $log,
    "-FlyExe", $mockFly,
    "-App", "test-app",
    "-SingleRun",
    "-MaxWaitMinutes", "0",
    "-ScaleSettleSeconds", "0",
    "-PollSeconds", "0",
    "-LogSettleSeconds", "0",
    "-ScaleZeroSettleSeconds", "0"
  ) + $ExtraArgs
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & powershell.exe @all 2>&1 | Out-String
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prevEap
  }
  return @{
    ExitCode = $code
    Output = $output
    State = (Get-Content $state -Raw | ConvertFrom-Json)
    Calls = (Get-Content (Join-Path $Dir "fly-calls.log") -ErrorAction SilentlyContinue)
    LockExists = (Test-Path (Join-Path $Dir "catch.lock"))
  }
}

# 1. Rejected campaign must not steal another process's lock or touch Fly.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
$foreign = '{"ownerId":"foreign-owner","pid":1,"createdAt":"2026-11-26T00:00:00Z"}'
Set-Content -Path (Join-Path $dir "catch.lock") -Value $foreign -Encoding ascii
$result = Invoke-Campaign $dir
Assert-True ($result.ExitCode -ne 0) "rejected campaign should fail"
Assert-True ($result.LockExists) "foreign lock must remain"
$lockOwner = Get-CatchupLockOwner -LockPath (Join-Path $dir "catch.lock")
Assert-True ($lockOwner -eq "foreign-owner") "foreign lock owner must be unchanged"
Assert-True (-not $result.Calls) "rejected campaign must not invoke fly"
Assert-True ($result.State.executionsCompleted -eq 3) "rejected campaign must not mutate budget"
Assert-True ($result.State.providerUsed -eq 3010) "consumed used budget must stay 3010"
Assert-True ($result.State.providerReservedUncertain -eq 400) "consumed reserved budget must stay 400"

# 2. Persist full per-run reservation before scale-up; keep it when launch fails.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
New-Item -ItemType File -Path (Join-Path $dir "fail-scale-up") | Out-Null
$result = Invoke-Campaign $dir
Assert-True ($result.State.executionsCompleted -eq 4) "execution count persisted before launch"
Assert-True ($result.State.providerReservedUncertain -ge 2900) "full per-run exposure reserved (2500), not 1"
Assert-True ($result.State.providerUsed -eq 3010) "measured used budget preserved"
$calls = @($result.Calls)
Assert-True (($calls | Where-Object { $_ -match "scale count 1" }).Count -ge 1) "scale-up attempted after reservation"

# 3. Remaining budget below per-run allowance blocks launch.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json") -Used 48000 -Reserved 400
$result = Invoke-Campaign $dir
Assert-True ($result.ExitCode -ne 0) "insufficient remaining budget should fail"
Assert-True ($result.State.executionsCompleted -eq 3) "must not consume an execution when run cannot be authorized"
Assert-True ($result.State.providerUsed -eq 48000) "must not change used when blocked"
$calls = @($result.Calls)
# cleanup still runs because this process owns the lock after passing budget? Wait - budget check is AFTER lock and zero machines.
# So fly IS invoked for machines list / cleanup. Must NOT scale count 1.
Assert-True (($calls | Where-Object { $_ -match "scale count 1" }).Count -eq 0) "must not launch when remaining < per-run allowance"

# 4. Cleanup failure is reported (not swallowed) after a successful lock owner run.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
New-Item -ItemType File -Path (Join-Path $dir "success-logs") | Out-Null
New-Item -ItemType File -Path (Join-Path $dir "fail-scale-zero") | Out-Null
$result = Invoke-Campaign $dir
Assert-True ($result.ExitCode -eq 3) "cleanup failure should exit 3"
Assert-True ($result.Output -match "cleanup" -or $result.Output -match "scale-down" -or $result.Output -match "failed with exit") "cleanup failure must be reported"

# 5. Nested recurring + campaign share one lock; inner rejection path is unused.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
New-Item -ItemType File -Path (Join-Path $dir "success-logs") | Out-Null
$env:CATCHUP_TEST_DIR = $dir
$lock = Join-Path $dir "catch.lock"
$state = Join-Path $dir "state.json"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $recurring `
  -Execute -SkipTargetResolve -TargetSession "2026-11-25" `
  -StatePath $state -LockPath $lock -CampaignScript $campaign `
  -FlyExe $mockFly -App "test-app" -MaxWaitMinutes 0 `
  -ScaleSettleSeconds 0 -PollSeconds 0 -LogSettleSeconds 0 -ScaleZeroSettleSeconds 0
$nestedExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
Assert-True ($nestedExit -eq 0) "nested recurring execute should succeed (exit $nestedExit)"
Assert-True (-not (Test-Path $lock)) "recurring owner must release lock"
$calls = Get-Content (Join-Path $dir "fly-calls.log")
Assert-True (($calls | Where-Object { $_ -match "scale count 1" }).Count -ge 1) "nested campaign must run"
$after = Get-Content $state -Raw | ConvertFrom-Json
Assert-True ($after.executionsCompleted -eq 4) "nested run counts one execution"
Assert-True ($after.providerUsed -eq 3025) "reliable provider usage reconciled (3010+15)"
Assert-True ($after.providerReservedUncertain -eq 400) "reservation released after reliable measurement"

# 6. Recurring must not remove a foreign lock.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
$lock = Join-Path $dir "catch.lock"
Set-Content -Path $lock -Value '{"ownerId":"foreign-owner","pid":9,"createdAt":"2026-11-26T00:00:00Z"}' -Encoding ascii
$env:CATCHUP_TEST_DIR = $dir
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $recurring `
  -SkipTargetResolve -TargetSession "2026-11-25" `
  -StatePath (Join-Path $dir "state.json") -LockPath $lock -CampaignScript $campaign `
  -FlyExe $mockFly -App "test-app"
$recurringRefuse = $LASTEXITCODE
$ErrorActionPreference = $prevEap
Assert-True ($recurringRefuse -ne 0) "recurring should refuse foreign lock"
Assert-True (Test-Path $lock) "foreign lock must survive rejected recurring"
Assert-True ((Get-CatchupLockOwner -LockPath $lock) -eq "foreign-owner") "foreign owner unchanged"
Assert-True (-not (Test-Path (Join-Path $dir "fly-calls.log"))) "rejected recurring must not invoke fly"

# 7. Identical BKH-class empty windows halt with stuck_queue_cursor (no unlimited empty burns).
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json") -Completed 16 -Used 7432 -Reserved 7500
New-Item -ItemType File -Path (Join-Path $dir "stuck-empty-logs") | Out-Null
$env:CATCHUP_TEST_DIR = $dir
$state = Join-Path $dir "state.json"
$lock = Join-Path $dir "catch.lock"
$log = Join-Path $dir "out.jsonl"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $campaign `
  -StatePath $state -LockPath $lock -LogOut $log `
  -FlyExe $mockFly -App "test-app" -MaxRuns 3 `
  -MaxWaitMinutes 0 -ScaleSettleSeconds 0 -PollSeconds 0 -LogSettleSeconds 0 -ScaleZeroSettleSeconds 0
$stuckExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
$stuckOut = Get-Content $log -Raw
$stuckState = Get-Content $state -Raw | ConvertFrom-Json
Assert-True ($stuckOut -match "stuck_queue_cursor") "identical empty windows must halt stuck_queue_cursor"
Assert-True ([int]$stuckState.consecutiveIdenticalEmptyRuns -ge 2) "stuck counter must reach halt threshold"
Assert-True ($stuckState.queueAfterSymbol -eq "BKH") "cursor preserved at BKH for resume after fix deploy"
$stuckCalls = @(Get-Content (Join-Path $dir "fly-calls.log"))
Assert-True (($stuckCalls | Where-Object { $_ -match "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL=" }).Count -ge 2) "queue secret refreshed per run"

# 8. Diagnostic catch_up_stop must not win over authoritative catch_up_partial_stop.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
New-Item -ItemType File -Path (Join-Path $dir "diagnostic-then-final-logs") | Out-Null
$result = Invoke-Campaign $dir
Assert-True ($result.ExitCode -eq 0) "authoritative terminal after diagnostic stop should succeed"
Assert-True ($result.State.queueAfterSymbol -eq "CUR1") "cursor from catch_up_queue_state not diagnostic stop"
Assert-True ($result.State.providerUsed -eq 3025) "provider totals from authoritative terminal only"

# 9. Two-phase logs: continue polling past intermediate catch_up_stop until final summary.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
New-Item -ItemType File -Path (Join-Path $dir "two-phase-logs") | Out-Null
$state = Join-Path $dir "state.json"
$lock = Join-Path $dir "catch.lock"
$log = Join-Path $dir "out.jsonl"
$env:CATCHUP_TEST_DIR = $dir
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $campaign `
  -StatePath $state -LockPath $lock -LogOut $log `
  -FlyExe $mockFly -App "test-app" -SingleRun `
  -MaxWaitMinutes 1 -ScaleSettleSeconds 0 -PollSeconds 1 -LogSettleSeconds 0 -ScaleZeroSettleSeconds 0
$twoPhaseExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
$twoPhaseState = Get-Content $state -Raw | ConvertFrom-Json
Assert-True ($twoPhaseExit -eq 0) "two-phase worker completion should succeed (exit $twoPhaseExit)"
Assert-True ($twoPhaseState.queueAfterSymbol -eq "FAIL1") "final queue cursor applied after intermediate stop"

# 10. Campaign reloads on-disk state after lock (not a stale pre-lock snapshot).
$dir = New-TestDir
$statePath = Join-Path $dir "state.json"
New-CampaignState $statePath -Used 3010 -Completed 3
New-CampaignState $statePath -Used 8000 -Completed 10
New-Item -ItemType File -Path (Join-Path $dir "success-logs") | Out-Null
$result = Invoke-Campaign $dir
Assert-True ($result.State.executionsCompleted -eq 11) "must advance from reloaded execution count 10"
Assert-True ($result.State.providerUsed -eq 8015) "must reconcile provider from reloaded baseline 8000"
$campaignText = Get-Content $campaign -Raw
Assert-True ($campaignText -match 'Import-CatchupCampaignStateWithDefaults') "campaign imports authoritative state helper"
Assert-True ($campaignText -match 'Acquire-CatchupLock[\s\S]{0,800}Import-CatchupCampaignStateWithDefaults') "state reload follows lock acquisition"

# 11. Incomplete terminal evidence keeps conservative reservation and fails reconciliation.
$dir = New-TestDir
New-CampaignState (Join-Path $dir "state.json")
New-Item -ItemType File -Path (Join-Path $dir "unknown-logs") | Out-Null
$env:CATCHUP_TEST_DIR = $dir
$state = Join-Path $dir "state.json"
$lock = Join-Path $dir "catch.lock"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $campaign `
  -StatePath $state -LockPath $lock -LogOut (Join-Path $dir "out.jsonl") `
  -FlyExe $mockFly -App "test-app" -SingleRun `
  -MaxWaitMinutes 0 -ScaleSettleSeconds 0 -PollSeconds 0 -LogSettleSeconds 0 -ScaleZeroSettleSeconds 0
$unknownExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
$unknownState = Get-Content $state -Raw | ConvertFrom-Json
Assert-True ($unknownExit -eq 2) "unknown/incomplete machine outcome must exit 2 (got $unknownExit)"
Assert-True ($unknownState.providerReservedUncertain -ge 2900) "conservative provider reservation preserved when final evidence missing"

if ($failures.Count -gt 0) {
  Write-Output ("FAILED:`n - " + ($failures -join "`n - "))
  exit 1
}
Write-Output "PASS: catchup orchestration safeguards"
exit 0
