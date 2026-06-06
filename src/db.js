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
    note        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_finance_date ON finance(entry_date);

  CREATE TABLE IF NOT EXISTS health (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    entry_date  TEXT NOT NULL,
    at_time     TEXT,
    category    TEXT,            -- دواء | عرض | ملاحظة
    detail      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_health_date ON health(entry_date);

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
`);

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
  INSERT INTO finance (created_at, entry_date, direction, amount, currency, note)
  VALUES (?, ?, ?, ?, ?, ?)
`);
export function addFinance({ entryDate, direction, amount, currency, note }) {
  const info = insertFinanceStmt.run(
    now(),
    entryDate,
    direction === "income" ? "income" : "expense",
    Number(amount) || 0,
    currency || "جنيه",
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

const delFinanceStmt = db.prepare(`DELETE FROM finance WHERE id = ?`);
export function deleteFinance(id) {
  return delFinanceStmt.run(id).changes > 0;
}

/* ===================== Health (صحة) ===================== */

const insertHealthStmt = db.prepare(`
  INSERT INTO health (created_at, entry_date, at_time, category, detail)
  VALUES (?, ?, ?, ?, ?)
`);
export function addHealth({ entryDate, atTime, category, detail }) {
  const info = insertHealthStmt.run(
    now(),
    entryDate,
    atTime || null,
    category || "ملاحظة",
    detail
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

/* ===================== helpers ===================== */

function parseJson(s, fallback) {
  try {
    return JSON.parse(s || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export default db;
