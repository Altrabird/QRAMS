# =============================================================================
# clasp-setup.ps1  —  ONE-TIME setup so you can deploy the backend from here.
#
# Before running this, do these two things once:
#   1) Turn ON the Apps Script API:  https://script.google.com/home/usersettings
#   2) Sign in to clasp:             clasp login        (opens your browser)
#
# Then run THIS, pasting your Script ID (Apps Script -> Project Settings (gear)
# -> "Script ID").  NOTE: the Script ID is NOT the AKfycb... in your /exec URL.
#
#   .\clasp-setup.ps1 -ScriptId 1aBcD....your_long_script_id
# =============================================================================
param([Parameter(Mandatory = $true)][string]$ScriptId)

$root = $PSScriptRoot
$cfg = [ordered]@{ scriptId = $ScriptId.Trim(); rootDir = 'backend' }
($cfg | ConvertTo-Json) | Set-Content -Path (Join-Path $root '.clasp.json') -Encoding utf8

Write-Host ".clasp.json written (pushes from the backend\ folder)." -ForegroundColor Green
Write-Host "From now on, after editing any backend\*.gs, just run:  .\clasp-deploy.ps1" -ForegroundColor Cyan
