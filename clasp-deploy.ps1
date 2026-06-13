# =============================================================================
# clasp-deploy.ps1  —  push the backend and redeploy the SAME web app.
#
# Run this after editing any backend\*.gs.  Your /exec URL stays identical, so
# there is NOTHING to re-paste and NO "New version" to click.
#
#   .\clasp-deploy.ps1
#
# (Run .\clasp-setup.ps1 once first.)
# =============================================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (-not (Test-Path (Join-Path $root '.clasp.json'))) {
  Write-Host "No .clasp.json yet. Run this once:  .\clasp-setup.ps1 -ScriptId <your id>" -ForegroundColor Yellow
  exit 1
}

# Your web app's deployment ID = the 'AKfycb...' segment of your /exec URL.
$DEPLOYMENT_ID = 'AKfycbzOmpiOP12bcjt43mBOLg8byafrWIJ9rNkvduwxSJIj3BmBmCZIEr3xgzEiv9pwLenR'

Write-Host "1/2  Pushing backend\*.gs to Apps Script..." -ForegroundColor Cyan
clasp push -f
if ($LASTEXITCODE -ne 0) { Write-Host "push failed." -ForegroundColor Red; exit 1 }

Write-Host "2/2  Redeploying the web app (same /exec URL)..." -ForegroundColor Cyan
clasp deploy -i $DEPLOYMENT_ID -d ("QRAMS " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
if ($LASTEXITCODE -ne 0) { Write-Host "deploy failed." -ForegroundColor Red; exit 1 }

Write-Host "Done - backend is live. No re-paste, no New version." -ForegroundColor Green
Write-Host "Tip: if you changed Config.gs SHEET columns, also run setupDatabase() once in the editor." -ForegroundColor DarkGray
