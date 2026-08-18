# =====================================================================
# push-2025-actuals.ps1
# ใส่งบเกิดจริงสะสมปี 2025 (จาก ML_งบค่าใช้จ่าย_Revise 2025) ลง Supabase
#  เป็นฐานเทียบปีก่อน (prev-year) ให้หน้ากรอกงบ/แดชบอร์ด — 1,438 แถว รวม 913,894,354,172
#  อ่านจาก supabase/actuals-2025.json (สกัดไว้แล้ว) → ลบ budgets 2025 เก่า → ใส่ใหม่
# วิธีรัน:
#   powershell.exe -ExecutionPolicy Bypass -File "C:\Users\surasakna\Desktop\Project AI\Budget App\supabase\push-2025-actuals.ps1"
# =====================================================================
$ErrorActionPreference = 'Stop'
$url = 'https://fdicsryxzyxuoxacxilz.supabase.co'
$key = 'sb_publishable_1iBfWSMLMRf-Be1E96zS9w_f5tf1rVT'
$H    = @{ apikey=$key; Authorization=("Bearer "+$key) }
$Hmin = $H + @{ Prefer='return=minimal' }

$rows = Get-Content (Join-Path $PSScriptRoot 'actuals-2025.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("actuals-2025.json rows = "+$rows.Count)

Write-Host "== DELETE budgets/dept_status year 2025 =="
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/budgets?year=eq.2025') -Headers $Hmin | Out-Null
Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/dept_status?year=eq.2025') -Headers $Hmin | Out-Null

Write-Host "== INSERT 2025 budgets =="
$chunk=500; $done=0
for($i=0;$i -lt $rows.Count;$i+=$chunk){
  $slice=@($rows[$i..([math]::Min($i+$chunk-1,$rows.Count-1))])
  $json=ConvertTo-Json -InputObject $slice -Depth 6 -Compress
  if($slice.Count -eq 1){ $json='['+$json+']' }
  $bytes=[System.Text.Encoding]::UTF8.GetBytes($json)
  $hh=$H + @{ Prefer='return=minimal'; 'Content-Type'='application/json' }
  Invoke-RestMethod -Method Post -Uri ($url+'/rest/v1/budgets') -Headers $hh -Body $bytes | Out-Null
  $done+=$slice.Count
}
Write-Host ("  budgets 2025 inserted: "+$done)

# dept_status 2025 = CLOSED/LOCKED สำหรับหน่วยงานที่มีข้อมูล
$deptStatus=@()
$rows | Select-Object -ExpandProperty department_id -Unique | ForEach-Object {
  $deptStatus += @{ year=2025; department_id=$_; status='LOCKED'; submitted_at='2025-01-10T09:00:00'; revision_note=$null }
}
$json=ConvertTo-Json -InputObject @($deptStatus) -Depth 5 -Compress
$bytes=[System.Text.Encoding]::UTF8.GetBytes($json)
Invoke-RestMethod -Method Post -Uri ($url+'/rest/v1/dept_status') -Headers ($H + @{ Prefer='return=minimal'; 'Content-Type'='application/json' }) -Body $bytes | Out-Null
Write-Host ("  dept_status 2025: "+$deptStatus.Count)

Write-Host "== VERIFY =="
$tot=0.0; $from=0
while($true){ $b=Invoke-RestMethod -Uri "$url/rest/v1/budgets?select=months&year=eq.2025&limit=1000&offset=$from" -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$tot+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
Write-Host ("budget 2025 TOTAL = "+('{0:N0}' -f $tot)+"   (target 913,894,354,172)")
Write-Host "DONE - reload web app (Ctrl+F5)"
