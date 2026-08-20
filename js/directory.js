/* =============================================================
 * directory.js — สมุดรายชื่ออีเมล → สิทธิ์การใช้งาน (Email Directory)
 * ที่มา: users-mitrlao.json (จาก user-list.html)
 *  - role "filler" = ผู้กรอกงบของแผนก (id = รหัสแผนก)
 *  - role "viewer" = ผู้อนุมัติ/ผู้ดู (id = MGR:<node>) · MGR:co = ผู้ดูภาพรวม (กจก.)
 *  - admin ไม่ใช้อีเมล — เข้าด้วย username: admin / password: 1234
 * 1 อีเมลมีได้หลายสิทธิ์ → หน้าเลือกบทบาทหลัง login
 * ============================================================= */

const EMAIL_DIR =
[
  {
    "id": "accounting",
    "role": "admin",
    "code": "—",
    "name": "ผู้ดูแลระบบ — แผนกบัญชี",
    "sub": "ผู้ดูแลระบบ",
    "selected": true,
    "emails": [],
    "costRole": null
  },
  {
    "id": "MGR:co",
    "role": "viewer",
    "code": "บริษัท",
    "name": "บริษัท น้ำตาลมิตรลาว จำกัด (ภาพรวมทั้งบริษัท)",
    "sub": "ระดับบริษัท",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:area_3",
    "role": "viewer",
    "code": "สังกัด",
    "name": "ด้านโรงงาน",
    "sub": "ระดับสังกัด (Area)",
    "selected": true,
    "emails": [
      "Chanchalermk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:area_2",
    "role": "viewer",
    "code": "สังกัด",
    "name": "ด้านอ้อย",
    "sub": "ระดับสังกัด (Area)",
    "selected": true,
    "emails": [
      "saadp@mitrphol.com",
      "chirak@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:area_1",
    "role": "viewer",
    "code": "สังกัด",
    "name": "บริหารสำนักงาน",
    "sub": "ระดับสังกัด (Area)",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:area_4",
    "role": "viewer",
    "code": "สังกัด",
    "name": "สังกัด กจก.",
    "sub": "ระดับสังกัด (Area)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_6",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ด้านโรงงาน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Chanchalermk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_8",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ผอ.ประจำบริษัทน้ำตาลมิตรลาว",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_16",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายผลิต (ด้านโรงงาน)",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Chanchalermk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_7",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายวิศวกรรมและซ่อมบำรุง",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Chanchalermk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_12",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ศูนย์ประกันคุณภาพ",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Phoukhongk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_20",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "โครงการจัดการโรคใบขาว",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "saadp@mitrphol.com",
      "chirak@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_14",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "โครงการอ้อยอินทรีย์",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "saadp@mitrphol.com",
      "chirak@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_21",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ผู้อำนวยการด้านอ้อย",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "saadp@mitrphol.com",
      "chirak@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_11",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายเครื่องมือเกษตรและเก็บเกี่ยว",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "sombatk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_5",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายชลประทาน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "chirak@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_2",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ไร่บริษัท",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "chirak@mitrphol.com",
      "saadp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_18",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ไร่ส่งเสริม",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "chirak@mitrphol.com",
      "saadp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_10",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ศูนย์พันธุ์อ้อย",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "chirak@mitrphol.com",
      "saadp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_17",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "สำนักงานด้านอ้อย",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "chirak@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_9",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ผจก.ฝ่ายประจำโรงงาน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_1",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ผอ.ด้านบริหารสำนักงาน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_22",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "แผนกทรัพยากรบุคคล",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_15",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายบัญชีและการเงิน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_13",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายผลิต (บรรจุ)",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_19",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "ฝ่ายสำนักงาน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_3",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "กจ.บริษัท น้ำตาลมิตรลาว จำกัด",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "MGR:div_4",
    "role": "viewer",
    "code": "ฝ่าย",
    "name": "นิติกร/ประสานงาน",
    "sub": "ระดับฝ่าย (ผู้อนุมัติ)",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1111",
    "role": "filler",
    "code": "1111",
    "name": "กจ. บจ.น้ำตาลมิตรลาว",
    "sub": "สังกัด กจก.",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com",
      "duenpenp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1112",
    "role": "filler",
    "code": "1112",
    "name": "PERSONAL ASSISTANT",
    "sub": "สังกัด กจก.",
    "selected": true,
    "emails": [
      "weerasakp@mitrphol.com",
      "duenpenp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1122",
    "role": "filler",
    "code": "1122",
    "name": "นิติกร/ประสานงาน",
    "sub": "สังกัด กจก.",
    "selected": true,
    "emails": [
      "Jirapongk@mitrphol.com",
      "Omkhams@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1172",
    "role": "filler",
    "code": "1172",
    "name": "นิติกร",
    "sub": "สังกัด กจก.",
    "selected": true,
    "emails": [
      "Jirapongk@mitrphol.com",
      "Omkhams@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1141",
    "role": "filler",
    "code": "1141",
    "name": "แผนกธุรการและบริการ",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Phetchindap@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1142",
    "role": "filler",
    "code": "1142",
    "name": "งานจัดชื้อท้องถิ่น",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "pirotk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1143",
    "role": "filler",
    "code": "1143",
    "name": "งานการตลาด",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Bordinp@mitrphol.com"
    ],
    "costRole": "กรอกตันน้ำตาล Trading"
  },
  {
    "id": "1144",
    "role": "filler",
    "code": "1144",
    "name": "แผนก LOGISTIC",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "pirotk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1146",
    "role": "filler",
    "code": "1146",
    "name": "งานจัดหาเชื่อเพลิง",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "pirotk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1155",
    "role": "filler",
    "code": "1155",
    "name": "แผนกทรัพยากรบุคคล",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Phouthongs@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1161",
    "role": "filler",
    "code": "1161",
    "name": "แผนกบัญชีทั่วไปและการเงิน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Khamphank@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1162",
    "role": "filler",
    "code": "1162",
    "name": "แผนกบัญชีอ้อย",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "vilawann@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1164",
    "role": "filler",
    "code": "1164",
    "name": "หน่วยสารสนเทศ",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Linhp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1171",
    "role": "filler",
    "code": "1171",
    "name": "ผอ.ด้านบริหารสำนักงาน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1181",
    "role": "filler",
    "code": "1181",
    "name": "ผจก.ฝ่ายประจำโรงงาน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1194",
    "role": "filler",
    "code": "1194",
    "name": "ผจ.บัญชีและการเงิน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "duenpenp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1227",
    "role": "filler",
    "code": "1227",
    "name": "บรรจุ",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "santipanp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2271",
    "role": "filler",
    "code": "2271",
    "name": "ผอ.ด้านบริหารสำนักงาน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3371",
    "role": "filler",
    "code": "3371",
    "name": "ผอ.ด้านบริหารสำนักงาน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "4471",
    "role": "filler",
    "code": "4471",
    "name": "ผอ.ด้านบริหารสำนักงาน",
    "sub": "บริหารสำนักงาน",
    "selected": true,
    "emails": [
      "Prasongp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2111",
    "role": "filler",
    "code": "2111",
    "name": "ศูนย์ผลิตพันธุ์อ้อย 70",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "NYKHONEV@MITRPHOL.COM",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2122",
    "role": "filler",
    "code": "2122",
    "name": "โครงการอ้อยอินทรีย์",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Rermpongk@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2211",
    "role": "filler",
    "code": "2211",
    "name": "ผู้อำนวยการด้านอ้อย",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "saadp@mitrphol.com",
      "chirak@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2223",
    "role": "filler",
    "code": "2223",
    "name": "โครงการจัดการโรคใบขาว",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Rermpongk@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2311",
    "role": "filler",
    "code": "2311",
    "name": "ไร่ 1",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "pichits@mitrphol.com",
      "sombatk@mitrphol.com",
      "Steanm@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2322",
    "role": "filler",
    "code": "2322",
    "name": "ไร่ 2",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "pichits@mitrphol.com",
      "sombatk@mitrphol.com",
      "Steanm@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2333",
    "role": "filler",
    "code": "2333",
    "name": "ไร่ 3",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "pichits@mitrphol.com",
      "sombatk@mitrphol.com",
      "Steanm@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2344",
    "role": "filler",
    "code": "2344",
    "name": "ไร่ 4",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "pichits@mitrphol.com",
      "sombatk@mitrphol.com",
      "Steanm@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2366",
    "role": "filler",
    "code": "2366",
    "name": "ไร่ 6",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "pichits@mitrphol.com",
      "sombatk@mitrphol.com",
      "Steanm@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2400",
    "role": "filler",
    "code": "2400",
    "name": "ผู้จัดการฝ่ายส่งเสริมอ้อย",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Kamsais@mitrphol.com",
      "Apichots@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2411",
    "role": "filler",
    "code": "2411",
    "name": "เขตส่งเสริมอ้อย 1",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Pongpissanum@mitrphol.com",
      "Kamsais@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2422",
    "role": "filler",
    "code": "2422",
    "name": "เขตส่งเสริมอ้อย 2",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Praserds@mitrphol.com",
      "Apichots@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2433",
    "role": "filler",
    "code": "2433",
    "name": "เขตส่งเสริมอ้อย 3",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "nattamonk@mitrphol.com",
      "Kamsais@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2444",
    "role": "filler",
    "code": "2444",
    "name": "เขตส่งเสริมอ้อย 4",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "PHUNGOUNB@MITRPHOL.COM",
      "Kamsais@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2455",
    "role": "filler",
    "code": "2455",
    "name": "เขตส่งเสริมอ้อย 5",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "CHOUMSYX@MITRPHOL.COM",
      "Kamsais@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2466",
    "role": "filler",
    "code": "2466",
    "name": "เขตส่งเสริมอ้อย 6",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "SEESANK@MITRPHOL.COM",
      "Apichots@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2477",
    "role": "filler",
    "code": "2477",
    "name": "เขตส่งเสริมอ้อย 7",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "KHAMBOUNK@MITRPHOL.COM",
      "Apichots@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2488",
    "role": "filler",
    "code": "2488",
    "name": "เขตส่งเสริมอ้อย 8",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "PAMOTK@MITRPHOL.COM",
      "Apichots@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2499",
    "role": "filler",
    "code": "2499",
    "name": "เขตส่งเสริมอ้อย 9",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "KHAMSANONGK@MITRPHOL.COM",
      "Apichots@mitrphol.com",
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2511",
    "role": "filler",
    "code": "2511",
    "name": "ผจก.ฝ่ายเครื่องมือการเกษตรและเก็บเกี่ยว",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "sombatk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2512",
    "role": "filler",
    "code": "2512",
    "name": "แผนกเครื่องมือการเกษตร",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Samaip@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2513",
    "role": "filler",
    "code": "2513",
    "name": "แผนกเก็บเกี่ยวอ้อย",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Jakaphops@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2611",
    "role": "filler",
    "code": "2611",
    "name": "แผนกสำรวจและโยธา",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "Wirotesa@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2711",
    "role": "filler",
    "code": "2711",
    "name": "สำนักงานด้านอ้อย",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2712",
    "role": "filler",
    "code": "2712",
    "name": "แผนกบริการไร่",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": "กรอกตันอ้อย ไร่บริษัท+ส่งเสริม"
  },
  {
    "id": "2713",
    "role": "filler",
    "code": "2713",
    "name": "แผนกสารสนเทศและระบบ GIS",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "kampanatk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "2714",
    "role": "filler",
    "code": "2714",
    "name": "ศูนย์การเรียนรู้โครงการเลี้ยงวัว",
    "sub": "ด้านอ้อย",
    "selected": true,
    "emails": [
      "YUTHAPONGN@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1131",
    "role": "filler",
    "code": "1131",
    "name": "งานสิ่งแวดล้อมและความปลอดภัย",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Sangvank@mitrphol.com",
      "Sengsavanhk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1132",
    "role": "filler",
    "code": "1132",
    "name": "แผนกบริหารคุณภาพ",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "surasakna@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "1133",
    "role": "filler",
    "code": "1133",
    "name": "แผนกวิเคราะห์คุณภาพ",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "khamtuns@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3111",
    "role": "filler",
    "code": "3111",
    "name": "ด้านโรงงาน",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Chanchalermk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3122",
    "role": "filler",
    "code": "3122",
    "name": "ผู้จัดการฝ่ายผลิต",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Chanchalermk@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "32",
    "role": "filler",
    "code": "32",
    "name": "ผอ.ประจำบริษัทน้ำตาลมิตรลาว",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "santipanp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3221",
    "role": "filler",
    "code": "3221",
    "name": "แผนกลูกหีบ",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Thongkhaix@mitrphol.com",
      "Seksuny@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3222",
    "role": "filler",
    "code": "3222",
    "name": "แผนกหม้อต้ม",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "norkhams@mitrphol.com",
      "Somkongs@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3223",
    "role": "filler",
    "code": "3223",
    "name": "แผนกหม้อเคี่ยว",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Marisap@mitrphol.com",
      "Amphayvanhs@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3224",
    "role": "filler",
    "code": "3224",
    "name": "แผนกหม้อปั่น",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Surapongp@mitrphol.com"
    ],
    "costRole": "กรอกตันน้ำตาลผลิต"
  },
  {
    "id": "3311",
    "role": "filler",
    "code": "3311",
    "name": "แผนกหม้อไอน้ำ",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Phaimanyp@mitrphol.com",
      "Somboonm@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3312",
    "role": "filler",
    "code": "3312",
    "name": "แผนกไฟฟ้าผลิต",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Soudsavanhp@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3313",
    "role": "filler",
    "code": "3313",
    "name": "แผนกซ่อมบำรุงไฟฟ้า",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "MIXAYKONEP@mitrphol.com",
      "INPONES@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3314",
    "role": "filler",
    "code": "3314",
    "name": "แผนกเครื่องมือควบคุม",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Phommat@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3315",
    "role": "filler",
    "code": "3315",
    "name": "แผนกซ่อมบำรุงเครื่องกล",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Manadys@mitrphol.com",
      "Aoupekhas@mitrphol.com"
    ],
    "costRole": null
  },
  {
    "id": "3411",
    "role": "filler",
    "code": "3411",
    "name": "หน่วยงาน TPM",
    "sub": "ด้านโรงงาน",
    "selected": true,
    "emails": [
      "Vanpasiths@mitrphol.com"
    ],
    "costRole": null
  }
];

const EmailAuth = (() => {
  const norm = e => String(e || '').trim().toLowerCase();
  const rank = a => a.role === 'filler' ? 0 : (a.id === 'MGR:co' ? 2 : 1);
  const sortAsg = out => out.sort((a, b) => rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)));
  // สิทธิ์ทั้งหมดของอีเมลนี้ — ผู้กรอกขึ้นก่อน แล้วค่อยผู้อนุมัติ (ภาพรวมบริษัทท้ายสุด)
  //  ถ้าแอดมินเคยแก้สมุดผู้ใช้ (Store.userAccounts) จะใช้อันนั้นก่อน มิฉะนั้นใช้ EMAIL_DIR (ฐานจากโค้ด)
  function assignmentsFor(email) {
    const key = norm(email);
    if (!key || !key.includes('@')) return [];
    if (typeof Store !== 'undefined' && Store.directory) {
      const a = Store.directoryAccount(key);
      if (!a || a.active === false) return [];
      return sortAsg(a.roles.map(r => ({ id: r.id, role: r.kind === 'filler' ? 'filler' : 'viewer', name: r.name, sub: r.sub || '' })));
    }
    const out = [];
    EMAIL_DIR.forEach(u => {
      if (u.selected === false) return;
      if ((u.emails || []).some(e => norm(e) === key)) out.push({ id: u.id, role: u.role, name: u.name, sub: u.sub || '' });
    });
    return sortAsg(out);
  }
  return { assignmentsFor, norm };
})();
window.EmailAuth = EmailAuth;
