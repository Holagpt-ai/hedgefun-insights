# Recurring historical catch-up driver (NOT activated as a schedule — run manually or from external scheduler).
# Single lock owner for this process. Nested campaign uses -AssumeLockHeld and must not release this lock.
param(
  [switch]$Execute,
  [string]$App = "stocksist-historical-backfill-job",
  [string]$StatePath = "",
  [string]$CampaignScript = "",
  [string]$LockPath = "",
  [string]$LockOwnerId = "",
  [int]$MaxWaitMinutes = 52,
  [string]$FlyExe = "fly",
  [string]$TargetSession = "",
  [switch]$SkipTargetResolve,
  [int]$ScaleSettleSeconds = 8,
  [int]$PollSeconds = 25,
  [int]$LogSettleSeconds = 8,
  [int]$ScaleZeroSettleSeconds = 4
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "catchup-ops.ps1")

if (-not $StatePath) { $StatePath = Join-Path $PSScriptRoot "campaign-state.nov26.json" }
if (-not $CampaignScript) { $CampaignScript = Join-Path $PSScriptRoot "run-fly-catchup-campaign.ps1" }
if (-not $LockPath) { $LockPath = Join-Path $PSScriptRoot ".historical-catchup.lock" }
if (-not $LockOwnerId) { $LockOwnerId = [guid]::NewGuid().ToString("N") }

$ownsLock = $false
$plan = @{}
try {
  if (-not (Acquire-CatchupLock -LockPath $LockPath -OwnerId $LockOwnerId)) {
    throw "another historical catch-up invocation holds $LockPath"
  }
  $ownsLock = $true

  Assert-ZeroFlyMachines -FlyExe $FlyExe -App $App

  if ($SkipTargetResolve) {
    if (-not $TargetSession) { $TargetSession = "2026-11-25" }
    $target = $TargetSession
  } else {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
    Push-Location $repoRoot
    try {
      $targetJson = & npx vite-node --config vitest.config.ts scripts/historical/resolve-catchup-target.ts 2>&1 | Select-Object -Last 1
    } finally {
      Pop-Location
    }
    $target = ($targetJson | ConvertFrom-Json).targetSession
  }
  $plan.targetSession = $target

  if (-not $Execute) {
    $plan.mode = "dry_run"
    Write-Output ($plan | ConvertTo-Json -Compress)
    exit 0
  }

  $null = Invoke-FlyNative -FlyExe $FlyExe -FlyArgs @("secrets", "set", "-a", $App, "HISTORICAL_CATCHUP_TARGET_SESSION=$target")
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $CampaignScript `
    -StatePath $StatePath `
    -LockPath $LockPath `
    -LockOwnerId $LockOwnerId `
    -AssumeLockHeld `
    -MaxRuns 1 `
    -SingleRun `
    -MaxWaitMinutes $MaxWaitMinutes `
    -FlyExe $FlyExe `
    -App $App `
    -ScaleSettleSeconds $ScaleSettleSeconds `
    -PollSeconds $PollSeconds `
    -LogSettleSeconds $LogSettleSeconds `
    -ScaleZeroSettleSeconds $ScaleZeroSettleSeconds
  $campaignExit = $LASTEXITCODE
  if ($null -eq $campaignExit) { $campaignExit = 0 }
  if ($campaignExit -ne 0) {
    throw "campaign script exited $campaignExit"
  }
}
finally {
  if ($ownsLock) {
    Release-CatchupLock -LockPath $LockPath -OwnerId $LockOwnerId
  }
}
