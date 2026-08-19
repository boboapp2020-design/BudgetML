# =====================================================================
# merge-2514-to-2513.ps1  (ASCII-only)
# Merge dept 2514 (kaykiaw-oy) into 2513 on Supabase.
#  - budgets/cct_master: department_id d2514 -> d2513
#  - dept_status/departments: delete d2514 (d2513 already exists)
#  Totals unchanged, no unit lost.
# Run:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\Users\surasakna\Desktop\Project AI\Budget App\supabase\merge-2514-to-2513.ps1"
# =====================================================================
$ErrorActionPreference = 'Stop'
$url = 'https://fdicsryxzyxuoxacxilz.supabase.co'
$key = 'sb_publishable_1iBfWSMLMRf-Be1E96zS9w_f5tf1rVT'
$Hp = @{ apikey=$key; Authorization=("Bearer "+$key); 'Content-Type'='application/json'; Prefer='return=minimal' }
$Hd = @{ apikey=$key; Authorization=("Bearer "+$key); Prefer='return=minimal' }
$RH = @{ apikey=$key; Authorization=("Bearer "+$key) }

Write-Host "== move budgets/cct d2514 -> d2513 =="
Invoke-RestMethod -Method Patch -Uri ($url+'/rest/v1/budgets?department_id=eq.d2514')    -Headers $Hp -Body ([Text.Encoding]::UTF8.GetBytes('{"department_id":"d2513"}')) | Out-Null
Invoke-RestMethod -Method Patch -Uri ($url+'/rest/v1/cct_master?department_id=eq.d2514') -Headers $Hp -Body ([Text.Encoding]::UTF8.GetBytes('{"department_id":"d2513"}')) | Out-Null
Write-Host "== delete dept_status + departments d2514 =="
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/dept_status?department_id=eq.d2514') -Headers $Hd | Out-Null
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/departments?id=eq.d2514')            -Headers $Hd | Out-Null

Start-Sleep -Milliseconds 500
$b = @(Invoke-RestMethod -Uri ($url+'/rest/v1/budgets?select=cct&department_id=eq.d2514&limit=5') -Headers $RH).Count
$d = @(Invoke-RestMethod -Uri ($url+'/rest/v1/departments?select=id&id=eq.d2514') -Headers $RH).Count
Write-Host ("VERIFY d2514 leftover -> budgets:" + $b + " departments:" + $d + "  (should be 0 and 0)")
Write-Host "DONE - reload web app (Ctrl+F5)"
