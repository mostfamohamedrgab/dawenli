// سكربت إداري: إعادة تعيين كلمة سر مستخدم على السيرفر.
// بيفتح الداتابيز مباشرةً ويحدّث password_hash بنفس صيغة scrypt اللي في src/server.js.
//
// الاستخدام (تشغّله جوه مجلد المشروع على السيرفر):
//   node scripts/reset-password.js                       → يعرض كل المستخدمين (id, name, email)
//   node scripts/reset-password.js <email> <new-password> → يغيّر باسورد المستخدم ده
//   node scripts/reset-password.js --owner <new-password> → يغيّر باسورد صاحب المنصة (is_owner=1)
//
// مثال: node scripts/reset-password.js --owner 0127533566

import Database from "better-sqlite3";
import crypto from "node:crypto";
import "dotenv/config";

const dbPath = process.env.DB_PATH || "./data/dawenli.db";
const db = new Database(dbPath);

// نفس صيغة src/server.js بالظبط: "salt:hash" — scrypt، keylen=64
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function listUsers() {
  const rows = db
    .prepare(`SELECT id, name, email, is_owner, last_seen, (password_hash IS NOT NULL) AS has_pw FROM users ORDER BY id`)
    .all();
  console.table(rows);
  return rows;
}

const [target, newPassword] = process.argv.slice(2);

// من غير معطيات → اعرض المستخدمين وبس
if (!target) {
  console.log(`\n📂 الداتابيز: ${dbPath}\n`);
  console.log("المستخدمين الموجودين:\n");
  listUsers();
  console.log(`\nالاستخدام:\n  node scripts/reset-password.js <email> <new-password>\n  node scripts/reset-password.js --owner <new-password>\n`);
  process.exit(0);
}

if (!newPassword || String(newPassword).length < 6) {
  console.error("❌ لازم تكتب كلمة سر جديدة (٦ حروف على الأقل).");
  console.error("   مثال: node scripts/reset-password.js --owner 0127533566");
  process.exit(1);
}

// نلاقي المستخدم: --owner أو بالإيميل
let user;
if (target === "--owner") {
  user = db.prepare(`SELECT * FROM users WHERE is_owner = 1 ORDER BY id LIMIT 1`).get();
  if (!user) {
    console.error("❌ مفيش حساب owner (is_owner=1) في الداتابيز.");
    process.exit(1);
  }
} else {
  const email = String(target).trim().toLowerCase();
  user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user) {
    console.error(`❌ مفيش مستخدم بالإيميل ده: ${email}\n   دي قائمة المستخدمين:`);
    listUsers();
    process.exit(1);
  }
}

const newHash = hashPassword(newPassword);
const info = db
  .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
  .run(newHash, user.id);

if (info.changes === 1) {
  console.log(`\n✅ اتغيّرت كلمة السر بنجاح.\n`);
  console.log(`   المستخدم : ${user.name || "(بدون اسم)"} (id=${user.id})`);
  console.log(`   الإيميل  : ${user.email || "(مفيش إيميل — مش هينفع تسجّل دخول بإيميل)"}`);
  console.log(`   الباسورد : ${newPassword}`);
  console.log(`\n🔐 ادخل من صفحة الدخول بالإيميل + الباسورد دول.`);
  if (!user.email) {
    console.log(`⚠️  الحساب ده ملوش إيميل، فالدخول بالإيميل مش هيشتغل. لازم تحط إيميل للحساب الأول.`);
  }
} else {
  console.error("❌ معرفتش أحدّث — مفيش صف اتغيّر.");
  process.exit(1);
}
