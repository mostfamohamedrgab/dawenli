import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);

db.exec(`
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
    category    TEXT,            -- بند المصروف (شخصي | بيت | عربية | أكل...)
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_finance_date ON finance(entry_date);

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    title       TEXT NOT NULL,
    due_date    TEXT,            -- YYYY-MM-DD أو null (من غير موعد)
    due_time    TEXT,            -- HH:MM أو null
    status      TEXT NOT NULL DEFAULT 'open',  -- open | done
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

  CREATE TABLE IF NOT EXISTS health (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    at_time     TEXT,
    category    TEXT,            -- تمرين | دواء | أكل | عرض | ملاحظة
    detail      TEXT NOT NULL,
    body_region TEXT             -- راس | صدر | معدة | بطن | ذراعين | ساقين | عام
  );
  CREATE INDEX IF NOT EXISTS idx_health_date ON health(entry_date);

  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    chat_id     TEXT,
    kind        TEXT,            -- voice | text | command
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
    title       TEXT NOT NULL,   -- اسم الحالة (مثلاً: ارتجاع مريئي)
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
    items       TEXT NOT NULL,   -- الأكل اللي اتقال
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

  CREATE TABLE IF NOT EXISTS ai_usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    usage_date    TEXT NOT NULL,   -- YYYY-MM-DD
    kind          TEXT NOT NULL,   -- transcribe | classify | reflect | analyze | doctor
    model         TEXT NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    audio_seconds REAL NOT NULL DEFAULT 0,
    cost_usd      REAL NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage(usage_date);
`);

// migration: نضيف body_region لجدول health القديم لو مش موجود
const healthCols = db.prepare(`PRAGMA table_info(health)`).all().map((c) => c.name);
if (!healthCols.includes("body_region")) {
  db.exec(`ALTER TABLE health ADD COLUMN body_region TEXT`);
}

// migration: نضيف category لجدول finance القديم لو مش موجود
const financeCols = db.prepare(`PRAGMA table_info(finance)`).all().map((c) => c.name);
if (!financeCols.includes("category")) {
  db.exec(`ALTER TABLE finance ADD COLUMN category TEXT`);
}

const now = () => new Date().toISOString();

/* ===================== Journal (يوميات) ===================== */

const journalForDayStmt = db.prepare(
  `SELECT * FROM entries WHERE entry_date = ? ORDER BY id DESC LIMIT 1`
);
const insertJournalStmt = db.prepare(`
  INSERT INTO entries (created_at, entry_date, mood, summary, tags, transcript, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateJournalStmt = db.prepare(`
  UPDATE entries SET mood = ?, summary = ?, tags = ?, transcript = ?, raw_json = ?
  WHERE id = ?
`);

// لو فيه تدوينة لنفس اليوم، نضيف عليها بدل ما نعمل واحدة جديدة
export function upsertJournalForDay({ entryDate, mood, summary, tags, transcript, raw }) {
  const existing = journalForDayStmt.get(entryDate);
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
    entryDate,
    mood ?? null,
    summary ?? null,
    JSON.stringify(tags ?? []),
    transcript,
    JSON.stringify(raw ?? {})
  );
  return { id: Number(info.lastInsertRowid), merged: false };
}

const listStmt = db.prepare(
  `SELECT id, created_at, entry_date, mood, summary, tags, transcript
   FROM entries ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listEntries(limit = 100) {
  return listStmt.all(limit).map((r) => ({ ...r, tags: parseJson(r.tags, []) }));
}

const rangeStmt = db.prepare(
  `SELECT entry_date, mood, summary, transcript
   FROM entries WHERE entry_date >= ? ORDER BY entry_date ASC, id ASC`
);
export function entriesSince(dateStr) {
  return rangeStmt.all(dateStr);
}

const delEntryStmt = db.prepare(`DELETE FROM entries WHERE id = ?`);
export function deleteEntry(id) {
  return delEntryStmt.run(id).changes > 0;
}

/* ===================== Finance (ماليات) ===================== */

const insertFinanceStmt = db.prepare(`
  INSERT INTO finance (created_at, entry_date, direction, amount, currency, category, note)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
export function addFinance({ entryDate, direction, amount, currency, category, note }) {
  const info = insertFinanceStmt.run(
    now(),
    entryDate,
    direction === "income" ? "income" : "expense",
    Number(amount) || 0,
    currency || "جنيه",
    category || null,
    note || null
  );
  return Number(info.lastInsertRowid);
}

const listFinanceStmt = db.prepare(
  `SELECT * FROM finance ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listFinance(limit = 500) {
  return listFinanceStmt.all(limit);
}

// البنود الموجودة (للمساعدة في التصنيف وعدم تكرار بنود متشابهة)
const financeCatsStmt = db.prepare(
  `SELECT category, COUNT(*) AS n FROM finance
   WHERE category IS NOT NULL AND category != '' AND direction = 'expense'
   GROUP BY category ORDER BY n DESC`
);
export function financeCategories() {
  return financeCatsStmt.all().map((r) => r.category);
}

const delFinanceStmt = db.prepare(`DELETE FROM finance WHERE id = ?`);
export function deleteFinance(id) {
  return delFinanceStmt.run(id).changes > 0;
}

/* ===================== Health (صحة) ===================== */

const insertHealthStmt = db.prepare(`
  INSERT INTO health (created_at, entry_date, at_time, category, detail, body_region)
  VALUES (?, ?, ?, ?, ?, ?)
`);
export function addHealth({ entryDate, atTime, category, detail, bodyRegion }) {
  const info = insertHealthStmt.run(
    now(),
    entryDate,
    atTime || null,
    category || "ملاحظة",
    detail,
    bodyRegion || "عام"
  );
  return Number(info.lastInsertRowid);
}

const listHealthStmt = db.prepare(
  `SELECT * FROM health ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listHealth(limit = 500) {
  return listHealthStmt.all(limit);
}

const delHealthStmt = db.prepare(`DELETE FROM health WHERE id = ?`);
export function deleteHealth(id) {
  return delHealthStmt.run(id).changes > 0;
}

const healthBetweenStmt = db.prepare(
  `SELECT * FROM health WHERE entry_date >= ? AND entry_date <= ?
   ORDER BY entry_date ASC, id ASC`
);
export function healthBetween(startDate, endDate) {
  return healthBetweenStmt.all(startDate, endDate);
}

/* ===================== Goals (أهداف) ===================== */

const findGoalStmt = db.prepare(
  `SELECT * FROM goals WHERE title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertGoalStmt = db.prepare(`
  INSERT INTO goals (created_at, updated_at, title, target, current, unit, note)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateGoalStmt = db.prepare(`
  UPDATE goals SET updated_at = ?, title = ?, target = ?, current = ?, unit = ?, note = ?
  WHERE id = ?
`);

// منطق ذكي: لو الهدف موجود نحدّثه/نزوّد التقدّم، لو لأ ننشئه
export function applyGoal({ title, target, addAmount, setCurrent, unit, note }) {
  if (!title) return null;
  const existing = findGoalStmt.get(`%${title.trim()}%`);
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
    return { id: existing.id, created: false, title: existing.title, current, target: target != null ? Number(target) : existing.target };
  }
  let current = 0;
  if (setCurrent != null) current = Number(setCurrent);
  if (addAmount != null) current += Number(addAmount);
  const info = insertGoalStmt.run(
    now(),
    now(),
    title.trim(),
    target != null ? Number(target) : null,
    current,
    unit || null,
    note || null
  );
  return { id: Number(info.lastInsertRowid), created: true, title: title.trim(), current, target: target != null ? Number(target) : null };
}

const listGoalsStmt = db.prepare(`SELECT * FROM goals ORDER BY id DESC`);
export function listGoals() {
  return listGoalsStmt.all();
}

const delGoalStmt = db.prepare(`DELETE FROM goals WHERE id = ?`);
export function deleteGoal(id) {
  return delGoalStmt.run(id).changes > 0;
}

const updateGoalCurrentStmt = db.prepare(
  `UPDATE goals SET current = ?, updated_at = ? WHERE id = ?`
);
export function setGoalCurrent(id, current) {
  return updateGoalCurrentStmt.run(Number(current), now(), id).changes > 0;
}

/* ===================== Conversations (سجل المحادثات) ===================== */

const insertConvStmt = db.prepare(`
  INSERT INTO conversations (created_at, chat_id, kind, user_text, ai_reply, meta_json)
  VALUES (?, ?, ?, ?, ?, ?)
`);
export function logConversation({ chatId, kind, userText, aiReply, meta }) {
  const info = insertConvStmt.run(
    now(),
    chatId != null ? String(chatId) : null,
    kind || "text",
    userText || null,
    aiReply || null,
    meta ? JSON.stringify(meta) : null
  );
  return Number(info.lastInsertRowid);
}

const listConvStmt = db.prepare(
  `SELECT * FROM conversations ORDER BY id DESC LIMIT ?`
);
export function listConversations(limit = 500) {
  return listConvStmt.all(limit).map((r) => ({
    ...r,
    meta: parseJson(r.meta_json, null),
  }));
}

const delConvStmt = db.prepare(`DELETE FROM conversations WHERE id = ?`);
export function deleteConversation(id) {
  return delConvStmt.run(id).changes > 0;
}

/* ===================== Conditions (متابعة حالة صحية) ===================== */

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

const findActiveConditionStmt = db.prepare(
  `SELECT * FROM conditions WHERE status = 'active' AND title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertConditionStmt = db.prepare(`
  INSERT INTO conditions (created_at, title, start_date, end_date, status, note)
  VALUES (?, ?, ?, ?, 'active', ?)
`);

// لو فيه متابعة شغّالة لنفس الحالة منعملش تانية — نرجّعها زي ما هي
export function addCondition({ title, startDate, durationDays = 30, note }) {
  if (!title) return null;
  const start = startDate || today();
  const existing = findActiveConditionStmt.get(`%${title.trim()}%`);
  if (existing) {
    return { ...existing, created: false };
  }
  const end = addDays(start, durationDays);
  const info = insertConditionStmt.run(now(), title.trim(), start, end, note || null);
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

const listConditionsStmt = db.prepare(
  `SELECT * FROM conditions ORDER BY status ASC, id DESC`
);
export function listConditions() {
  return listConditionsStmt.all();
}

const activeConditionsStmt = db.prepare(
  `SELECT * FROM conditions WHERE status = 'active' ORDER BY id DESC`
);
export function activeConditions() {
  return activeConditionsStmt.all();
}

const getConditionStmt = db.prepare(`SELECT * FROM conditions WHERE id = ?`);
export function getCondition(id) {
  return getConditionStmt.get(id);
}

const closeConditionStmt = db.prepare(
  `UPDATE conditions SET status = 'closed' WHERE id = ?`
);
export function closeCondition(id) {
  return closeConditionStmt.run(id).changes > 0;
}

const delConditionStmt = db.prepare(`DELETE FROM conditions WHERE id = ?`);
export function deleteCondition(id) {
  return delConditionStmt.run(id).changes > 0;
}

/* ===================== Meals (الأكل) ===================== */

const insertMealStmt = db.prepare(`
  INSERT INTO meals (created_at, entry_date, at_time, items, note)
  VALUES (?, ?, ?, ?, ?)
`);
export function addMeal({ entryDate, atTime, items, note }) {
  const info = insertMealStmt.run(
    now(),
    entryDate,
    atTime || null,
    items,
    note || null
  );
  return Number(info.lastInsertRowid);
}

const listMealsStmt = db.prepare(
  `SELECT * FROM meals ORDER BY entry_date DESC, id DESC LIMIT ?`
);
export function listMeals(limit = 500) {
  return listMealsStmt.all(limit);
}

const delMealStmt = db.prepare(`DELETE FROM meals WHERE id = ?`);
export function deleteMeal(id) {
  return delMealStmt.run(id).changes > 0;
}

/* ===================== Habits (عادات) ===================== */

const findActiveHabitStmt = db.prepare(
  `SELECT * FROM habits WHERE status = 'active' AND title LIKE ? ORDER BY id DESC LIMIT 1`
);
const insertHabitStmt = db.prepare(`
  INSERT INTO habits (created_at, title, kind, emoji, note)
  VALUES (?, ?, ?, ?, ?)
`);

// لو العادة موجودة نرجّعها، لو لأ ننشئها
export function addHabit({ title, kind = "do", emoji, note }) {
  if (!title) return null;
  const existing = findActiveHabitStmt.get(`%${title.trim()}%`);
  if (existing) return { ...existing, created: false };
  const info = insertHabitStmt.run(
    now(),
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

// نلاقي العادة بالاسم (للتسجيل اليومي من البوت)
export function findHabitByTitle(title) {
  if (!title) return null;
  return findActiveHabitStmt.get(`%${title.trim()}%`) || null;
}

const insertHabitLogStmt = db.prepare(`
  INSERT OR IGNORE INTO habit_logs (created_at, habit_id, log_date)
  VALUES (?, ?, ?)
`);
// نسجّل إن العادة اتعملت في يوم معيّن (مفيش تكرار لنفس اليوم)
export function logHabit(habitId, logDate) {
  const date = logDate || today();
  const info = insertHabitLogStmt.run(now(), habitId, date);
  return { logged: info.changes > 0, date };
}

const delHabitLogStmt = db.prepare(
  `DELETE FROM habit_logs WHERE habit_id = ? AND log_date = ?`
);
export function unlogHabit(habitId, logDate) {
  return delHabitLogStmt.run(habitId, logDate).changes > 0;
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

const listHabitsStmt = db.prepare(
  `SELECT * FROM habits WHERE status = 'active' ORDER BY id DESC`
);
export function listHabits() {
  return listHabitsStmt.all().map((h) => {
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

const getHabitStmt = db.prepare(`SELECT * FROM habits WHERE id = ?`);
export function getHabit(id) {
  return getHabitStmt.get(id);
}

const archiveHabitStmt = db.prepare(
  `UPDATE habits SET status = 'archived' WHERE id = ?`
);
export function archiveHabit(id) {
  return archiveHabitStmt.run(id).changes > 0;
}

const delHabitStmt = db.prepare(`DELETE FROM habits WHERE id = ?`);
const delHabitLogsStmt = db.prepare(`DELETE FROM habit_logs WHERE habit_id = ?`);
export function deleteHabit(id) {
  delHabitLogsStmt.run(id);
  return delHabitStmt.run(id).changes > 0;
}

/* ===================== AI usage (تكلفة OpenAI) ===================== */

const insertAiUsageStmt = db.prepare(`
  INSERT INTO ai_usage (created_at, usage_date, kind, model, input_tokens, output_tokens, audio_seconds, cost_usd)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
// بنسجّل كل نداء على OpenAI: التوكنز/الثواني والتكلفة بالدولار
export function recordAiUsage({ kind, model, inputTokens = 0, outputTokens = 0, audioSeconds = 0, costUsd = 0 }) {
  try {
    insertAiUsageStmt.run(
      now(),
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

/* ===================== Tasks (المهام + الجدول) ===================== */

const insertTaskStmt = db.prepare(`
  INSERT INTO tasks (created_at, title, due_date, due_time, status, note)
  VALUES (?, ?, ?, ?, 'open', ?)
`);
export function addTask({ title, dueDate, dueTime, note }) {
  if (!title) return null;
  const info = insertTaskStmt.run(
    now(),
    String(title).trim(),
    dueDate || null,
    dueTime || null,
    note || null
  );
  return {
    id: Number(info.lastInsertRowid),
    title: String(title).trim(),
    due_date: dueDate || null,
    due_time: dueTime || null,
    status: "open",
  };
}

// المهام مرتّبة: المفتوحة الأول حسب الموعد، واللي من غير موعد في الآخر، والمتعمّلة تحت
const listTasksStmt = db.prepare(`
  SELECT * FROM tasks
  ORDER BY (status = 'done') ASC, (due_date IS NULL) ASC,
           due_date ASC, due_time ASC, id DESC
`);
export function listTasks() {
  return listTasksStmt.all();
}

const setTaskStatusStmt = db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`);
export function setTaskStatus(id, status) {
  return setTaskStatusStmt.run(status === "done" ? "done" : "open", id).changes > 0;
}

const getTaskStmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
export function getTask(id) {
  return getTaskStmt.get(id);
}

// تعديل عنوان/موعد المهمة (نسيب أي حقل مش متبعت زي ما هو)
const updateTaskStmt = db.prepare(
  `UPDATE tasks SET title = ?, due_date = ?, due_time = ?, note = ? WHERE id = ?`
);
export function updateTask(id, { title, dueDate, dueTime, note } = {}) {
  const t = getTaskStmt.get(id);
  if (!t) return false;
  updateTaskStmt.run(
    title != null && String(title).trim() ? String(title).trim() : t.title,
    dueDate !== undefined ? dueDate || null : t.due_date,
    dueTime !== undefined ? dueTime || null : t.due_time,
    note !== undefined ? note || null : t.note,
    id
  );
  return true;
}

const delTaskStmt = db.prepare(`DELETE FROM tasks WHERE id = ?`);
export function deleteTask(id) {
  return delTaskStmt.run(id).changes > 0;
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
