# serve.ps1 — Local web server สำหรับเปิด Annual Budget Planner
# ใช้: คลิกขวา > Run with PowerShell  หรือ  powershell -ExecutionPolicy Bypass -File serve.ps1
# แล้วเปิด http://localhost:8123 ใน browser
param([int]$Port = 8123)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mime = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
           '.svg'='image/svg+xml'; '.png'='image/png'; '.ico'='image/x-icon'; '.json'='application/json; charset=utf-8' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Annual Budget Planner running at http://localhost:$Port  (Ctrl+C to stop)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
      $file = Join-Path $root $path
      if ((Test-Path $file -PathType Leaf) -and ((Resolve-Path $file).Path.StartsWith((Resolve-Path $root).Path))) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      }
    } catch {
      # client ยกเลิกการเชื่อมต่อกลางทาง (เช่น กด reload) — ข้ามไป request ถัดไป
    } finally {
      try { $ctx.Response.Close() } catch {}
    }
  }
} finally { $listener.Stop() }
