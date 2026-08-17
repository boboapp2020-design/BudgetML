# =============================================================
# create-users.ps1 - create all Supabase Auth users + map to profiles
#
# Run once (re-runnable: existing users are skipped, profile is upserted).
# Needs: users-src.json (same folder) + project service_role key.
#
# Usage (PowerShell, in the supabase folder):
#   .\create-users.ps1 -SupabaseUrl "https://xxxx.supabase.co"
#   (prompts for service_role key, then creates users)
#
# Output: credentials.local.csv (email/password for everyone) - local only, gitignored
# WARNING: service_role key has full access - never share, never put in client code.
# NOTE: ASCII-only script (PowerShell 5.1 reads .ps1 as ANSI). Thai names come from JSON.
# =============================================================
param(
  [Parameter(Mandatory = $true)] [string] $SupabaseUrl,
  [string] $ServiceRoleKey,
  [string] $EmailDomain = "mitrphol.com"
)

$ErrorActionPreference = "Stop"
$SupabaseUrl = $SupabaseUrl.TrimEnd("/")
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

if (-not $ServiceRoleKey) {
  $sec = Read-Host "Paste service_role key (Settings > API > service_role)" -AsSecureString
  $ServiceRoleKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $ServiceRoleKey) { throw "No service_role key provided" }

$srcPath = Join-Path $PSScriptRoot "users-src.json"
if (-not (Test-Path $srcPath)) { throw "users-src.json not found at $srcPath" }
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
    Write-Host ("[+] {0,-30} created" -f $email)
  } catch {
    try {
      $look = Invoke-Sb -Method Get -Path ("/auth/v1/admin/users?email=" + [uri]::EscapeDataString($email))
      $uid  = ($look.users | Select-Object -First 1).id
      if (-not $uid -and $look.id) { $uid = $look.id }
      $existed++; $pw = "(exists)"
      Write-Host ("[=] {0,-30} exists - skip" -f $email)
    } catch {
      $failed++; Write-Host ("[x] {0,-30} FAILED: {1}" -f $email, $_.Exception.Message) -ForegroundColor Red
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
      Write-Host ("    (profile failed: {0})" -f $_.Exception.Message) -ForegroundColor Yellow
    }
  }
  ('"{0}","{1}","{2}","{3}","{4}"' -f $email, $u.username, ($u.name -replace '"',''), $u.role, $pw) | Add-Content $csv -Encoding UTF8
}

Write-Host ""
Write-Host ("Done: created {0}, existed {1}, failed {2}" -f $created, $existed, $failed) -ForegroundColor Cyan
Write-Host ("Passwords saved to: {0}" -f $csv) -ForegroundColor Cyan
Write-Host "Keep this file secret, distribute per department, then delete it."
