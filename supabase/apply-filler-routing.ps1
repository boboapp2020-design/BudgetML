# =====================================================================
# apply-filler-routing.ps1
# ย้ายเจ้าของ (department_id) ของแถว ACC/HR ไปแผนกกลางผู้กรอก (routing)
#  ACC+อ้อย -> แผนกบริการไร่ / ACC อื่น -> แผนกบัญชีทั่วไป / HR -> แผนกบุคคลโรงงาน
#  ครอบทั้งปี 2025 + 2026 · ยอดรวมไม่เปลี่ยน (2026=1.44T, 2025=913.9B) แค่ย้ายเจ้าของ
#  อ่านจาก budgets-routed.json + deptstatus-routed.json (สร้างไว้แล้ว)
# วิธีรัน:
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

$budgets = Get-Content (Join-Path $PSScriptRoot 'budgets-routed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$status  = Get-Content (Join-Path $PSScriptRoot 'deptstatus-routed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("budgets-routed rows = "+$budgets.Count+"  dept_status = "+$status.Count)

Write-Host "== DELETE budgets/dept_status 2025+2026 =="
foreach($y in 2025,2026){
  Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/budgets?year=eq.'+$y) -Headers $Hmin | Out-Null
  Invoke-RestMethod -Method Delete -Uri ($url+'/rest/v1/dept_status?year=eq.'+$y) -Headers $Hmin | Out-Null
}

Write-Host "== INSERT routed budgets + dept_status =="
PostRows 'budgets' $budgets
PostRows 'dept_status' $status

Write-Host "== VERIFY =="
foreach($y in 2025,2026){
  $tot=0.0; $from=0
  while($true){ $b=Invoke-RestMethod -Uri "$url/rest/v1/budgets?select=months&year=eq.$y&limit=1000&offset=$from" -Headers $H; foreach($x in $b){ foreach($v in $x.months){ if($v){$tot+=$v} } }; if($b.Count -lt 1000){break}; $from+=1000 }
  Write-Host ("budget "+$y+" TOTAL = "+('{0:N0}' -f $tot))
}
# central owner row counts
foreach($c in @{n='บริการไร่';id='u8001010400'},@{n='บัญชีทั่วไป';id='u8003851100'},@{n='บุคคลโรงงาน';id='u8003821400'}){
  $r=Invoke-WebRequest -Uri ($url+'/rest/v1/budgets?select=year&department_id=eq.'+$c.id) -Headers ($H + @{Prefer='count=exact'}) -Method Get -UseBasicParsing
  Write-Host ("  "+$c.n+" ("+$c.id+") owns "+(($r.Headers['Content-Range'] -split '/')[-1])+" budget rows")
}
Write-Host "DONE - reload web app (Ctrl+F5)"
