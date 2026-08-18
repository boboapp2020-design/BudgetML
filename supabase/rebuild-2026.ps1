# =====================================================================
# rebuild-2026.ps1
# แทนที่ข้อมูลบน Supabase ทั้งหมดด้วยโครงสร้างใหม่จากไฟล์จริง (seed-data.js)
#  - หน่วยงาน 152 (คอลัมน์ D) / GL 173 / งบต้นปี 2026 = 1,444,780,372,591
#  - ลบของเก่าทั้งหมด แล้วใส่ใหม่ทั้งหมด (self-healing ไม่ว่าตอนนี้ค้างสภาพไหน)
# วิธีรัน: คลิก Run ในบล็อกโค้ด หรือใน PowerShell:
#   powershell -ExecutionPolicy Bypass -File "supabase\rebuild-2026.ps1"
# (คีย์ที่ฝังคือ publishable/anon key ปลอดภัยฝั่ง client)
# =====================================================================
$ErrorActionPreference = 'Stop'
$url = 'https://fdicsryxzyxuoxacxilz.supabase.co'
$key = 'sb_publishable_1iBfWSMLMRf-Be1E96zS9w_f5tf1rVT'
$H    = @{ apikey=$key; Authorization=("Bearer "+$key) }
$Hmin = $H + @{ Prefer='return=minimal' }

function PostRows($table, $rows, $prefer='return=minimal') {
  if (-not $rows -or $rows.Count -eq 0) { Write-Host ("  "+$table+": 0"); return }
  $chunk = 500; $done = 0
  for ($i=0; $i -lt $rows.Count; $i += $chunk) {
    $slice = @($rows[$i..([math]::Min($i+$chunk-1,$rows.Count-1))])
    $json  = ConvertTo-Json -InputObject $slice -Depth 8 -Compress
    if ($slice.Count -eq 1) { $json = '['+$json+']' }   # PS ยุบ array 1 ตัว → บังคับเป็น array
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $hh = $H + @{ Prefer=$prefer; 'Content-Type'='application/json' }
    Invoke-RestMethod -Method Post -Uri ($url+'/rest/v1/'+$table) -Headers $hh -Body $bytes | Out-Null
    $done += $slice.Count
  }
  Write-Host ("  "+$table+": +"+$done)
}
function DeleteAll($table, $col) {
  try { Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/'+$table+'?'+$col+'=not.is.null') -Headers $Hmin | Out-Null }
  catch { Write-Host ("  (del "+$table+" warn: "+$_.Exception.Message+")") }
}

$raw = Get-Content (Join-Path $PSScriptRoot '..\js\seed-data.js') -Raw -Encoding UTF8
$jsonTxt = $raw -replace '(?s)^.*?const SEED_DATA = ', '' -replace ';\s*$', ''
$D = $jsonTxt | ConvertFrom-Json
$units = $D.units
Write-Host ("seed-data: units="+$units.Count+" gl="+$D.glMaster.Count)

Write-Host "== DELETE old =="
foreach ($t in 'snapshot_rows','budget_snapshots','cell_details','actuals','gl_notes','dept_status','budgets','budget_periods','exchange_rates','fuel_prices') { DeleteAll $t 'year' }
DeleteAll 'department_rows' 'cct'
DeleteAll 'cct_master' 'code'
DeleteAll 'departments' 'id'
DeleteAll 'gl_accounts' 'id'
DeleteAll 'notifications' 'id'

Write-Host "== BUILD =="
$departments=@(); $glAcc=@(); $cct=@(); $deptRows=@(); $budgets=@(); $deptStatus=@()
foreach ($u in $units) {
  $departments += @{ id=$u.id; code=$u.code; name=$u.name; name_en=''; side=$u.side; active=$true }
  foreach ($c in $u.ccts) { $cct += @{ code=$c; name=$u.name; department_id=$u.id } }
  foreach ($r in $u.rows) {
    $glid='g'+$r.gl
    $deptRows += @{ department_id=$u.id; cct=$r.cct; gl_id=$glid; io=([string]$r.io); code_a=([string]$r.codeA) }
    $budgets  += @{ year=2026; department_id=$u.id; gl_id=$glid; cct=$r.cct; months=@($r.m); mtp1=$null; mtp2=$null; updated_at='2025-11-25T16:00:00'; updated_by='seed 2026' }
  }
  $deptStatus += @{ year=2026; department_id=$u.id; status='LOCKED'; submitted_at='2025-11-20T16:40:00'; revision_note=$null }
}
foreach ($g in $D.glMaster) { $glAcc += @{ id=('g'+$g.code); code=$g.code; name=$g.name; gl_group=$g.group; io_group=''; active=$true } }
$periods = @(
  @{ year=2025; status='CLOSED'; phase=$null; actual_thru=$null; opened_at='2024-08-15T08:00:00'; locked_at='2024-10-20T17:00:00'; locked_by='System' },
  @{ year=2026; status='CLOSED'; phase=$null; actual_thru=$null; opened_at='2025-08-20T08:00:00'; locked_at='2025-11-28T17:00:00'; locked_by='Accounting' } )
$fx = @( @{year=2026;currency='THB';rate_to_lak=680}, @{year=2026;currency='USD';rate_to_lak=21738}, @{year=2026;currency='CNY';rate_to_lak=3060}, @{year=2026;currency='EUR';rate_to_lak=25976} )
$fuel = @( @{year=2026;fuel_type='Diesel';price_per_liter=19210}, @{year=2026;fuel_type='Benzin';price_per_liter=23520} )
Write-Host ("  dep="+$departments.Count+" gl="+$glAcc.Count+" cct="+$cct.Count+" rows="+$deptRows.Count+" budgets="+$budgets.Count)

Write-Host "== INSERT new =="
PostRows 'departments' $departments
PostRows 'gl_accounts' $glAcc
PostRows 'cct_master' $cct
PostRows 'department_rows' $deptRows
PostRows 'budget_periods' $periods
PostRows 'budgets' $budgets
PostRows 'dept_status' $deptStatus
PostRows 'exchange_rates' $fx
PostRows 'fuel_prices' $fuel
$sidesObj=@{}; foreach($p in $D.sides.PSObject.Properties){ $sidesObj[$p.Name]=$p.Value }
PostRows 'app_meta' @( @{ id='main'; schema_version=11; rev=100; company='Mitr Lao Sugar'; currency='LAK'; year_current=2026; year_previous=2025; app_name='Annual Budget Planner'; sides=$sidesObj } ) 'resolution=merge-duplicates,return=minimal'

Write-Host "== VERIFY =="
$tot=0.0; $from=0
while($true){ $b=Invoke-RestMethod -Uri "$url/rest/v1/budgets?select=months&year=eq.2026&limit=1000&offset=$from" -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$tot+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
Write-Host ("budget 2026 TOTAL = "+('{0:N0}' -f $tot)+"   (target 1,444,780,372,591)")
Write-Host "DONE - reload the web app (Ctrl+F5)"
