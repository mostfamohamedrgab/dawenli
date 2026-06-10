import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    chat_id     TEXT UNIQUE,
    name        TEXT,
    is_owner    INTEGER NOT NULL DEFAULT 0,
    last_seen   TEXT
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
for (const t of ["entries", "finance", "health", "conversations", "goals", "conditions", "meals", "habits", "ai_usage"]) {
  addColumnIfMissing(t, "user_id", "INTEGER");
}
addColumnIfMissing("health", "body_region", "TEXT");
addColumnIfMissing("finance", "category", "TEXT"); // أكل، مواصلات، فواتير...

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

const getUserByChatIdStmt = db.prepare(`SELECT * FROM users WHERE chat_id = ?`);
const getUserByIdStmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
const insertUserStmt = db.prepare(
  `INSERT INTO users (created_at, chat_id, name, is_owner, last_seen) VALUES (?, ?, ?, ?, ?)`
);
const touchUserStmt = db.prepare(`UPDATE users SET last_seen = ?, name = COALESCE(?, name) WHERE id = ?`);
const ownerStmt = db.prepare(`SELECT * FROM users WHERE is_owner = 1 ORDER BY id LIMIT 1`);

export function getUserByChatId(chatId) {
  return getUserByChatIdStmt.get(String(chatId)) || null;
}
export function getUserById(id) {
  return getUserByIdStmt.get(Number(id)) || null;
}
export function ensureUser(chatId, name) {
  const existing = getUserByChatId(chatId);
  if (existing) {
    touchUserStmt.run(now(), name || null, existing.id);
    return getUserByIdStmt.get(existing.id);
  }
  const isOwner = config.allowedChatId && String(chatId) === config.allowedChatId ? 1 : 0;
  const info = insertUserStmt.run(now(), String(chatId), name || null, isOwner, now());
  return getUserByIdStmt.get(Number(info.lastInsertRowid));
}
export function ownerUser() {
  return ownerStmt.get() || null;
}
export function listUsers() {
  return db.prepare(`SELECT * FROM users ORDER BY id`).all();
}

// bootstrap: نضمن وجود "صاحب" المنصة ونلحق البيانات القديمة (اللي من قبل multi-user) بيه
(function bootstrapOwner() {
  let owner = ownerStmt.get();
  if (!owner) {
    if (config.allowedChatId) {
      const existing = getUserByChatId(config.allowedChatId);
      if (existing) {
        db.prepare(`UPDATE users SET is_owner = 1 WHERE id = ?`).run(existing.id);
        owner = getUserByIdStmt.get(existing.id);
      } else {
        const info = insertUserStmt.run(now(), config.allowedChatId, "Owner", 1, now());
        owner = getUserByIdStmt.get(Number(info.lastInsertRowid));
      }
    } else {
      const info = insertUserStmt.run(now(), null, "Owner", 1, now());
      owner = getUserByIdStmt.get(Number(info.lastInsertRowid));
    }
  }
  for (const t of ["entries", "finance", "health", "conversations", "goals", "conditions", "meals", "habits", "ai_usage"]) {
    db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`).run(owner.id);
  }
})();

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

const insertFinanceStmt = db.prepare(`
  INSERT INTO finance (created_at, user_id, entry_date, direction, amount, currency, category, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
export function addFinance({ userId, entryDate, direction, amount, currency, category, note }) {
  const info = insertFinanceStmt.run(
    now(),
    userId,
    entryDate || today(),
    direction === "income" ? "income" : "expense",
    Number(amount) || 0,
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
  return (
    db
      .prepare(`UPDATE goals SET current = ?, updated_at = ? WHERE user_id = ? AND id = ?`)
      .run(Number(current), now(), userId, id).changes > 0
  );
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

// المهام اللي معادها دلوقتي ومحدش اتفكّر بيها — للتذكير من البوت
const dueTasksStmt = db.prepare(`
  SELECT t.*, u.chat_id FROM tasks t JOIN users u ON u.id = t.user_id
  WHERE t.status = 'pending' AND t.reminded_at IS NULL
    AND t.due_date = ? AND t.due_time IS NOT NULL AND t.due_time <= ?
    AND u.chat_id IS NOT NULL
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
         COALESCE(SUM(output_tokens), 0) AS output_tokens
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

/* ===================== helpers ===================== */

function parseJson(s, fallback) {
  try {
    return JSON.parse(s || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export default db;
