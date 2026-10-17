/* ===================== 💼 الشغل (مشاريع · عملاء · رعايات · محتوى · فريق) =====================
   كل فلوس الشغل بقت في دوّنلي نفسه بدل الماكينة:
   - المشاريع والعملاء والفريق جداول هنا. المشاريع اللي اتنقلت من الماكينة محتفظة بنفس الـ id
     (machine = 1)، فالدفعات الجديدة عليها لسه بتتبعت للماكينة زي الأول (machine.js).
   - الدفعات نفسها = قيود عادية في جدول finance مربوطة بـ project_id / sponsor_id / work_cat —
     يعني بتظهر في «الفلوس» زي أي دخل، ومفيش رقم بيتكتب مرتين.
   - work_history = تاريخ المحتوى القديم (٢٠٢٤–٢٠٢٥، قبل ما دوّنلي يبدأ). منفصل عن finance عشان
     مايلعبش في رصيدك ولا أهدافك؛ بيظهر في تقرير المحتوى بس.
   - الصفحة دي لصاحب الشغل بس (config.workUserId) — أي مستخدم تاني مايشوفهاش ولا يوصل للـ API. */

import db, { normCurKey } from "./db.js";
import { config } from "./config.js";

export const workOn = (userId) => !!config.workUserId && Number(userId) === config.workUserId;

export const STAGES = {
  lead: "عميل محتمل", meeting: "اجتماع", proposal: "عرض سعر", won: "اتفقنا",
  delivering: "شغالين", delivered: "اتسلّم", lost: "خسرناه",
};
export const SPONSOR_STATUS = {
  talking: "بنتكلم", agreed: "اتفقنا", filming: "بيتصوّر", published: "اتنشر", paid: "اتدفع", cancelled: "اتلغى",
};
// بنود المحتوى/الشغل اللي مش مشروع برمجي
export const WORK_CATS = [
  "رعايات", "ريفيوهات", "أدسنس", "كورسات", "مشاريع", "مونتاج", "بودكاست", "معدّات",
  "سوفتوير", "أدوات واشتراكات", "إعلانات", "فريلانسرز", "مرتبات", "أخرى",
];

/* ===== الجداول ===== */
db.exec(`
  CREATE TABLE IF NOT EXISTS work_clients (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL,
    phone TEXT, country TEXT, source TEXT, note TEXT, created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS work_projects (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, client_id TEXT, title TEXT NOT NULL,
    stage TEXT DEFAULT 'lead', value REAL DEFAULT 0, currency TEXT DEFAULT 'EGP',
    billing TEXT DEFAULT '', monthly REAL DEFAULT 0, deadline TEXT, started_at TEXT,
    team TEXT, source TEXT, note TEXT, logo TEXT, extras TEXT,
    archived INTEGER DEFAULT 0, machine INTEGER DEFAULT 0, pos REAL DEFAULT 0,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS work_staff (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, role TEXT,
    salary REAL DEFAULT 0, currency TEXT DEFAULT 'EGP', phone TEXT, note TEXT, rules TEXT,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sponsorships (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, brand TEXT NOT NULL,
    amount REAL DEFAULT 0, currency TEXT DEFAULT 'USD', status TEXT DEFAULT 'agreed',
    video_title TEXT, video_url TEXT, agreed_at TEXT, publish_at TEXT, note TEXT,
    created_at TEXT, updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS work_history (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, entry_date TEXT, direction TEXT,
    amount REAL, currency TEXT, work_cat TEXT, note TEXT, sponsor_id INTEGER, project_id TEXT,
    created_at TEXT
  );
`);
{
  const cols = db.prepare(`PRAGMA table_info(finance)`).all().map((c) => c.name);
  if (!cols.includes("sponsor_id")) db.exec(`ALTER TABLE finance ADD COLUMN sponsor_id INTEGER`);
  if (!cols.includes("work_cat")) db.exec(`ALTER TABLE finance ADD COLUMN work_cat TEXT`);
}

const now = () => new Date().toISOString();
const newId = (p) => `${p}${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
const str = (v, n = 400) => (v == null ? "" : String(v).trim().slice(0, n));

/* ===== العملات ===== */
export function fxRates() {
  return { EGP: 1, USD: config.machineUsdRate || 50, EUR: 54, SAR: 13.3333, AED: 13.6147, GBP: 63 };
}
export function convert(amount, from, to) {
  const fx = fxRates();
  const a = Number(amount) || 0;
  const f = normCurKey(from || "جنيه"), t = normCurKey(to || "EGP");
  if (f === t) return a;
  const rf = fx[f], rt = fx[t];
  if (!rf || !rt) return a;
  return (a * rf) / rt;
}
const r2 = (x) => Math.round(x * 100) / 100;

/* ===== CRUD ===== */
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

export function saveClient(userId, b) {
  const id = str(b.id, 60) || newId("c");
  const ex = db.prepare(`SELECT id FROM work_clients WHERE id = ? AND user_id = ?`).get(id, userId);
  const row = { name: str(b.name, 160), phone: str(b.phone, 60), country: str(b.country, 60), source: str(b.source, 120), note: str(b.note, 600) };
  if (!row.name) throw new Error("اسم العميل مطلوب");
  if (ex) db.prepare(`UPDATE work_clients SET name=@name, phone=@phone, country=@country, source=@source, note=@note, updated_at=@t WHERE id=@id AND user_id=@u`).run({ ...row, t: now(), id, u: userId });
  else db.prepare(`INSERT INTO work_clients (id, user_id, name, phone, country, source, note, created_at, updated_at) VALUES (@id,@u,@name,@phone,@country,@source,@note,@t,@t)`).run({ ...row, id, u: userId, t: now() });
  return id;
}
export function listWorkClients(userId) {
  return db.prepare(`SELECT id, name FROM work_clients WHERE user_id = ?`).all(userId);
}
export function deleteClient(userId, id) {
  const used = db.prepare(`SELECT COUNT(*) n FROM work_projects WHERE user_id = ? AND client_id = ?`).get(userId, id).n;
  if (used) throw new Error("العميل ده عليه مشاريع — شيلها أو غيّر عميلها الأول");
  return db.prepare(`DELETE FROM work_clients WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
}

const PROJECT_KEYS = ["client_id", "title", "stage", "value", "currency", "billing", "monthly", "deadline", "started_at", "team", "source", "note", "extras", "archived"];
export function saveProject(userId, b) {
  const id = str(b.id, 60) || newId("p");
  const ex = db.prepare(`SELECT * FROM work_projects WHERE id = ? AND user_id = ?`).get(id, userId);
  const v = pick(b, PROJECT_KEYS);
  const row = {
    client_id: str(v.client_id ?? ex?.client_id, 60) || null,
    title: str(v.title ?? ex?.title, 200),
    stage: STAGES[v.stage] ? v.stage : ex?.stage || "lead",
    value: num(v.value ?? ex?.value),
    currency: normCurKey(v.currency ?? ex?.currency ?? "EGP") || "EGP",
    billing: (v.billing ?? ex?.billing) === "monthly" ? "monthly" : "",
    monthly: num(v.monthly ?? ex?.monthly),
    deadline: str(v.deadline ?? ex?.deadline, 10),
    started_at: str(v.started_at ?? ex?.started_at, 10),
    team: str(v.team ?? ex?.team, 200),
    source: str(v.source ?? ex?.source, 120),
    note: str(v.note ?? ex?.note, 1000),
    extras: typeof v.extras === "string" ? v.extras : v.extras ? JSON.stringify(v.extras) : ex?.extras || "[]",
    archived: v.archived != null ? (v.archived ? 1 : 0) : ex?.archived || 0,
  };
  if (!row.title) throw new Error("اسم المشروع مطلوب");
  if (ex) db.prepare(`UPDATE work_projects SET client_id=@client_id, title=@title, stage=@stage, value=@value, currency=@currency, billing=@billing, monthly=@monthly, deadline=@deadline, started_at=@started_at, team=@team, source=@source, note=@note, extras=@extras, archived=@archived, updated_at=@t WHERE id=@id AND user_id=@u`).run({ ...row, t: now(), id, u: userId });
  else db.prepare(`INSERT INTO work_projects (id, user_id, client_id, title, stage, value, currency, billing, monthly, deadline, started_at, team, source, note, extras, archived, machine, created_at, updated_at) VALUES (@id,@u,@client_id,@title,@stage,@value,@currency,@billing,@monthly,@deadline,@started_at,@team,@source,@note,@extras,@archived,0,@t,@t)`).run({ ...row, id, u: userId, t: now() });
  // اسم المشروع اتغيّر → القيود المربوطة بيه تاخد الاسم الجديد
  db.prepare(`UPDATE finance SET project_title = ? WHERE user_id = ? AND project_id = ?`).run(row.title, userId, id);
  return id;
}
export function deleteProject(userId, id) {
  const used = db.prepare(`SELECT COUNT(*) n FROM finance WHERE user_id = ? AND project_id = ?`).get(userId, id).n;
  if (used) throw new Error("المشروع ده عليه دفعات — أرشفه بدل ما تمسحه");
  return db.prepare(`DELETE FROM work_projects WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
}
export function getProject(userId, id) {
  return db.prepare(`SELECT * FROM work_projects WHERE id = ? AND user_id = ?`).get(id, userId) || null;
}

export function saveSponsorship(userId, b) {
  const id = Number(b.id) || 0;
  const ex = id ? db.prepare(`SELECT * FROM sponsorships WHERE id = ? AND user_id = ?`).get(id, userId) : null;
  const row = {
    brand: str(b.brand ?? ex?.brand, 120),
    amount: num(b.amount ?? ex?.amount),
    currency: normCurKey(b.currency ?? ex?.currency ?? "USD") || "USD",
    status: SPONSOR_STATUS[b.status] ? b.status : ex?.status || "agreed",
    video_title: str(b.video_title ?? ex?.video_title, 200),
    video_url: str(b.video_url ?? ex?.video_url, 400),
    agreed_at: str(b.agreed_at ?? ex?.agreed_at, 10),
    publish_at: str(b.publish_at ?? ex?.publish_at, 10),
    note: str(b.note ?? ex?.note, 1000),
  };
  if (!row.brand) throw new Error("اسم البراند مطلوب");
  if (ex) {
    db.prepare(`UPDATE sponsorships SET brand=@brand, amount=@amount, currency=@currency, status=@status, video_title=@video_title, video_url=@video_url, agreed_at=@agreed_at, publish_at=@publish_at, note=@note, updated_at=@t WHERE id=@id AND user_id=@u`).run({ ...row, t: now(), id, u: userId });
    return id;
  }
  return Number(db.prepare(`INSERT INTO sponsorships (user_id, brand, amount, currency, status, video_title, video_url, agreed_at, publish_at, note, created_at, updated_at) VALUES (@u,@brand,@amount,@currency,@status,@video_title,@video_url,@agreed_at,@publish_at,@note,@t,@t)`).run({ ...row, u: userId, t: now() }).lastInsertRowid);
}
export function deleteSponsorship(userId, id) {
  db.prepare(`UPDATE finance SET sponsor_id = NULL WHERE user_id = ? AND sponsor_id = ?`).run(userId, id);
  db.prepare(`UPDATE work_history SET sponsor_id = NULL WHERE user_id = ? AND sponsor_id = ?`).run(userId, id);
  return db.prepare(`DELETE FROM sponsorships WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
}

export function saveStaff(userId, b) {
  const id = str(b.id, 60) || newId("s");
  const ex = db.prepare(`SELECT * FROM work_staff WHERE id = ? AND user_id = ?`).get(id, userId);
  const rules = b.rules == null ? ex?.rules || "[]" : typeof b.rules === "string" ? b.rules : JSON.stringify(b.rules);
  const row = {
    name: str(b.name ?? ex?.name, 120), role: str(b.role ?? ex?.role, 120),
    salary: num(b.salary ?? ex?.salary), currency: normCurKey(b.currency ?? ex?.currency ?? "EGP") || "EGP",
    phone: str(b.phone ?? ex?.phone, 60), note: str(b.note ?? ex?.note, 600), rules,
  };
  if (!row.name) throw new Error("الاسم مطلوب");
  if (ex) db.prepare(`UPDATE work_staff SET name=@name, role=@role, salary=@salary, currency=@currency, phone=@phone, note=@note, rules=@rules, updated_at=@t WHERE id=@id AND user_id=@u`).run({ ...row, t: now(), id, u: userId });
  else db.prepare(`INSERT INTO work_staff (id, user_id, name, role, salary, currency, phone, note, rules, created_at, updated_at) VALUES (@id,@u,@name,@role,@salary,@currency,@phone,@note,@rules,@t,@t)`).run({ ...row, id, u: userId, t: now() });
  return id;
}
export function deleteStaff(userId, id) {
  return db.prepare(`DELETE FROM work_staff WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
}

// تصنيف قيد: رعاية معيّنة و/أو بند محتوى (المشروع بيتربط من setFinanceProject عشان مزامنة الماكينة)
export function setFinanceWork(userId, financeId, { sponsorId, workCat }) {
  const sets = [], vals = [];
  if (sponsorId !== undefined) { sets.push("sponsor_id = ?"); vals.push(Number(sponsorId) || null); }
  if (workCat !== undefined) { sets.push("work_cat = ?"); vals.push(WORK_CATS.includes(workCat) ? workCat : null); }
  if (!sets.length) return false;
  return db.prepare(`UPDATE finance SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`).run(...vals, userId, financeId).changes > 0;
}

/* ===== الحسابات ===== */
const nz = (s) => String(s || "").replace(/\s+/g, "").replace(/[أإآ]/g, "ا");

// مرتب موظف عنده قاعدة توزيع → بيتقسم على مشاريعه بالنسب (أحدث قاعدة بدأت قبل تاريخ القيد)
function salarySplit(staff, f) {
  if (f.direction !== "expense" || !/مرتب|راتب|salary/i.test(f.note || "")) return null;
  const n = nz(f.note);
  for (const s of staff) {
    if (!s.name || !n.includes(nz(s.name))) continue;
    let rules = [];
    try { rules = JSON.parse(s.rules || "[]"); } catch {}
    const rule = rules.filter((r) => (r.from || "") <= f.entry_date).sort((a, b) => (a.from < b.from ? 1 : -1))[0];
    if (rule && rule.split && Object.keys(rule.split).length) return { staff: s.name, split: rule.split };
  }
  return null;
}

export function workSummary(userId) {
  // الشغّال الأول، وبعدين اللي اتفقنا عليه، وبعدين المحتمل، وفي الآخر اللي اتسلّم
  const ORDER = { delivering: 0, won: 1, proposal: 2, meeting: 3, lead: 4, delivered: 5, lost: 6 };
  const projects = db.prepare(`SELECT * FROM work_projects WHERE user_id = ? ORDER BY pos DESC, created_at DESC`).all(userId)
    .sort((a, b) => (a.archived - b.archived) || ((ORDER[a.stage] ?? 9) - (ORDER[b.stage] ?? 9)));
  const clients = db.prepare(`SELECT * FROM work_clients WHERE user_id = ? ORDER BY name`).all(userId);
  const staff = db.prepare(`SELECT * FROM work_staff WHERE user_id = ? ORDER BY name`).all(userId);
  const sponsors = db.prepare(`SELECT * FROM sponsorships WHERE user_id = ? ORDER BY COALESCE(NULLIF(agreed_at,''), created_at) DESC, id DESC`).all(userId);
  const fin = db.prepare(`SELECT * FROM finance WHERE user_id = ? AND (project_id IS NOT NULL OR sponsor_id IS NOT NULL OR work_cat IS NOT NULL OR category = 'شغل') ORDER BY entry_date DESC, id DESC`).all(userId);
  const hist = db.prepare(`SELECT * FROM work_history WHERE user_id = ? ORDER BY entry_date DESC, id DESC`).all(userId);
  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));

  // تكلفة كل مشروع (بعد توزيع المرتبات)
  const pay = {}; // id → { income:[], expense:[] }
  const bucket = (id) => (pay[id] ||= { income: [], expense: [], shares: [] });
  for (const f of fin) {
    if (!f.project_id) continue;
    if (f.direction === "income") { bucket(f.project_id).income.push(f); continue; }
    const sp = salarySplit(staff, f);
    if (sp) {
      for (const [pid, pct] of Object.entries(sp.split)) {
        bucket(pid).shares.push({ ...f, amount: (Number(f.amount) * Number(pct)) / 100, split_from: f.project_id !== pid ? f.project_title : "", pct: Number(pct) });
      }
    } else bucket(f.project_id).expense.push(f);
  }

  const outProjects = projects.map((p) => {
    const b = pay[p.id] || { income: [], expense: [], shares: [] };
    const cur = p.currency || "EGP";
    const collected = b.income.reduce((s, f) => s + convert(f.amount, f.currency, cur), 0);
    const spent = [...b.expense, ...b.shares].reduce((s, f) => s + convert(f.amount, f.currency, cur), 0);
    const monthly = p.billing === "monthly";
    const total = monthly ? collected : Math.max(Number(p.value) || 0, collected);
    let extras = [];
    try { extras = JSON.parse(p.extras || "[]"); } catch {}
    return {
      ...p, extras, client_name: clientName[p.client_id] || "", stage_label: STAGES[p.stage] || p.stage,
      collected: r2(collected), spent: r2(spent), profit: r2(collected - spent),
      due: monthly ? 0 : r2(Math.max(0, total - collected)), total: r2(total),
      payments: [...b.income, ...b.expense, ...b.shares].sort((a, c) => (a.entry_date < c.entry_date ? 1 : -1)).map(slimFin),
    };
  });

  // عام (مصاريف شغل مش تبع مشروع)
  const general = fin.filter((f) => f.project_id === "general").map(slimFin);

  // الرعايات: المدفوع = قيود دوّنلي + التاريخ القديم المربوط بيها
  const sp = {};
  for (const f of [...fin, ...hist]) if (f.sponsor_id) (sp[f.sponsor_id] ||= []).push(f);
  const outSponsors = sponsors.map((s) => {
    const rows = sp[s.id] || [];
    const paid = rows.filter((f) => f.direction === "income").reduce((a, f) => a + convert(f.amount, f.currency, s.currency), 0);
    return { ...s, status_label: SPONSOR_STATUS[s.status] || s.status, paid: r2(paid), remaining: r2(Math.max(0, (Number(s.amount) || 0) - paid)), payments: rows.map(slimFin) };
  });

  // تقرير المحتوى/الشغل: كل حركة (دوّنلي + القديم) بالبند والسنة — بالدولار والجنيه
  const content = [];
  for (const f of fin) {
    const cat = f.work_cat || (f.sponsor_id ? "رعايات" : f.project_id === "general" ? (/إعلان|اعلان|فيس|facebook|ads/i.test(f.note || "") ? "إعلانات" : "أدوات واشتراكات") : f.project_id ? "مشاريع" : null);
    if (cat) content.push({ ...slimFin(f), cat, src: "dawenli" });
  }
  for (const h of hist) content.push({ ...slimFin(h), cat: h.work_cat || "أخرى", src: "history" });
  const report = {};
  for (const r of content) {
    const y = String(r.entry_date || "").slice(0, 4) || "—";
    const k = `${y}|${r.cat}`;
    const o = (report[k] ||= { year: y, cat: r.cat, income: 0, expense: 0, count: 0 });
    o[r.direction === "income" ? "income" : "expense"] += convert(r.amount, r.currency, "EGP");
    o.count++;
  }

  // دخل شغل مش متصنّف لسه (category شغل ومفيش مشروع/رعاية/بند)
  const unlinked = fin.filter((f) => !f.project_id && !f.sponsor_id && !f.work_cat).map(slimFin);

  const totals = { collected: 0, due: 0, spent: 0, pipeline: 0 };
  for (const p of outProjects) {
    if (p.archived || p.stage === "lost") continue;
    const k = (x) => convert(x, p.currency, "EGP");
    if (["lead", "meeting", "proposal"].includes(p.stage)) totals.pipeline += k(p.value);
    totals.collected += k(p.collected); totals.due += k(p.due); totals.spent += k(p.spent);
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k]);
  const sponsorTotals = {
    paid: Math.round(outSponsors.reduce((a, s) => a + convert(s.paid, s.currency, "EGP"), 0)),
    open: Math.round(outSponsors.filter((s) => !["paid", "cancelled"].includes(s.status)).reduce((a, s) => a + convert(s.remaining, s.currency, "EGP"), 0)),
    count: outSponsors.length,
  };

  return {
    stages: STAGES, sponsorStatus: SPONSOR_STATUS, workCats: WORK_CATS, fx: fxRates(),
    projects: outProjects, clients, staff: staff.map((s) => ({ ...s, rules: safeJson(s.rules) })),
    sponsors: outSponsors, general, content: content.slice(0, 600), report: Object.values(report).sort((a, b) => (a.year < b.year ? 1 : a.year > b.year ? -1 : b.income - a.income)),
    unlinked, totals, sponsorTotals,
  };
}
const safeJson = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };
function slimFin(f) {
  return {
    id: f.id, entry_date: f.entry_date, direction: f.direction, amount: r2(Number(f.amount) || 0), currency: f.currency,
    note: f.note || "", project_id: f.project_id || null, project_title: f.project_title || "", sponsor_id: f.sponsor_id || null,
    work_cat: f.work_cat || null, ...(f.split_from !== undefined ? { split_from: f.split_from, pct: f.pct } : {}),
    ...(f.machine_sync !== undefined ? { machine_sync: f.machine_sync } : {}),
  };
}

// للـ agent والربط: المشاريع الشغّالة (من غير الخسرانة والمؤرشفة)
export function activeProjects(userId) {
  const staff = db.prepare(`SELECT name, rules FROM work_staff WHERE user_id = ?`).all(userId);
  const auto = new Set(staff.filter((s) => safeJson(s.rules).length).map((s) => nz(s.name)));
  const clients = Object.fromEntries(db.prepare(`SELECT id, name FROM work_clients WHERE user_id = ?`).all(userId).map((c) => [c.id, c.name]));
  const s = workSummary(userId);
  return s.projects
    .filter((p) => p.stage !== "lost" && !p.archived)
    .map((p) => ({
      id: p.id, title: p.title, client: clients[p.client_id] || "", stage: p.stage, currency: p.currency || "EGP",
      value: Number(p.value) || 0, collected: p.collected, monthly: p.billing === "monthly" ? Number(p.monthly) || 0 : 0,
      team: String(p.team || "").slice(0, 120),
      team_auto: String(p.team || "").split(/[،,]/).map((x) => x.trim()).filter((x) => x && auto.has(nz(x))).join("، "),
      note: String(p.note || "").slice(0, 80), machine: !!p.machine,
    }));
}
// الرعايات اللي لسه مفتوحة (للـ agent: يربط الدفعة بيها)
export function openSponsorships(userId) {
  return workSummary(userId).sponsors
    .filter((s) => s.status !== "cancelled" && (s.status !== "paid" || s.remaining > 0))
    .slice(0, 30)
    .map((s) => ({ id: s.id, brand: s.brand, amount: s.amount, currency: s.currency, status: s.status, paid: s.paid, video: s.video_title || "" }));
}
