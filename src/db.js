import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
// إعدادات إنتاج: WAL = قراءة وكتابة بالتوازي من غير قفل، busy_timeout يمنع
// أخطاء القفل اللحظي، synchronous=NORMAL توازن أمان/سرعة كويس مع WAL.
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    chat_id       TEXT UNIQUE,
    name          TEXT,
    is_owner      INTEGER NOT NULL DEFAULT 0,
    last_seen     TEXT,
    email         TEXT,
    password_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    mood        TEXT,
    summary     TEXT,
    tags        TEXT,
    transcript  TEXT NOT NULL,
    raw_json    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(entry_date);

  CREATE TABLE IF NOT EXISTS finance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    direction   TEXT NOT NULL,   -- expense | income
    amount      REAL NOT NULL,
    currency    TEXT,
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_finance_date ON finance(entry_date);

  CREATE TABLE IF NOT EXISTS health (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    at_time     TEXT,
    category    TEXT,            -- تمرين | دواء | أكل | عرض | نوم | نفسية | ملاحظة
    detail      TEXT NOT NULL,
    body_region TEXT             -- راس | صدر | معدة | بطن | ذراعين | ساقين | عام
  );
  CREATE INDEX IF NOT EXISTS idx_health_date ON health(entry_date);

  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    chat_id     TEXT,
    kind        TEXT,            -- voice | text | command | checkin
    user_text   TEXT,
    ai_reply    TEXT,
    meta_json   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_conv_created ON conversations(created_at);

  CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    title       TEXT NOT NULL,
    target      REAL,
    current     REAL NOT NULL DEFAULT 0,
    unit        TEXT,
    note        TEXT
  );

  CREATE TABLE IF NOT EXISTS goal_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    user_id       INTEGER NOT NULL,
    goal_id       INTEGER NOT NULL,
    delta         REAL,
    current_after REAL,
    note          TEXT
  );

  CREATE TABLE IF NOT EXISTS conditions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    title       TEXT NOT NULL,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active', -- active | closed
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_conditions_status ON conditions(status);

  CREATE TABLE IF NOT EXISTS meals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    at_time     TEXT,
    items       TEXT NOT NULL,
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(entry_date);

  CREATE TABLE IF NOT EXISTS habits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'do',  -- do (عادة أعملها) | quit (عادة أبطلها)
    emoji       TEXT,
    status      TEXT NOT NULL DEFAULT 'active', -- active | archived
    note        TEXT
  );

  CREATE TABLE IF NOT EXISTS habit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    habit_id    INTEGER NOT NULL,
    log_date    TEXT NOT NULL,
    UNIQUE(habit_id, log_date)
  );
  CREATE INDEX IF NOT EXISTS idx_habit_logs ON habit_logs(habit_id, log_date);

  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT NOT NULL,
    user_id      INTEGER NOT NULL,
    title        TEXT NOT NULL,
    due_date     TEXT NOT NULL,   -- YYYY-MM-DD
    due_time     TEXT,            -- HH:MM أو null لو مهمة لليوم كله
    note         TEXT,
    status       TEXT NOT NULL DEFAULT 'pending', -- pending | done
    completed_at TEXT,
    reminded_at  TEXT             -- عشان منبعتش التذكير مرتين
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(user_id, due_date);

  CREATE TABLE IF NOT EXISTS ai_usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    usage_date    TEXT NOT NULL,
    kind          TEXT NOT NULL,   -- transcribe | agent | analyze | report | doctor
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    audio_seconds REAL NOT NULL DEFAULT 0,
    cost_usd      REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage(usage_date);

  -- الأدمنز: حساب منفصل تمامًا عن المستخدمين العاديين (لوحة مراقبة المنصة)
  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    last_login    TEXT
  );

  -- ذاكرة دائمة عن الشخص: مين هو، بيدرس/بيشتغل إيه، أمراضه وأدويته المزمنة، تفضيلاته.
  -- (حاجات ثابتة مش يوميات) — عشان الـ agent يبقى عنده تصور عن المستخدم.
  CREATE TABLE IF NOT EXISTS profile_facts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    category    TEXT NOT NULL,   -- هوية | دراسة_وشغل | صحة | تفضيلات | علاقات | أخرى
    fact_key    TEXT NOT NULL,   -- مفتاح قصير ثابت (مثلاً: التخصص، مرض مزمن، حساسية)
    value       TEXT NOT NULL,   -- القيمة
    UNIQUE(user_id, fact_key)
  );
  CREATE INDEX IF NOT EXISTS idx_profile_user ON profile_facts(user_id);

  -- اشتراكات Web Push (PWA) — كل جهاز فعّل الإشعارات له صف.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    endpoint    TEXT UNIQUE NOT NULL,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

  -- إشعارات داخل التطبيق — بتتخزّن عشان تظهر في الجرس حتى لو المستخدم مش فاتح.
  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    url         TEXT,
    icon        TEXT,
    read_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);

  -- الأفكار: اللي في دماغ المستخدم — أفكار، حاجات ناوي يعملها، خطط. الـ agent بيطلّعها
  -- من كلامه، وممكن الفكرة تتحوّل لمهمة بمعاد (task_id).
  CREATE TABLE IF NOT EXISTS ideas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT,
    status      TEXT NOT NULL DEFAULT 'inbox', -- inbox | planned | done
    task_id     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas(user_id, id);

  -- المشاكل والهموم: حاجة مضايقة المستخدم وعايز يتخلص منها. الـ agent بيطلّعها من
  -- كلامه ويتابع حلّها (نشطة → بنشتغل عليها → اتحلّت).
  CREATE TABLE IF NOT EXISTS problems (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT,
    area        TEXT,            -- شغل | صحة | علاقات | نفسي | فلوس | أخرى
    status      TEXT NOT NULL DEFAULT 'active', -- active | working | resolved
    resolved_at TEXT,
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_problems_user ON problems(user_id, status, id);

  -- مركز الملفات: المستخدم بيرفع صورة (دوا/روشتة/تحليل/فاتورة...) والـ ai بيصنّفها
  -- ويحفظ وصف قصير، والملف نفسه على الديسك في path.
  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    user_id     INTEGER NOT NULL,
    filename    TEXT NOT NULL,
    mime        TEXT,
    size        INTEGER,
    category    TEXT,            -- دواء | روشتة | تحليل | أشعة | فاتورة | مستند | أخرى
    description TEXT,
    path        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, id);
`);

/* ===================== Migrations ===================== */

function hasColumn(table, col) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === col);
}
function addColumnIfMissing(table, col, def) {
  if (!hasColumn(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

// كل جداول البيانات بقت per-user
for (const t of ["entries", "finance", "health", "conversations", "goals", "conditions", "meals", "habits", "tasks", "ai_usage"]) {
  addColumnIfMissing(t, "user_id", "INTEGER");
}
addColumnIfMissing("health", "body_region", "TEXT");
addColumnIfMissing("finance", "category", "TEXT"); // أكل، مواصلات، فواتير...
addColumnIfMissing("users", "email", "TEXT");          // التسجيل بالإيميل
addColumnIfMissing("users", "password_hash", "TEXT");
addColumnIfMissing("tasks", "completed_at", "TEXT");
addColumnIfMissing("tasks", "reminded_at", "TEXT");
db.prepare(`UPDATE tasks SET status = 'pending' WHERE status = 'open'`).run();

const now = () => new Date().toISOString();

// تاريخ "النهاردة" بتوقيت المستخدم (القاهرة) مش UTC — عشان التدوين بعد نص الليل
export function localToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
export function localTime() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date());
}
const today = localToday;

/* ===================== Users ===================== */

const getUserByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
const insertUserStmt = db.prepare(
  `INSERT INTO users (created_at, chat_id, name, is_owner, last_seen) VALUES (?, ?, ?, ?, ?)`
);
const ownerStmt = db.prepare(`SELECT * FROM users WHERE is_owner = 1 ORDER BY id LIMIT 1`);

export function getUserById(id) {
  return getUserByIdStmt.get(Number(id)) || null;
}
// تحديث آخر ظهور — بيتنده مع كل نشاط فعلي للمستخدم (مهم للتذكيرات والمستخدمين النشطين)
const touchUserStmt = db.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`);
export function touchUser(id) {
  if (id) touchUserStmt.run(now(), Number(id));
}
export function ownerUser() {
  return ownerStmt.get() || null;
}
export function listUsers() {
  return db.prepare(`SELECT * FROM users ORDER BY id`).all();
}
// المستخدمين النشطين بس (آخر ظهور خلال N يوم) — للمبادرة (check-in اليومي + التأمّل الأسبوعي)
export function activeUsers(days = 14) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return db.prepare(`SELECT * FROM users WHERE last_seen >= ? ORDER BY id`).all(cutoff);
}

// المستخدمين النشطين اللي مسجّلوش أي يومية في تاريخ معيّن — لتذكير اليوميات اليومي
export function activeUsersWithoutEntry(date, days = 14) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return db
    .prepare(
      `SELECT u.* FROM users u
       WHERE u.last_seen >= ?
         AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.user_id = u.id AND e.entry_date = ?)
       ORDER BY u.id`
    )
    .all(cutoff, date);
}

/* ---- حسابات الإيميل ---- */

const getUserByEmailStmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
export function getUserByEmail(email) {
  if (!email) return null;
  return getUserByEmailStmt.get(String(email).trim().toLowerCase()) || null;
}

export function createEmailUser({ name, email, passwordHash }) {
  const cleanEmail = String(email).trim().toLowerCase();
  if (getUserByEmail(cleanEmail)) return null; // الإيميل مستخدم قبل كده
  const info = db
    .prepare(`INSERT INTO users (created_at, name, email, password_hash, last_seen) VALUES (?, ?, ?, ?, ?)`)
    .run(now(), name || null, cleanEmail, passwordHash, now());
  return getUserByIdStmt.get(Number(info.lastInsertRowid));
}

// bootstrap: نضمن وجود "صاحب" المنصة ونلحق البيانات القديمة (اللي من قبل multi-user) بيه
(function bootstrapOwner() {
  let owner = ownerStmt.get();
  if (!owner) {
    const info = insertUserStmt.run(now(), null, "Owner", 1, now());
    owner = getUserByIdStmt.get(Number(info.lastInsertRowid));
  }
  for (const t of ["entries", "finance", "health", "conversations", "goals", "conditions", "meals", "habits", "tasks", "ai_usage"]) {
    db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).run(owner.id);
  }
})();

/* ===================== Admins (حساب منفصل للوحة المنصة) ===================== */

export function getAdminByUsername(username) {
  if (!username) return null;
  return db.prepare(`SELECT * FROM admins WHERE username = ?`).get(String(username).trim().toLowerCase()) || null;
}
export function countAdmins() {
  return db.prepare(`SELECT COUNT(*) AS n FROM admins`).get().n;
}
export function createAdmin({ username, passwordHash }) {
  const u = String(username).trim().toLowerCase();
  if (!u || !passwordHash) return null;
  if (getAdminByUsername(u)) return null;
  const info = db.prepare(`INSERT INTO admins (created_at, username, password_hash) VALUES (?, ?, ?)`).run(now(), u, passwordHash);
  return db.prepare(`SELECT * FROM admins WHERE id = ?`).get(Number(info.lastInsertRowid));
}
export function touchAdminLogin(id) {
  db.prepare(`UPDATE admins SET last_login = ? WHERE id = ?`).run(now(), id);
}
export function getAdminById(id) {
  return db.prepare(`SELECT * FROM admins WHERE id = ?`).get(Number(id)) || null;
}

/* ===================== إحصائيات المنصة (للأدمن) ===================== */

// كل المستخدمين مع عدد بياناتهم في كل محور — لجدول لوحة الأدمن
export function listUsersWithStats() {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.last_seen, u.created_at, u.is_owner,
         (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = u.id) AS push,
         (SELECT COUNT(*) FROM entries e       WHERE e.user_id  = u.id) AS entries,
         (SELECT COUNT(*) FROM finance f       WHERE f.user_id  = u.id) AS finance,
         (SELECT COUNT(*) FROM health h        WHERE h.user_id  = u.id) AS health,
         (SELECT COUNT(*) FROM tasks t         WHERE t.user_id  = u.id) AS tasks,
         (SELECT COUNT(*) FROM goals g         WHERE g.user_id  = u.id) AS goals,
         (SELECT COUNT(*) FROM habits hb       WHERE hb.user_id = u.id) AS habits,
         (SELECT COUNT(*) FROM conversations c WHERE c.user_id  = u.id) AS conversations,
         (SELECT COALESCE(SUM(cost_usd),0) FROM ai_usage a WHERE a.user_id = u.id) AS ai_cost
       FROM users u
       ORDER BY u.last_seen IS NULL, u.last_seen DESC`
    )
    .all();
}

export function platformStats() {
  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  return {
    users: one(`SELECT COUNT(*) AS n FROM users`).n,
    with_push: one(`SELECT COUNT(DISTINCT user_id) AS n FROM push_subscriptions`).n,
    with_email: one(`SELECT COUNT(*) AS n FROM users WHERE email IS NOT NULL`).n,
    active_14d: one(`SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?`, cutoff).n,
    entries: one(`SELECT COUNT(*) AS n FROM entries`).n,
    finance: one(`SELECT COUNT(*) AS n FROM finance`).n,
    health: one(`SELECT COUNT(*) AS n FROM health`).n,
    tasks: one(`SELECT COUNT(*) AS n FROM tasks`).n,
    conversations: one(`SELECT COUNT(*) AS n FROM conversations`).n,
    ai_cost_total: one(`SELECT COALESCE(SUM(cost_usd),0) AS c FROM ai_usage`).c,
    ai_cost_month: one(`SELECT COALESCE(SUM(cost_usd),0) AS c FROM ai_usage WHERE usage_date >= ?`, today().slice(0, 8) + "01").c,
  };
}

/* ===================== Journal (يوميات) ===================== */

const journalForDayStmt = db.prepare(
  `SELECT * FROM entries WHERE user_id = ? AND entry_date = ? ORDER BY id DESC LIMIT 1`
);
const insertJournalStmt = db.prepare(`
  INSERT INTO entries (created_at, user_id, entry_date, mood, summary, tags, transcript, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateJournalStmt = db.prepare(`
  UPDATE entries SET mood = ?, summary = ?, tags = ?, transcript = ?, raw_json = ?
  WHERE id = ?
`);

// لو فيه تدوينة لنفس اليوم، نضيف عليها بدل ما نعمل واحدة جديدة
export function upsertJournalForDay({ userId, entryDate, mood, summary, tags, transcript, raw }) {
  const existing = journalForDayStmt.get(userId, entryDate);
  if (existing) {
    const mergedTranscript = `${existing.transcript}\n\n${transcript}`.trim();
    const mergedSummary = [existing.summary, summary].filter(Boolean).join(" — ");
    const mergedTags = [...new Set([...parseJson(existing.tags, []), ...(tags ?? [])])];
    updateJournalStmt.run(
      mood ?? existing.mood ?? null,
      mergedSummary || null,
      JSON.stringify(mergedTags),
      mergedTranscript,
      JSON.stringify(raw ?? {}),
      existing.id
    );
    return { id: existing.id, merged: true };
  }
  const info = insertJournalStmt.run(
    now(),
    userId,
    entryDate,
    mood ?? null,
    summary ?? null,
    JSON.stringify(tags ?? []),
    transcript,
    JSON.stringify(raw ?? {})
  );
  return { id: Number(info.lastInsertRowid), merged: false };
}

// تصحيح/تعديل نص يوميات يوم معيّن (استبدال كلمة/جملة) — للتعديل بالصوت
export function correctJournal(userId, date, find, replace) {
  if (!find) return { changed: false };
  const info = db
    .prepare(
      `UPDATE entries SET summary = REPLACE(summary, ?, ?)
       WHERE user_id = ? AND entry_date = ? AND summary LIKE '%' || ? || '%'`
    )
    .run(find, replace ?? "", userId, date, find);
  return { changed: info.changes > 0 };
}

const listEntriesStmt = db.prepare(
  `SELECT id, created_at, entry_date, mood, summary, tags, transcript
   FROM entries WHERE user_id = ? ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listEntries(userId, limit = 100) {
  return listEntriesStmt.all(userId, limit).map((r) => ({ ...r, tags: parseJson(r.tags, []) }));
}

const entriesSinceStmt = db.prepare(
  `SELECT entry_date, mood, summary, transcript
   FROM entries WHERE user_id = ? AND entry_date >= ? ORDER BY entry_date ASC, id ASC`
);
export function entriesSince(userId, dateStr) {
  return entriesSinceStmt.all(userId, dateStr);
}

export function deleteEntry(userId, id) {
  return db.prepare(`DELETE FROM entries WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== Finance (ماليات) ===================== */

export const FINANCE_CATEGORIES = [
  "أكل",
  "مواصلات",
  "فواتير",
  "صحة",
  "تسوق",
  "ترفيه",
  "بيت",
  "شغل",
  "تعليم",
  "أخرى",
];

// تطبيع نص للمقارنة (شيل المسافات الزيادة + حروف صغيرة) — لكشف التكرار.
export function normNote(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const insertFinanceStmt = db.prepare(`
  INSERT INTO finance (created_at, user_id, entry_date, direction, amount, currency, category, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const findDupFinanceStmt = db.prepare(
  `SELECT id, note FROM finance WHERE user_id = ? AND entry_date = ? AND direction = ? AND amount = ?`
);
export function addFinance({ userId, entryDate, direction, amount, currency, category, note }) {
  const eDate = entryDate || today();
  const dir = direction === "income" ? "income" : "expense";
  const amt = Number(amount) || 0;
  // حاجز تكرار: نفس اليوم + نفس الاتجاه + نفس المبلغ + ملاحظة مطابقة (بعد تطبيع) = نفس
  // القيد (من تسجيل صوتي تاني مثلاً) — نرجّع القديم بدل ما نكرّر. ملاحظة مختلفة = قيد مختلف.
  // بنمنع التكرار بس لما فيه ملاحظة فعلية مطابقة — عشان منخلطش مصروفين حقيقيين
  // بنفس المبلغ ومن غير وصف (دول بيفضلوا منفصلين).
  const nn = normNote(note);
  const existing = nn ? findDupFinanceStmt.all(userId, eDate, dir, amt).find((r) => normNote(r.note) === nn) : null;
  if (existing) return Number(existing.id);
  const info = insertFinanceStmt.run(
    now(),
    userId,
    eDate,
    dir,
    amt,
    currency || "جنيه",
    category && FINANCE_CATEGORIES.includes(category) ? category : category || "أخرى",
    note || null
  );
  return Number(info.lastInsertRowid);
}

const listFinanceStmt = db.prepare(
  `SELECT * FROM finance WHERE user_id = ? ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listFinance(userId, limit = 500) {
  return listFinanceStmt.all(userId, limit);
}

const financeSinceStmt = db.prepare(
  `SELECT * FROM finance WHERE user_id = ? AND entry_date >= ? ORDER BY entry_date ASC`
);
export function financeSince(userId, dateStr) {
  return financeSinceStmt.all(userId, dateStr);
}

const financeBetweenStmt = db.prepare(
  `SELECT * FROM finance WHERE user_id = ? AND entry_date >= ? AND entry_date <= ? ORDER BY entry_date ASC`
);
export function financeBetween(userId, from, to) {
  return financeBetweenStmt.all(userId, from, to);
}

export function deleteFinance(userId, id) {
  return db.prepare(`DELETE FROM finance WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== Health (صحة ونفسية) ===================== */

const insertHealthStmt = db.prepare(`
  INSERT INTO health (created_at, user_id, entry_date, at_time, category, detail, body_region)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
export function addHealth({ userId, entryDate, atTime, category, detail, bodyRegion }) {
  const info = insertHealthStmt.run(
    now(),
    userId,
    entryDate || today(),
    atTime || null,
    category || "ملاحظة",
    detail,
    bodyRegion || "عام"
  );
  return Number(info.lastInsertRowid);
}

const listHealthStmt = db.prepare(
  `SELECT * FROM health WHERE user_id = ? ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listHealth(userId, limit = 500) {
  return listHealthStmt.all(userId, limit);
}

const healthSinceStmt = db.prepare(
  `SELECT * FROM health WHERE user_id = ? AND entry_date >= ? ORDER BY entry_date ASC, id ASC`
);
export function healthSince(userId, dateStr) {
  return healthSinceStmt.all(userId, dateStr);
}

const entriesBetweenStmt = db.prepare(
  `SELECT * FROM entries WHERE user_id = ? AND entry_date >= ? AND entry_date <= ? ORDER BY entry_date ASC, id ASC`
);
export function entriesBetween(userId, from, to) {
  return entriesBetweenStmt.all(userId, from, to);
}

const mealsBetweenStmt = db.prepare(
  `SELECT * FROM meals WHERE user_id = ? AND entry_date >= ? AND entry_date <= ? ORDER BY entry_date ASC, id ASC`
);
export function mealsBetween(userId, from, to) {
  return mealsBetweenStmt.all(userId, from, to);
}

const healthBetweenStmt = db.prepare(
  `SELECT * FROM health WHERE user_id = ? AND entry_date >= ? AND entry_date <= ?
   ORDER BY entry_date ASC, id ASC`
);
export function healthBetween(userId, startDate, endDate) {
  return healthBetweenStmt.all(userId, startDate, endDate);
}

export function deleteHealth(userId, id) {
  return db.prepare(`DELETE FROM health WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== Goals (أهداف) ===================== */

const findGoalStmt = db.prepare(
  `SELECT * FROM goals WHERE user_id = ? AND title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertGoalStmt = db.prepare(`
  INSERT INTO goals (created_at, updated_at, user_id, title, target, current, unit, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateGoalStmt = db.prepare(`
  UPDATE goals SET updated_at = ?, title = ?, target = ?, current = ?, unit = ?, note = ?
  WHERE id = ?
`);

// منطق ذكي: لو الهدف موجود نحدّثه/نزوّد التقدّم، لو لأ ننشئه
export function applyGoal({ userId, title, target, addAmount, setCurrent, unit, note }) {
  if (!title) return null;
  const existing = findGoalStmt.get(userId, `%${title.trim()}%`);
  if (existing) {
    let current = existing.current;
    if (setCurrent != null) current = Number(setCurrent);
    if (addAmount != null) current += Number(addAmount);
    updateGoalStmt.run(
      now(),
      existing.title,
      target != null ? Number(target) : existing.target,
      current,
      unit || existing.unit,
      note || existing.note,
      existing.id
    );
    logGoalChange(userId, existing.id, current - existing.current, current, note || null);
    return {
      id: existing.id,
      created: false,
      title: existing.title,
      current,
      target: target != null ? Number(target) : existing.target,
      unit: unit || existing.unit,
    };
  }
  let current = 0;
  if (setCurrent != null) current = Number(setCurrent);
  if (addAmount != null) current += Number(addAmount);
  const info = insertGoalStmt.run(
    now(),
    now(),
    userId,
    title.trim(),
    target != null ? Number(target) : null,
    current,
    unit || null,
    note || null
  );
  logGoalChange(userId, Number(info.lastInsertRowid), current, current, note || "هدف جديد");
  return {
    id: Number(info.lastInsertRowid),
    created: true,
    title: title.trim(),
    current,
    target: target != null ? Number(target) : null,
    unit: unit || null,
  };
}

export function listGoals(userId) {
  return db.prepare(`SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC`).all(userId);
}
export function deleteGoal(userId, id) {
  return db.prepare(`DELETE FROM goals WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}
export function setGoalCurrent(userId, id, current) {
  const g = db.prepare(`SELECT current FROM goals WHERE user_id = ? AND id = ?`).get(userId, id);
  if (!g) return false;
  const ok =
    db
      .prepare(`UPDATE goals SET current = ?, updated_at = ? WHERE user_id = ? AND id = ?`)
      .run(Number(current), now(), userId, id).changes > 0;
  if (ok) logGoalChange(userId, id, Number(current) - g.current, Number(current), "تحديث يدوي");
  return ok;
}

const insertGoalLogStmt = db.prepare(
  `INSERT INTO goal_log (created_at, user_id, goal_id, delta, current_after, note) VALUES (?, ?, ?, ?, ?, ?)`
);
export function logGoalChange(userId, goalId, delta, currentAfter, note) {
  insertGoalLogStmt.run(now(), userId, goalId, delta == null ? null : Number(delta), Number(currentAfter), note || null);
}
export function goalLog(userId, goalId, limit = 60) {
  return db
    .prepare(
      `SELECT id, created_at, delta, current_after, note FROM goal_log
       WHERE user_id = ? AND goal_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(userId, goalId, limit);
}

/* ===================== Tasks (مهام + تقويم) ===================== */

const insertTaskStmt = db.prepare(`
  INSERT INTO tasks (created_at, user_id, title, due_date, due_time, note)
  VALUES (?, ?, ?, ?, ?, ?)
`);
export function addTask({ userId, title, dueDate, dueTime, note }) {
  if (!title) return null;
  const info = insertTaskStmt.run(
    now(),
    userId,
    title.trim(),
    dueDate || today(),
    dueTime || null,
    note || null
  );
  return getTask(userId, Number(info.lastInsertRowid));
}

export function getTask(userId, id) {
  return db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND id = ?`).get(userId, id) || null;
}

const listTasksStmt = db.prepare(
  `SELECT * FROM tasks WHERE user_id = ? AND due_date >= ? AND due_date <= ?
   ORDER BY due_date ASC, due_time IS NULL, due_time ASC, id ASC`
);
export function listTasks(userId, from, to) {
  return listTasksStmt.all(userId, from, to);
}

export function tasksForDate(userId, date) {
  return listTasksStmt.all(userId, date, date);
}

const pendingTasksStmt = db.prepare(
  `SELECT * FROM tasks WHERE user_id = ? AND status = 'pending'
   ORDER BY due_date ASC, due_time IS NULL, due_time ASC LIMIT ?`
);
export function pendingTasks(userId, limit = 50) {
  return pendingTasksStmt.all(userId, limit);
}

// الـ agent بيقفل مهمة بالاسم أو بالـ id
export function completeTask(userId, { id, title }) {
  let task = null;
  if (id) task = getTask(userId, Number(id));
  if (!task && title) {
    task = db
      .prepare(
        `SELECT * FROM tasks WHERE user_id = ? AND status = 'pending' AND title LIKE ? ORDER BY due_date ASC LIMIT 1`
      )
      .get(userId, `%${String(title).trim()}%`);
  }
  if (!task) return null;
  db.prepare(`UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ?`).run(now(), task.id);
  return getTask(userId, task.id);
}

export function reopenTask(userId, id) {
  return (
    db
      .prepare(`UPDATE tasks SET status = 'pending', completed_at = NULL WHERE user_id = ? AND id = ?`)
      .run(userId, id).changes > 0
  );
}

export function deleteTask(userId, id) {
  return db.prepare(`DELETE FROM tasks WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

// المهام اللي معادها دلوقتي ومحدش اتفكّر بيها — للتذكير (إشعار داخل التطبيق + موبايل)
const dueTasksStmt = db.prepare(`
  SELECT t.* FROM tasks t
  WHERE t.status = 'pending' AND t.reminded_at IS NULL
    AND t.due_date = ? AND t.due_time IS NOT NULL AND t.due_time <= ?
`);
export function dueTaskReminders(date, time) {
  return dueTasksStmt.all(date, time);
}
export function markTaskReminded(id) {
  db.prepare(`UPDATE tasks SET reminded_at = ? WHERE id = ?`).run(now(), id);
}

/* ===================== Conversations (ذاكرة المحادثة) ===================== */

const insertConvStmt = db.prepare(`
  INSERT INTO conversations (created_at, user_id, chat_id, kind, user_text, ai_reply, meta_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
export function logConversation({ userId, chatId, kind, userText, aiReply, meta }) {
  const info = insertConvStmt.run(
    now(),
    userId,
    chatId != null ? String(chatId) : null,
    kind || "text",
    userText || null,
    aiReply || null,
    meta ? JSON.stringify(meta) : null
  );
  return Number(info.lastInsertRowid);
}

const listConvStmt = db.prepare(
  `SELECT * FROM conversations WHERE user_id = ? ORDER BY id DESC LIMIT ?`
);
export function listConversations(userId, limit = 500) {
  return listConvStmt.all(userId, limit).map((r) => ({
    ...r,
    meta: parseJson(r.meta_json, null),
  }));
}

// آخر محادثات بترتيب زمني صاعد — دي ذاكرة الـ agent القصيرة
export function recentConversations(userId, limit = 10) {
  return listConvStmt.all(userId, limit).reverse();
}

export function deleteConversation(userId, id) {
  return (
    db.prepare(`DELETE FROM conversations WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0
  );
}

/* ===================== Conditions (متابعة حالة صحية) ===================== */

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

const findActiveConditionStmt = db.prepare(
  `SELECT * FROM conditions WHERE user_id = ? AND status = 'active' AND title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertConditionStmt = db.prepare(`
  INSERT INTO conditions (created_at, user_id, title, start_date, end_date, status, note)
  VALUES (?, ?, ?, ?, ?, 'active', ?)
`);

// لو فيه متابعة شغّالة لنفس الحالة منعملش تانية — نرجّعها زي ما هي
export function addCondition({ userId, title, startDate, durationDays = 30, note }) {
  if (!title) return null;
  const start = startDate || today();
  const existing = findActiveConditionStmt.get(userId, `%${title.trim()}%`);
  if (existing) {
    return { ...existing, created: false };
  }
  const end = addDays(start, durationDays);
  const info = insertConditionStmt.run(now(), userId, title.trim(), start, end, note || null);
  return {
    id: Number(info.lastInsertRowid),
    title: title.trim(),
    start_date: start,
    end_date: end,
    status: "active",
    note: note || null,
    created: true,
  };
}

export function listConditions(userId) {
  return db
    .prepare(`SELECT * FROM conditions WHERE user_id = ? ORDER BY status ASC, id DESC`)
    .all(userId);
}
export function activeConditions(userId) {
  return db
    .prepare(`SELECT * FROM conditions WHERE user_id = ? AND status = 'active' ORDER BY id DESC`)
    .all(userId);
}
export function getCondition(userId, id) {
  return db.prepare(`SELECT * FROM conditions WHERE user_id = ? AND id = ?`).get(userId, id);
}
export function closeCondition(userId, id) {
  return (
    db.prepare(`UPDATE conditions SET status = 'closed' WHERE user_id = ? AND id = ?`).run(userId, id)
      .changes > 0
  );
}
export function deleteCondition(userId, id) {
  return db.prepare(`DELETE FROM conditions WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== Meals (الأكل) ===================== */

const insertMealStmt = db.prepare(`
  INSERT INTO meals (created_at, user_id, entry_date, at_time, items, note)
  VALUES (?, ?, ?, ?, ?, ?)
`);
export function addMeal({ userId, entryDate, atTime, items, note }) {
  const info = insertMealStmt.run(now(), userId, entryDate || today(), atTime || null, items, note || null);
  return Number(info.lastInsertRowid);
}

export function listMeals(userId, limit = 500) {
  return db
    .prepare(`SELECT * FROM meals WHERE user_id = ? ORDER BY entry_date DESC, id DESC LIMIT ?`)
    .all(userId, limit);
}
export function deleteMeal(userId, id) {
  return db.prepare(`DELETE FROM meals WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== Habits (عادات) ===================== */

const findActiveHabitStmt = db.prepare(
  `SELECT * FROM habits WHERE user_id = ? AND status = 'active' AND title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertHabitStmt = db.prepare(`
  INSERT INTO habits (created_at, user_id, title, kind, emoji, note)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// لو العادة موجودة نرجّعها، لو لأ ننشئها
export function addHabit({ userId, title, kind = "do", emoji, note }) {
  if (!title) return null;
  const existing = findActiveHabitStmt.get(userId, `%${title.trim()}%`);
  if (existing) return { ...existing, created: false };
  const info = insertHabitStmt.run(
    now(),
    userId,
    title.trim(),
    kind === "quit" ? "quit" : "do",
    emoji || null,
    note || null
  );
  return {
    id: Number(info.lastInsertRowid),
    title: title.trim(),
    kind: kind === "quit" ? "quit" : "do",
    emoji: emoji || null,
    status: "active",
    note: note || null,
    created: true,
  };
}

export function findHabitByTitle(userId, title) {
  if (!title) return null;
  return findActiveHabitStmt.get(userId, `%${title.trim()}%`) || null;
}

const insertHabitLogStmt = db.prepare(`
  INSERT OR IGNORE INTO habit_logs (created_at, habit_id, log_date)
  VALUES (?, ?, ?)
`);
export function logHabit(habitId, logDate) {
  const date = logDate || today();
  const info = insertHabitLogStmt.run(now(), habitId, date);
  return { logged: info.changes > 0, date };
}

export function unlogHabit(habitId, logDate) {
  return (
    db.prepare(`DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?`).run(habitId, logDate)
      .changes > 0
  );
}

const habitLogsStmt = db.prepare(
  `SELECT log_date FROM habit_logs WHERE habit_id = ? ORDER BY log_date DESC`
);
function habitStreak(dates) {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date(today() + "T00:00:00Z");
  // لو النهاردة مش متسجّل، نبدأ نعدّ من امبارح (مايكسرش الستريك بدري)
  if (!set.has(d.toISOString().slice(0, 10))) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (set.has(iso)) {
      streak++;
      d.setUTCDate(d.getUTCDate() - 1);
    } else break;
  }
  return streak;
}

export function listHabits(userId) {
  return db
    .prepare(`SELECT * FROM habits WHERE user_id = ? AND status = 'active' ORDER BY id DESC`)
    .all(userId)
    .map((h) => {
      const dates = habitLogsStmt.all(h.id).map((r) => r.log_date);
      const todayISO = today();
      return {
        ...h,
        logs: dates,
        total: dates.length,
        streak: habitStreak(dates),
        doneToday: dates.includes(todayISO),
      };
    });
}

export function getHabit(userId, id) {
  return db.prepare(`SELECT * FROM habits WHERE user_id = ? AND id = ?`).get(userId, id);
}

export function deleteHabit(userId, id) {
  const habit = getHabit(userId, id);
  if (!habit) return false;
  db.prepare(`DELETE FROM habit_logs WHERE habit_id = ?`).run(id);
  return db.prepare(`DELETE FROM habits WHERE id = ?`).run(id).changes > 0;
}

/* ===================== AI usage (تكلفة OpenAI) ===================== */

const insertAiUsageStmt = db.prepare(`
  INSERT INTO ai_usage (created_at, user_id, usage_date, kind, model, input_tokens, output_tokens, audio_seconds, cost_usd)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
export function recordAiUsage({ userId, kind, model, inputTokens = 0, outputTokens = 0, audioSeconds = 0, costUsd = 0 }) {
  try {
    insertAiUsageStmt.run(
      now(),
      userId ?? null,
      today(),
      kind || "other",
      model || "?",
      Math.round(Number(inputTokens) || 0),
      Math.round(Number(outputTokens) || 0),
      Number(audioSeconds) || 0,
      Number(costUsd) || 0
    );
  } catch {
    // التتبّع ماينفعش يكسر السير الأساسي
  }
}

const usageTotalsStmt = db.prepare(`
  SELECT COUNT(*) AS calls,
         COALESCE(SUM(input_tokens), 0)  AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(audio_seconds), 0) AS audio_seconds,
         COALESCE(SUM(cost_usd), 0)      AS cost_usd,
         MIN(usage_date)                 AS since
  FROM ai_usage
`);
const usageByKindStmt = db.prepare(`
  SELECT kind, model,
         COUNT(*) AS calls,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COALESCE(SUM(input_tokens), 0)  AS input_tokens,
         COALESCE(SUM(output_tokens), 0) AS output_tokens,
         COALESCE(SUM(audio_seconds), 0) AS audio_seconds
  FROM ai_usage GROUP BY kind, model ORDER BY cost_usd DESC
`);
const usageDailyStmt = db.prepare(`
  SELECT usage_date,
         COALESCE(SUM(cost_usd), 0) AS cost_usd,
         COUNT(*) AS calls
  FROM ai_usage WHERE usage_date >= ? GROUP BY usage_date ORDER BY usage_date ASC
`);
const usageMonthStmt = db.prepare(`
  SELECT COALESCE(SUM(cost_usd), 0) AS cost_usd, COUNT(*) AS calls
  FROM ai_usage WHERE usage_date >= ?
`);

export function aiUsageSummary(days = 30) {
  const totals = usageTotalsStmt.get();
  const since = new Date(Date.now() - (Number(days) - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const monthStart = today().slice(0, 8) + "01";
  const month = usageMonthStmt.get(monthStart);
  return {
    totals,
    month,
    byKind: usageByKindStmt.all(),
    daily: usageDailyStmt.all(since),
  };
}

/* ===================== Web Push subscriptions ===================== */

const upsertPushStmt = db.prepare(`
  INSERT INTO push_subscriptions (created_at, user_id, endpoint, p256dh, auth)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
`);
export function savePushSubscription(userId, sub) {
  if (!userId || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return false;
  upsertPushStmt.run(now(), userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  return true;
}

const listPushByUserStmt = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id = ?`);
export function listPushSubscriptions(userId) {
  return listPushByUserStmt.all(userId);
}

const deletePushStmt = db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);
export function deletePushSubscription(endpoint) {
  if (endpoint) deletePushStmt.run(endpoint);
}

/* ===================== In-app notifications (الجرس) ===================== */

const insertNotifStmt = db.prepare(`
  INSERT INTO notifications (created_at, user_id, title, body, url, icon)
  VALUES (?, ?, ?, ?, ?, ?)
`);
export function addNotification(userId, { title, body = "", url = "/", icon = "🔔" } = {}) {
  if (!userId || !title) return null;
  const info = insertNotifStmt.run(now(), userId, title, body, url, icon);
  return Number(info.lastInsertRowid);
}

const listNotifStmt = db.prepare(`
  SELECT id, created_at, title, body, url, icon, read_at
  FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?
`);
export function listNotifications(userId, limit = 30) {
  return listNotifStmt.all(userId, limit);
}

const unreadCountStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`
);
export function unreadNotificationCount(userId) {
  return unreadCountStmt.get(userId).c;
}

const markAllReadStmt = db.prepare(
  `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`
);
const markOneReadStmt = db.prepare(
  `UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL`
);
export function markNotificationsRead(userId, id = null) {
  if (id) markOneReadStmt.run(now(), userId, id);
  else markAllReadStmt.run(now(), userId);
}

/* ===================== Profile facts (ذاكرة دائمة عن الشخص) ===================== */

const PROFILE_CATEGORIES = ["هوية", "دراسة_وشغل", "صحة", "تفضيلات", "علاقات", "أخرى"];

const upsertProfileFactStmt = db.prepare(`
  INSERT INTO profile_facts (created_at, updated_at, user_id, category, fact_key, value)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, fact_key) DO UPDATE SET
    value = excluded.value,
    category = excluded.category,
    updated_at = excluded.updated_at
`);

// بيضيف معلومة دائمة أو بيحدّثها لو المفتاح موجود (مثلاً "الوزن" بيتحدّث مش بيتكرر)
export function upsertProfileFact({ userId, category, key, value }) {
  if (!key || !value) return null;
  const cat = PROFILE_CATEGORIES.includes(category) ? category : "أخرى";
  const k = String(key).trim();
  const existed = db.prepare(`SELECT id FROM profile_facts WHERE user_id = ? AND fact_key = ?`).get(userId, k);
  upsertProfileFactStmt.run(now(), now(), userId, cat, k, String(value).trim());
  return { key: k, value: String(value).trim(), category: cat, created: !existed };
}

export function listProfileFacts(userId) {
  return db
    .prepare(`SELECT * FROM profile_facts WHERE user_id = ? ORDER BY category, id`)
    .all(userId);
}

export function deleteProfileFact(userId, id) {
  return db.prepare(`DELETE FROM profile_facts WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

// نسخة مختصرة للـ agent: { category: ["key: value", ...] }
export function profileForAgent(userId) {
  const rows = listProfileFacts(userId);
  const out = {};
  for (const r of rows) {
    (out[r.category] = out[r.category] || []).push(`${r.fact_key}: ${r.value}`);
  }
  return out;
}

/* ===================== Ideas (الأفكار — دماغك) ===================== */

const insertIdeaStmt = db.prepare(
  `INSERT INTO ideas (created_at, user_id, title, detail, status) VALUES (?, ?, ?, ?, ?)`
);
// للكشف عن فكرة مكررة: نقارن بالأفكار النشطة بس (مش المنتهية) — عشان فكرة قديمة خلصت
// مايمنعش فكرة جديدة بنفس العنوان.
const activeIdeasForDupStmt = db.prepare(
  `SELECT id, title FROM ideas WHERE user_id = ? AND status != 'done' ORDER BY id DESC LIMIT 200`
);
export function addIdea({ userId, title, detail, status }) {
  if (!title) return null;
  const t = String(title).trim();
  const nn = normNote(t);
  // مانكرّرش فكرة نشطة موجودة بنفس العنوان (بعد تطبيع) — حتى لو اتقالت في يوم تاني.
  const dup = activeIdeasForDupStmt.all(userId).find((i) => normNote(i.title) === nn);
  if (dup) return db.prepare(`SELECT * FROM ideas WHERE id = ?`).get(dup.id);
  const st = ["inbox", "planned", "done"].includes(status) ? status : "inbox";
  const info = insertIdeaStmt.run(now(), userId, t, detail || null, st);
  return db.prepare(`SELECT * FROM ideas WHERE id = ?`).get(Number(info.lastInsertRowid));
}
export function listIdeas(userId, limit = 200) {
  return db
    .prepare(`SELECT * FROM ideas WHERE user_id = ? ORDER BY status = 'done', id DESC LIMIT ?`)
    .all(userId, limit);
}
export function setIdeaStatus(userId, id, status) {
  if (!["inbox", "planned", "done"].includes(status)) return false;
  return db.prepare(`UPDATE ideas SET status = ? WHERE user_id = ? AND id = ?`).run(status, userId, id).changes > 0;
}
export function deleteIdea(userId, id) {
  return db.prepare(`DELETE FROM ideas WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}
// لقطة مختصرة للـ agent عشان مايكرّرش نفس الفكرة
export function recentIdeas(userId, limit = 12) {
  return db
    .prepare(`SELECT title, status FROM ideas WHERE user_id = ? ORDER BY id DESC LIMIT ?`)
    .all(userId, limit);
}

/* ===================== Problems (المشاكل والهموم — قلبك) ===================== */

export const PROBLEM_AREAS = ["شغل", "صحة", "علاقات", "نفسي", "فلوس", "أخرى"];

const findActiveProblemStmt = db.prepare(
  `SELECT * FROM problems WHERE user_id = ? AND status != 'resolved' AND title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertProblemStmt = db.prepare(
  `INSERT INTO problems (created_at, updated_at, user_id, title, detail, area, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`
);
// لو مشكلة شبه موجودة ونشطة، نرجّعها بدل ما نكرّرها
export function addProblem({ userId, title, detail, area }) {
  if (!title) return null;
  const t = String(title).trim();
  const existing = findActiveProblemStmt.get(userId, `%${t}%`);
  if (existing) return { ...existing, created: false };
  const ar = PROBLEM_AREAS.includes(area) ? area : "أخرى";
  const info = insertProblemStmt.run(now(), now(), userId, t, detail || null, ar);
  return { ...db.prepare(`SELECT * FROM problems WHERE id = ?`).get(Number(info.lastInsertRowid)), created: true };
}
export function listProblems(userId, limit = 200) {
  return db
    .prepare(
      `SELECT * FROM problems WHERE user_id = ?
       ORDER BY status = 'resolved', CASE status WHEN 'working' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, id DESC
       LIMIT ?`
    )
    .all(userId, limit);
}
export function activeProblems(userId) {
  return db
    .prepare(`SELECT * FROM problems WHERE user_id = ? AND status != 'resolved' ORDER BY id DESC`)
    .all(userId);
}
export function setProblemStatus(userId, id, status, note) {
  if (!["active", "working", "resolved"].includes(status)) return false;
  const resolvedAt = status === "resolved" ? now() : null;
  return (
    db
      .prepare(`UPDATE problems SET status = ?, resolved_at = ?, note = COALESCE(?, note), updated_at = ? WHERE user_id = ? AND id = ?`)
      .run(status, resolvedAt, note ?? null, now(), userId, id).changes > 0
  );
}
// الـ agent بيقفل/يحدّث مشكلة بالاسم أو الـ id
export function resolveProblem(userId, { id, title }) {
  let prob = null;
  if (id) prob = db.prepare(`SELECT * FROM problems WHERE user_id = ? AND id = ?`).get(userId, Number(id));
  if (!prob && title) prob = findActiveProblemStmt.get(userId, `%${String(title).trim()}%`);
  if (!prob) return null;
  setProblemStatus(userId, prob.id, "resolved");
  return db.prepare(`SELECT * FROM problems WHERE id = ?`).get(prob.id);
}
export function deleteProblem(userId, id) {
  return db.prepare(`DELETE FROM problems WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== Files (مركز الملفات) ===================== */

export const FILE_CATEGORIES = ["دواء", "روشتة", "تحليل", "أشعة", "فاتورة", "مستند", "أخرى"];

const insertFileStmt = db.prepare(
  `INSERT INTO files (created_at, user_id, filename, mime, size, category, description, path)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
export function addFile({ userId, filename, mime, size, category, description, path }) {
  const cat = FILE_CATEGORIES.includes(category) ? category : "أخرى";
  const info = insertFileStmt.run(now(), userId, filename, mime || null, Number(size) || 0, cat, description || null, path);
  return db.prepare(`SELECT * FROM files WHERE id = ?`).get(Number(info.lastInsertRowid));
}
export function listFiles(userId, limit = 300) {
  return db.prepare(`SELECT * FROM files WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(userId, limit);
}
export function getFile(userId, id) {
  return db.prepare(`SELECT * FROM files WHERE user_id = ? AND id = ?`).get(userId, id) || null;
}
export function deleteFile(userId, id) {
  return db.prepare(`DELETE FROM files WHERE user_id = ? AND id = ?`).run(userId, id).changes > 0;
}

/* ===================== تعديل عام لأي صف (مرونة التعديل) ===================== */
// بنحدّث الأعمدة المسموح بيها بس (allowlist ثابت — مفيش حقن SQL) لصف يخص المستخدم.
function updateOwned(table, allowedCols, userId, id, patch) {
  const sets = [];
  const vals = [];
  for (const col of allowedCols) {
    if (patch[col] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(patch[col]);
    }
  }
  if (!sets.length) return false;
  vals.push(Number(userId), Number(id));
  return db.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`).run(...vals).changes > 0;
}

export function updateFinance(userId, id, patch) {
  const p = { ...patch };
  if (p.amount !== undefined) p.amount = Number(p.amount) || 0;
  if (p.direction !== undefined) p.direction = p.direction === "income" ? "income" : "expense";
  if (p.category !== undefined && !FINANCE_CATEGORIES.includes(p.category)) p.category = p.category || "أخرى";
  return updateOwned("finance", ["entry_date", "direction", "amount", "category", "note"], userId, id, p);
}
export function updateHealth(userId, id, patch) {
  return updateOwned("health", ["entry_date", "category", "detail", "body_region"], userId, id, patch);
}
export function updateEntry(userId, id, patch) {
  return updateOwned("entries", ["entry_date", "mood", "summary"], userId, id, patch);
}
export function updateTaskFields(userId, id, patch) {
  const p = { ...patch };
  if (p.due_time === "") p.due_time = null;
  return updateOwned("tasks", ["title", "due_date", "due_time", "note"], userId, id, p);
}
export function updateMeal(userId, id, patch) {
  return updateOwned("meals", ["entry_date", "at_time", "items", "note"], userId, id, patch);
}
export function updateGoalMeta(userId, id, patch) {
  const p = { ...patch, updated_at: now() };
  if (p.target !== undefined) p.target = p.target === "" || p.target == null ? null : Number(p.target);
  return updateOwned("goals", ["title", "target", "unit", "updated_at"], userId, id, p);
}
export function updateIdeaFields(userId, id, patch) {
  return updateOwned("ideas", ["title", "detail"], userId, id, patch);
}
export function updateProblemFields(userId, id, patch) {
  const p = { ...patch, updated_at: now() };
  if (p.area !== undefined && !PROBLEM_AREAS.includes(p.area)) p.area = "أخرى";
  return updateOwned("problems", ["title", "detail", "area", "updated_at"], userId, id, p);
}
export function updateHabitFields(userId, id, patch) {
  const p = { ...patch };
  if (p.kind !== undefined) p.kind = p.kind === "quit" ? "quit" : "do";
  return updateOwned("habits", ["title", "kind", "emoji"], userId, id, p);
}

/* ===================== helpers ===================== */

function parseJson(s, fallback) {
  try {
    return JSON.parse(s || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export default db;
