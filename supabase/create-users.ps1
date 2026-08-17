# =============================================================
# create-users.ps1 — สร้างผู้ใช้ทั้งหมดใน Supabase Auth + map เข้า profiles
#
# ใช้ครั้งเดียว (หรือรันซ้ำได้ — คนที่มีอยู่แล้วจะข้าม แล้ว upsert profile ให้)
# ต้องมี: users-src.json (อยู่โฟลเดอร์เดียวกัน) + service_role key ของโปรเจกต์
#
# วิธีรัน (ใน PowerShell ที่โฟลเดอร์ supabase):
#   .\create-users.ps1 -SupabaseUrl "https://xxxx.supabase.co"
#   (จะถาม service_role key แบบซ่อน แล้วเริ่มสร้าง)
#
# ผลลัพธ์: credentials.local.csv (อีเมล/รหัสผ่านทุกคน) — เก็บในเครื่อง ไม่ขึ้น git
# ⚠ service_role key มีสิทธิ์เต็ม — อย่าแชร์ อย่าใส่ในโค้ดฝั่ง client
# =============================================================
param(
  [Parameter(Mandatory = $true)] [string] $SupabaseUrl,
  [string] $ServiceRoleKey,
  [string] $EmailDomain = "mitrphol.com"
)

$ErrorActionPreference = "Stop"
$SupabaseUrl = $SupabaseUrl.TrimEnd("/")

if (-not $ServiceRoleKey) {
  $sec = Read-Host "วาง service_role key (Settings > API > service_role)" -AsSecureString
  $ServiceRoleKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $ServiceRoleKey) { throw "ไม่มี service_role key" }

$srcPath = Join-Path $PSScriptRoot "users-src.json"
if (-not (Test-Path $srcPath)) { throw "ไม่พบ users-src.json ที่ $srcPath" }
$users = Get-Content $srcPath -Raw -Encoding UTF8 | ConvertFrom-Json

$hdr = @{ apikey = $ServiceRoleKey; Authorization = "Bearer $ServiceRoleKey" }

function Invoke-Sb {
  param($Method, $Path, $BodyObj, $Prefer)
  $h = $hdr.Clone()
  if ($Prefer) { $h["Prefer"] = $Prefer }
  $uri = "$SupabaseUrl$Path"
  if ($BodyObj) {
    $json  = $BodyObj | ConvertTo-Json -Depth 6 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $h -Body $bytes -ContentType "application/json; charset=utf-8"
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $h
}

function New-Password {
  $sets = @("ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "23456789")
  $pw = ""
  foreach ($s in $sets) { $pw += $s[(Get-Random -Max $s.Length)] }
  $all = ($sets -join "")
  while ($pw.Length -lt 12) { $pw += $all[(Get-Random -Max $all.Length)] }
  # สลับตำแหน่ง
  return -join ($pw.ToCharArray() | Sort-Object { Get-Random })
}

function Get-Email($u) {
  switch ($u.role) {
    "ACCOUNTING" { return "accounting@$EmailDomain" }
    "MANAGER"    { return ("mgr-" + $u.orgUnit + "@" + $EmailDomain) }
    default      { return ($u.username + "@" + $EmailDomain) }
  }
}

$csv = Join-Path $PSScriptRoot "credentials.local.csv"
"email,username,name,role,password" | Out-File $csv -Encoding UTF8
$created = 0; $existed = 0; $failed = 0

foreach ($u in $users) {
  $email = Get-Email $u
  $pw    = New-Password
  $uid   = $null
  try {
    $res = Invoke-Sb -Method Post -Path "/auth/v1/admin/users" -BodyObj @{
      email = $email; password = $pw; email_confirm = $true
      user_metadata = @{ username = $u.username; full_name = $u.name }
    }
    $uid = $res.id
    $created++
    Write-Host ("[+] {0,-28} {1}" -f $email, $u.name)
  } catch {
    # มีอยู่แล้ว → หา id เพื่อ upsert profile (ไม่รู้รหัสผ่านเดิม)
    try {
      $look = Invoke-Sb -Method Get -Path ("/auth/v1/admin/users?email=" + [uri]::EscapeDataString($email))
      $uid  = ($look.users | Select-Object -First 1).id
      if (-not $uid -and $look.id) { $uid = $look.id }
      $existed++; $pw = "(มีอยู่แล้ว)"
      Write-Host ("[=] {0,-28} มีอยู่แล้ว — ข้าม" -f $email)
    } catch {
      $failed++; Write-Host ("[x] {0,-28} ล้มเหลว: {1}" -f $email, $_.Exception.Message) -ForegroundColor Red
      continue
    }
  }

  if ($uid) {
    try {
      Invoke-Sb -Method Post -Path "/rest/v1/profiles" -Prefer "resolution=merge-duplicates,return=minimal" -BodyObj @{
        id = $uid; username = $u.username; full_name = $u.name; role = $u.role
        department_id = $u.departmentId; org_unit = $u.orgUnit
      } | Out-Null
    } catch {
      Write-Host ("    (profile ล้มเหลว: {0})" -f $_.Exception.Message) -ForegroundColor Yellow
    }
  }
  ('"{0}","{1}","{2}","{3}","{4}"' -f $email, $u.username, ($u.name -replace '"',''), $u.role, $pw) | Add-Content $csv -Encoding UTF8
}

Write-Host ""
Write-Host ("เสร็จ: สร้างใหม่ {0} · มีอยู่แล้ว {1} · ล้มเหลว {2}" -f $created, $existed, $failed) -ForegroundColor Cyan
Write-Host ("รหัสผ่านทั้งหมดอยู่ใน: {0}" -f $csv) -ForegroundColor Cyan
Write-Host "⚠ เก็บไฟล์นี้เป็นความลับ แล้วแจกรหัสให้แต่ละแผนก จากนั้นลบทิ้ง"
