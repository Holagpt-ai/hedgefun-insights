# Recurring historical catch-up driver (NOT activated as a schedule — run manually or from external scheduler).
param(
  [switch]$Execute,
  [string]$App = "stocksist-historical-backfill-job",
  [string]$StatePath = "",
  [string]$CampaignScript = "",
  [int]$MaxWaitMinutes = 52
)
$ErrorActionPreference = "Stop"
if (-not $StatePath) { $StatePath = Join-Path $PSScriptRoot "campaign-state.nov26.json" }
if (-not $CampaignScript) { $CampaignScript = Join-Path $PSScriptRoot "run-fly-catchup-campaign.ps1" }
$lockPath = Join-Path $PSScriptRoot ".historical-catchup.lock"

$plan = @{}
try {
  if (Test-Path $lockPath) {
    throw "another historical catch-up invocation holds $lockPath"
  }
  New-Item -ItemType File -Path $lockPath -Force | Out-Null

  $machines = @(& fly machines list -a $App --json 2>&1 | ConvertFrom-Json)
  if ($machines.Count -gt 0) {
    throw "refusing to start: $App still has $($machines.Count) machine(s)"
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
  Push-Location $repoRoot
  $targetJson = & npx vite-node --config vitest.config.ts scripts/historical/resolve-catchup-target.ts 2>&1 | Select-Object -Last 1
  Pop-Location
  $target = ($targetJson | ConvertFrom-Json).targetSession
  $plan.targetSession = $target

  if (-not $Execute) {
    $plan.mode = "dry_run"
    Write-Output ($plan | ConvertTo-Json -Compress)
    exit 0
  }

  & fly secrets set -a $App "HISTORICAL_CATCHUP_TARGET_SESSION=$target" 2>&1 | Out-Null
  & powershell -NoProfile -ExecutionPolicy Bypass -File $CampaignScript `
    -StatePath $StatePath -MaxRuns 1 -SingleRun -MaxWaitMinutes $MaxWaitMinutes
}
finally {
  if (Test-Path $lockPath) { Remove-Item -Force $lockPath }
}