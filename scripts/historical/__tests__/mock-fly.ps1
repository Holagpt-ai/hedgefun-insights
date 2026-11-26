# Test double for flyctl. Records argv and returns fixture JSON from CATCHUP_TEST_DIR.
$ErrorActionPreference = "Stop"
if (-not $env:CATCHUP_TEST_DIR) { throw "CATCHUP_TEST_DIR is required" }
$dir = $env:CATCHUP_TEST_DIR
$callsPath = Join-Path $dir "fly-calls.log"
$machinesPath = Join-Path $dir "machines.json"
$secretNamesPath = Join-Path $dir "secret-names.txt"
$failScaleZero = Join-Path $dir "fail-scale-zero"
$failScaleUp = Join-Path $dir "fail-scale-up"
$failPreflight = Join-Path $dir "fail-preflight"
$successLogs = Join-Path $dir "success-logs"
$unknownLogs = Join-Path $dir "unknown-logs"

if (-not (Test-Path $machinesPath)) { Set-Content -Path $machinesPath -Value "[]" -Encoding ascii }
if (-not (Test-Path $secretNamesPath)) {
  Set-Content -Path $secretNamesPath -Value "HISTORICAL_CATCHUP_PREFLIGHT_ONLY" -Encoding ascii
}

function Get-SecretNames {
  if (-not (Test-Path $secretNamesPath)) { return @() }
  return @(Get-Content -LiteralPath $secretNamesPath | Where-Object { $_.Trim() -ne "" })
}

function Write-SecretNames([string[]]$Names) {
  if (-not $Names -or $Names.Count -eq 0) {
    Set-Content -Path $secretNamesPath -Value "" -Encoding ascii
    return
  }
  Set-Content -Path $secretNamesPath -Value ($Names -join "`n") -Encoding ascii
}

function Write-SecretsJson {
  $names = Get-SecretNames
  $items = @($names | ForEach-Object { '{"Name":"' + $_ + '"}' })
  if ($items.Count -eq 0) {
    Write-Output "[]"
  } else {
    Write-Output ("[" + ($items -join ",") + "]")
  }
}

$joinedArgs = ($args | ForEach-Object { "$_" }) -join " "
Add-Content -Path $callsPath -Value $joinedArgs

function Read-JsonFile([string]$Path) {
  return Get-Content -LiteralPath $Path -Raw
}

if ($joinedArgs -match '^machines list\b') {
  Write-Output (Read-JsonFile $machinesPath)
  exit 0
}

if ($joinedArgs -match '^scale count 1\b') {
  if (Test-Path $failScaleUp) {
    Write-Output "scale up failed"
    exit 1
  }
  Set-Content -Path $machinesPath -Value '[{"id":"m1"}]' -Encoding ascii
  Write-Output "scaled 1"
  exit 0
}

if ($joinedArgs -match '^scale count 0\b') {
  if (Test-Path $failScaleZero) {
    Write-Output "scale zero failed"
    exit 1
  }
  Set-Content -Path $machinesPath -Value "[]" -Encoding ascii
  Write-Output "scaled 0"
  exit 0
}

if ($args.Count -ge 2 -and $args[0] -eq "secrets" -and $args[1] -eq "list") {
  if (Test-Path $failPreflight) {
    Write-SecretNames @()
  }
  Write-SecretsJson
  exit 0
}

if ($args.Count -ge 2 -and $args[0] -eq "secrets" -and $args[1] -eq "set") {
  $joined = $args -join " "
  $names = @(Get-SecretNames)
  if ($joined -match "HISTORICAL_CATCHUP_PREFLIGHT_ONLY=") {
    if ($names -notcontains "HISTORICAL_CATCHUP_PREFLIGHT_ONLY") { $names += "HISTORICAL_CATCHUP_PREFLIGHT_ONLY" }
  }
  if ($joined -match "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL=") {
    if ($names -notcontains "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL") { $names += "HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL" }
  }
  if ($joined -match "HISTORICAL_CATCHUP_TARGET_SESSION=") {
    if ($names -notcontains "HISTORICAL_CATCHUP_TARGET_SESSION") { $names += "HISTORICAL_CATCHUP_TARGET_SESSION" }
  }
  Write-SecretNames $names
  Write-Output "secret set"
  exit 0
}

if ($args.Count -ge 2 -and $args[0] -eq "secrets" -and $args[1] -eq "unset") {
  $names = @((Get-SecretNames) | Where-Object { $_ -ne "HISTORICAL_CATCHUP_PREFLIGHT_ONLY" })
  Write-SecretNames $names
  Write-Output "secret unset"
  exit 0
}

if ($args.Count -ge 1 -and $args[0] -eq "logs") {
  if (Test-Path $unknownLogs) {
    Write-Output "m1 still running"
    exit 0
  }
  if (Test-Path $successLogs) {
    Write-Output 'm1 {"event":"catch_up_partial_stop","eligibleSymbolsRemaining":4000,"provider":{"dailyRequests":10,"referenceRequests":5,"nextPages":0}}'
    Write-Output 'm1 {"event":"catch_up_queue_state","queueAfterSymbol":"ABC"}'
    Write-Output "m1 Main child exited normally with code: 0"
    exit 0
  }
  Write-Output "m1 still running"
  exit 0
}

Write-Output ("unhandled fly args: " + $joinedArgs)
exit 0
