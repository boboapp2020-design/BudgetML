#!/usr/bin/env bash
# =============================================================
# build.sh — เตรียมไฟล์ deploy ขึ้น Cloudflare Pages (โฟลเดอร์ dist/)
# คัดเฉพาะไฟล์แอป — ไม่รวม Excel ภายใน / backup / SQL / รายงาน
# ใช้: bash build.sh   → ได้ dist/ พร้อม deploy
# =============================================================
set -e
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist

# ไฟล์แอปเท่านั้น (โค้ด + ฟอนต์ + รูปที่แอปอ้างอิงจริง: hero.jpg, logo-app.png, Flags/)
cp index.html dist/
cp -r css js fonts Flags dist/
for f in favicon.png logo-app.png hero.jpg; do [ -f "$f" ] && cp "$f" dist/; done

# Security headers ของ Cloudflare Pages
cat > dist/_headers << 'EOF'
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/index.html
  Cache-Control: no-cache
EOF

echo "✅ dist/ พร้อม deploy — $(find dist -type f | wc -l) ไฟล์"
