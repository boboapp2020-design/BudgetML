# =====================================================================
# apply-2026-actuals.ps1  (ASCII-only; Thai from JSON at runtime)
# Year-2026 numbers now come from actual columns AM-AX (per user):
#  1. budgets 2026  -> actual months 1-6 + plan months 7-12  (live view = actual+forecast)
#  2. actuals 2026  -> actual months 1-6 (1,336 rows) for LANDING lock later
#  3. budget_snapshots/snapshot_rows -> ORIGINAL = full original plan 1.44T (recorded)
# Totals: actual(1-6)=909,031,720,974 · live=1,499,093,910,657 · ORIGINAL=1,444,780,372,551
# Run:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\Users\surasakna\Desktop\Project AI\Budget App\supabase\apply-2026-actuals.ps1"
# =====================================================================
$ErrorActionPreference = 'Stop'
$url = 'https://fdicsryxzyxuoxacxilz.supabase.co'
$key = 'sb_publishable_1iBfWSMLMRf-Be1E96zS9w_f5tf1rVT'
$H    = @{ apikey=$key; Authorization=("Bearer "+$key) }
$Hmin = $H + @{ Prefer='return=minimal' }

function PostRows($table, $rows) {
  if (-not $rows -or $rows.Count -eq 0) { return }
  $chunk=500; $done=0
  for($i=0;$i -lt $rows.Count;$i+=$chunk){
    $slice=@($rows[$i..([math]::Min($i+$chunk-1,$rows.Count-1))])
    $json=ConvertTo-Json -InputObject $slice -Depth 6 -Compress
    if($slice.Count -eq 1){ $json='['+$json+']' }
    $bytes=[System.Text.Encoding]::UTF8.GetBytes($json)
    Invoke-RestMethod -Method Post -Uri ($url+'/rest/v1/'+$table) -Headers ($H + @{ Prefer='return=minimal'; 'Content-Type'='application/json' }) -Body $bytes | Out-Null
    $done+=$slice.Count
  }
  Write-Host ("  "+$table+": +"+$done)
}

$bud  = Get-Content (Join-Path $PSScriptRoot 'budgets-2026-live.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$act  = Get-Content (Join-Path $PSScriptRoot 'actuals-2026.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$snap = Get-Content (Join-Path $PSScriptRoot 'snapshot-2026-original.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("budgets="+$bud.Count+" actuals="+$act.Count+" snapshot_rows="+$snap.Count)

Write-Host "== DELETE 2026 budgets/actuals/snapshot =="
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/budgets?year=eq.2026') -Headers $Hmin | Out-Null
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/actuals?year=eq.2026') -Headers $Hmin | Out-Null
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/snapshot_rows?year=eq.2026') -Headers $Hmin | Out-Null
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/budget_snapshots?year=eq.2026') -Headers $Hmin | Out-Null

Write-Host "== INSERT =="
PostRows 'budgets' $bud
PostRows 'actuals' $act
PostRows 'budget_snapshots' @( @{ year=2026; label='ORIGINAL'; created_at='2025-11-28T17:00:00' } )
PostRows 'snapshot_rows' $snap

Write-Host "== VERIFY =="
$tot=0.0; $from=0
while($true){ $b=Invoke-RestMethod -Uri ($url+'/rest/v1/budgets?select=months&year=eq.2026&limit=1000&offset='+$from) -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$tot+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
Write-Host ("budgets 2026 (live)   = "+('{0:N0}' -f $tot)+"  (target 1,499,093,910,657)")
$ta=0.0; $from=0
while($true){ $b=Invoke-RestMethod -Uri ($url+'/rest/v1/actuals?select=months&year=eq.2026&limit=1000&offset='+$from) -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$ta+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
Write-Host ("actuals 2026 (1-6)    = "+('{0:N0}' -f $ta)+"  (target 909,031,720,974)")
$ts=0.0; $from=0
while($true){ $b=Invoke-RestMethod -Uri ($url+'/rest/v1/snapshot_rows?select=months&year=eq.2026&limit=1000&offset='+$from) -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$ts+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
Write-Host ("ORIGINAL snapshot     = "+('{0:N0}' -f $ts)+"  (target 1,444,780,372,551)")
Write-Host "DONE - reload web app (Ctrl+F5)"
