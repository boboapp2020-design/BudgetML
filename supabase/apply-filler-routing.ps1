# =====================================================================
# apply-filler-routing.ps1  (ASCII-only; Thai from JSON at runtime)
# Rebuild Supabase to แผนก(F)-level model + filler routing (2025 + 2026).
#  - departments -> 64 แผนก (F)   (fixes FK: budgets.department_id -> departments.id)
#  - cct_master  -> cct maps to แผนก F
#  - budgets/dept_status -> F-routed (ACC/HR to central แผนก 2712/1161/1155)
#  Totals unchanged (2026=1.44T, 2025=913.9B). FK-safe order.
# Run:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\Users\surasakna\Desktop\Project AI\Budget App\supabase\apply-filler-routing.ps1"
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
function DelAll($table,$col){ Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/'+$table+'?'+$col+'=not.is.null') -Headers $Hmin | Out-Null }

$departments = Get-Content (Join-Path $PSScriptRoot 'departments-F.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$cctmaster   = Get-Content (Join-Path $PSScriptRoot 'cctmaster-F.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$budgets     = Get-Content (Join-Path $PSScriptRoot 'budgets-routed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$status      = Get-Content (Join-Path $PSScriptRoot 'deptstatus-routed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("departments="+$departments.Count+" cct="+$cctmaster.Count+" budgets="+$budgets.Count+" status="+$status.Count)

Write-Host "== DELETE children then departments (FK-safe) =="
DelAll 'budgets' 'year'
DelAll 'dept_status' 'year'
DelAll 'department_rows' 'cct'
DelAll 'cct_master' 'code'
DelAll 'departments' 'id'

Write-Host "== INSERT departments(F) + cct_master =="
PostRows 'departments' $departments
PostRows 'cct_master' $cctmaster

Write-Host "== INSERT budgets + dept_status (F-routed) =="
PostRows 'budgets' $budgets
PostRows 'dept_status' $status

Write-Host "== VERIFY totals =="
foreach($y in 2025,2026){
  $tot=0.0; $from=0
  while($true){ $b=Invoke-RestMethod -Uri ($url+'/rest/v1/budgets?select=months&year=eq.'+$y+'&limit=1000&offset='+$from) -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$tot+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
  Write-Host ("budget "+$y+" TOTAL = "+('{0:N0}' -f $tot))
}
Write-Host "== VERIFY central แผนก F =="
foreach($id in 'd2712','d1161','d1155'){
  $q = $url + '/rest/v1/budgets?select=year' + [char]38 + 'department_id=eq.' + $id
  $r = Invoke-WebRequest -Uri $q -Headers ($H + @{ Prefer='count=exact' }) -Method Get -UseBasicParsing
  Write-Host ("  "+$id+" owns "+(($r.Headers['Content-Range'] -split '/')[-1])+" budget rows")
}
Write-Host "DONE - reload web app (Ctrl+F5)"
