/* ===================== صفحات الشغل (نسخة من صفحات الماكينة بالظبط) =====================
   /projects  = «💼 العملاء والمشاريع» — مشاريع البرمجة: دفعات، مصاريف، إعلانات فيسبوك، فريق، عملاء.
   /content   = «💸 ماليات المحتوى» — رعايات القناة ومصاريف المحتوى (مونتاج، معدّات…) بالدولار.
   الصفحتين متنقلين من الماكينة زي ما هما (public/projects.html و content-money.html)، والـ API هنا
   بيرجّع نفس شكل /api/work و /api/finance بتاعة الماكينة — بس البيانات من دوّنلي:
   كل حركة = قيد في finance (project_id = deal_id، work_cat = الفئة)، فبتظهر في «الفلوس» كمان. */

import db, { getFinance, addFinanceChecked, deleteFinance, setFinanceProject, normCurKey } from "./db.js";
import { syncFinance, forgetFinance } from "./machine.js";
import { config } from "./config.js";

const GEN = "general";
const OPEN_STAGES = ["lead", "meeting", "proposal"];
const LIVE_STAGES = ["won", "delivering", "delivered"];
const STAGES = ["lead", "meeting", "proposal", "won", "delivering", "delivered", "lost"];

{
  const cols = db.prepare(`PRAGMA table_info(work_projects)`).all().map((c) => c.name);
  for (const [c, def] of [["deposit", "REAL DEFAULT 0"], ["deposit_at", "TEXT DEFAULT ''"], ["tasks", "TEXT DEFAULT ''"],
    ["next_action", "TEXT DEFAULT ''"], ["next_date", "TEXT DEFAULT ''"]])
    if (!cols.includes(c)) db.exec(`ALTER TABLE work_projects ADD COLUMN ${c} ${def}`);
}

const now = () => new Date().toISOString();
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const nm = (s) => String(s || "").replace(/\s+/g, "");
const teamList = (t) => String(t || "").split(/[،,]/).map((x) => x.trim()).filter(Boolean);
const AR_CUR = { EGP: "جنيه", USD: "دولار", EUR: "يورو", SAR: "ريال", AED: "درهم" };

/* ===== العملات (نفس أسعار الماكينة) ===== */
export function FX() {
  const usd = config.machineUsdRate || 50;
  return { EGP: 1, USD: usd, SAR: Math.round((usd / 3.75) * 1e4) / 1e4, AED: Math.round((usd / 3.6725) * 1e4) / 1e4, EUR: Math.round(usd * 1.08 * 100) / 100 };
}
const fxOf = (cur) => FX()[String(cur || "EGP").toUpperCase()] || 1;
function conv(amount, from, to) {
  const f = normCurKey(from || "جنيه"), t = normCurKey(to || "EGP");
  const a = Number(amount) || 0;
  if (f === t) return a;
  const fx = FX();
  if (!fx[f] || !fx[t]) return a;
  return (a * fx[f]) / fx[t];
}
const SYM = { USD: "$", EGP: "ج", EUR: "€", SAR: " ريال", AED: " درهم" };

/* ===== حركات المشاريع بشكل الماكينة ===== */
function projCat(f) {
  if (f.work_cat) return f.work_cat;
  if (f.direction === "income") return "دفعة";
  if (/مرتب|راتب|salary/i.test(f.note || "")) return "مرتبات";
  if (f.project_id === GEN) return /إعلان|اعلان|فيس|facebook|ads/i.test(f.note || "") ? "إعلانات" : "أدوات واشتراكات";
  return "مصروف";
}
// القيد بعملة المشروع (زي ما الماكينة كانت بتخزّنه)، والمبلغ الأصلي في الملاحظة لو اتحوّل
function toMachineRow(f, dealCur) {
  const cur = f.project_id === GEN ? "EGP" : dealCur || "EGP";
  const from = normCurKey(f.currency || "جنيه");
  const amt = conv(f.amount, from, cur);
  const conv_ = from !== normCurKey(cur) ? ` (${Number(f.amount).toLocaleString("en-US")}${SYM[from] || " " + from} بسعر ${fxOf(from) / fxOf(cur)})` : "";
  return {
    id: String(f.id), dt: f.entry_date, kind: f.direction, category: projCat(f), amount: r2(amt),
    note: `${(f.note || "").replace(/\s*·\s*من الماكينة$/, "")}${conv_}`, deal_id: f.project_id,
    created_at: f.created_at, updated_at: f.created_at,
  };
}
function projectFin(userId) {
  const deals = Object.fromEntries(db.prepare(`SELECT id, currency FROM work_projects WHERE user_id = ?`).all(userId).map((d) => [d.id, d.currency]));
  return db.prepare(`SELECT * FROM finance WHERE user_id = ? AND project_id IS NOT NULL ORDER BY entry_date DESC, id DESC`).all(userId)
    .filter((f) => f.project_id === GEN || deals[f.project_id] !== undefined)
    .map((f) => toMachineRow(f, deals[f.project_id]));
}
export function financeRows(userId) {
  return { rows: projectFin(userId) };
}

/* ===== التجديد الشهري ===== */
function monthDates(start, until, ahead = 0) {
  const m0 = /^(\d{4})-(\d{2})-(\d{2})/.exec(start || "");
  if (!m0) return [];
  let y = +m0[1], m = +m0[2];
  const d = +m0[3];
  const out = [];
  let extra = 0;
  while (out.length <= 600) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dt = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    if (dt > until) {
      if (extra >= ahead) return out;
      extra++;
    }
    out.push(dt);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
const parseJ = (s) => { try { const a = JSON.parse(s || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };

function allocRules(raw) {
  const out = [];
  for (const r of parseJ(typeof raw === "string" ? raw : JSON.stringify(raw || []))) {
    if (!r || typeof r !== "object" || !String(r.from || "").slice(0, 10)) continue;
    const sp = Object.fromEntries(Object.entries(r.split || {}).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => v > 0));
    if (Object.keys(sp).length) out.push({ from: String(r.from).slice(0, 10), split: sp });
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

function allocSalaries(dls, fin, stf) {
  const rules = stf.map((s) => [s, allocRules(s.rules)]).filter(([s, r]) => r.length && nm(s.name));
  if (!rules.length) return 0;
  const by = Object.fromEntries(dls.map((d) => [d.id, d]));
  const live = (d) => LIVE_STAGES.includes(d.stage);
  let corr = 0;
  for (const f of fin) {
    if (f.kind === "income" || !by[f.deal_id]) continue;
    const note = nm(f.note);
    const hit = rules.find(([s]) => note.includes(nm(s.name)));
    if (!hit) continue;
    let rule = null;
    for (const r of hit[1]) if (r.from <= String(f.dt || "").slice(0, 10)) rule = r;
    if (!rule) continue;
    const split = Object.fromEntries(Object.entries(rule.split).filter(([k]) => by[k]));
    const tot = Object.values(split).reduce((a, v) => a + v, 0);
    const keys = Object.keys(split);
    if (tot <= 0 || (keys.length === 1 && keys[0] === f.deal_id)) continue;
    const src = by[f.deal_id];
    const amt = Number(f.amount) || 0;
    const egp = amt * fxOf(src.currency);
    src.spent = r2(src.spent - amt); src.profit = r2(src.profit + amt);
    src.staff_out = r2((src.staff_out || 0) + egp);
    for (const [did, pct] of Object.entries(split)) {
      const d = by[did]; const share = (egp * pct) / tot; const loc = share / fxOf(d.currency);
      d.spent = r2(d.spent + loc); d.profit = r2(d.profit - loc);
      d.staff_in = r2((d.staff_in || 0) + share);
      corr += share * ((live(src) ? 1 : 0) - (live(d) ? 1 : 0));
    }
  }
  return r2(corr);
}

const isAd = (f) => /إعلان|اعلان|فيس|facebook|meta|ads/i.test(`${f.category || ""} ${f.note || ""}`);
const isFbSrc = (s) => /فيس|face|fb|meta|إعلان|اعلان/i.test(s || "");

/* ===== /api/work بنفس شكل الماكينة ===== */
export function workList(userId) {
  const cls = db.prepare(`SELECT * FROM work_clients WHERE user_id = ? ORDER BY name`).all(userId);
  const dls = db.prepare(`SELECT * FROM work_projects WHERE user_id = ? ORDER BY created_at DESC`).all(userId)
    .map((d) => ({ ...d, archived: d.archived ? "1" : "", client_id: d.client_id || "" }));
  const stf = db.prepare(`SELECT * FROM work_staff WHERE user_id = ? ORDER BY name`).all(userId);
  const fin = projectFin(userId);
  const today = now().slice(0, 10);

  const agg = {}, last = {};
  for (const f of fin) {
    const a = (agg[f.deal_id] ||= { income: 0, expense: 0, moves: 0 });
    a[f.kind === "income" ? "income" : "expense"] += Number(f.amount) || 0;
    a.moves++;
    const t = [String(f.updated_at || ""), String(f.created_at || ""), String(f.dt || "")].sort().pop();
    if (t > (last[f.deal_id] || "")) last[f.deal_id] = t;
  }
  const names = Object.fromEntries(cls.map((x) => [x.id, x.name]));
  for (const d of dls) {
    d.last_act = [String(d.created_at || ""), String(d.started_at || ""), last[d.id] || ""].sort().pop();
    const a = agg[d.id] || { income: 0, expense: 0, moves: 0 };
    let val = Number(d.value) || 0;
    const mon = Number(d.monthly) || 0;
    const start = String(d.started_at || d.deposit_at || "").slice(0, 10);
    if (d.billing === "monthly" && mon > 0 && start) {
      const dates = monthDates(start, today, 1);
      const dueN = dates.length - 1;
      val = r2(dueN * mon);
      d.months_due = dueN;
      d.months_paid = Math.floor((a.income + 0.01) / mon);
      d.next_bill = dates[dates.length - 1] || "";
    } else d.billing = "";
    const ex = parseJ(d.extras);
    d.base_value = val;
    d.extras_total = r2(ex.reduce((s, x) => s + (Number(x?.amount) || 0), 0));
    val = r2(val + d.extras_total);
    d.value = val;
    d.client_name = names[d.client_id] || "";
    d.spent = r2(a.expense);
    d.collected = r2(a.income);
    d.moves = a.moves;
    d.profit = r2(val - a.expense);
    d.due = r2(val - a.income);
    d.late = !!(d.next_date && d.next_date < today && !["delivered", "lost"].includes(d.stage));
  }

  // المصاريف العامة + إعلانات فيسبوك (بتتوزّع بالتساوي على مشاريع الإعلان)
  const gen = fin.filter((f) => f.deal_id === GEN && f.kind !== "income");
  const genTotal = r2(gen.reduce((s, f) => s + (Number(f.amount) || 0), 0));
  let byCat = {};
  for (const f of gen) { const k = (f.category || "غير مصنّف").trim(); byCat[k] = r2((byCat[k] || 0) + Number(f.amount)); }
  const ads = r2(gen.filter(isAd).reduce((s, f) => s + Number(f.amount), 0));
  const fbDeals = dls.filter((d) => isFbSrc(d.source) && LIVE_STAGES.includes(d.stage));
  const fbValue = r2(fbDeals.reduce((s, d) => s + (Number(d.value) || 0), 0));
  const fbAlloc = dls.filter((d) => isFbSrc(d.source) && d.stage !== "lost");
  const adsSplit = [];
  let adsNonlive = 0, adGen = 0;
  if (ads > 0 && fbAlloc.length) {
    const share = r2(ads / fbAlloc.length);
    for (const d of fbAlloc) {
      const loc = r2(share / fxOf(d.currency));
      d.ad_share = share;
      d.spent = r2(d.spent + loc); d.profit = r2(d.profit - loc);
      adsSplit.push({ id: d.id, title: d.title || "", share });
      if (!LIVE_STAGES.includes(d.stage)) adsNonlive += share;
    }
    adGen = ads;
    byCat = {};
    for (const f of gen) if (!isAd(f)) { const k = (f.category || "غير مصنّف").trim(); byCat[k] = r2((byCat[k] || 0) + Number(f.amount)); }
  }
  const genRest = r2(genTotal - adGen);
  const salCorr = allocSalaries(dls, fin, stf);
  const staff = stf.map((x) => ({ ...x, alloc: JSON.stringify(allocRules(x.rules)), rules: allocRules(x.rules) }));
  const live = dls.filter((d) => LIVE_STAGES.includes(d.stage));
  for (const x of cls) {
    const mine = dls.filter((d) => d.client_id === x.id);
    x.deals = mine.length;
    x.total = r2(mine.reduce((s, d) => s + (Number(d.value) || 0), 0));
  }
  const sum = (arr, f) => r2(arr.reduce((s, d) => s + f(d), 0));
  return {
    clients: cls, deals: dls, staff, stages: STAGES,
    totals: {
      pipeline: sum(dls.filter((d) => OPEN_STAGES.includes(d.stage)), (d) => (Number(d.value) || 0) * fxOf(d.currency)),
      won: sum(live, (d) => (Number(d.value) || 0) * fxOf(d.currency)),
      collected: sum(dls, (d) => d.collected * fxOf(d.currency)),
      spent: r2(sum(dls, (d) => d.spent * fxOf(d.currency)) + genRest),
      profit: r2(sum(live, (d) => d.profit * fxOf(d.currency)) - genRest - adsNonlive - salCorr),
      due: sum(live, (d) => d.due * fxOf(d.currency)),
      late: dls.filter((d) => d.late).length, clients: cls.length, deals: dls.length,
    },
    fx: FX(),
    general: {
      total: genRest, by_cat: byCat, ads, ads_split: adsSplit, ads_nonlive: r2(adsNonlive),
      ads_clients: fbDeals.length, ads_value: fbValue,
      cost_per_client: fbDeals.length ? r2(ads / fbDeals.length) : 0, roas: ads ? r2(fbValue / ads) : 0,
    },
    unlinked: unlinkedWork(userId),
  };
}

// دخل/مصروف شغل في «الفلوس» مش مربوط بمشروع ولا بند محتوى — يتربط من الصفحة
function unlinkedWork(userId) {
  return db.prepare(`SELECT id, entry_date dt, direction kind, amount, currency, note FROM finance
    WHERE user_id = ? AND project_id IS NULL AND sponsor_id IS NULL AND category = 'شغل' AND (work_cat IS NULL OR work_cat = 'مشاريع')
    ORDER BY entry_date DESC`).all(userId);
}

/* ===== الحفظ (نفس سلوك الماكينة) ===== */
const DEAL_FIELDS = ["client_id", "title", "stage", "value", "currency", "deposit", "deposit_at", "deadline", "next_action", "next_date",
  "note", "tasks", "logo", "source", "started_at", "archived", "extras", "billing", "monthly", "team", "pos"];
const NUMS = new Set(["value", "deposit", "monthly", "salary", "pos"]);

function merge(table, fields, it, prefix, userId) {
  const rid = String(it.id || "").trim() || `${prefix}${Date.now()}`;
  const old = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(rid, userId) || {};
  const v = {};
  for (const f of fields) {
    const raw = f in it ? it[f] : old[f];
    v[f] = NUMS.has(f) ? Number(raw) || 0 : String(raw ?? "").trim();
  }
  if (table === "work_projects") v.archived = v.archived && v.archived !== "0" ? 1 : 0;
  if (old.id) {
    db.prepare(`UPDATE ${table} SET ${fields.map((f) => `${f} = @${f}`).join(", ")}, updated_at = @t WHERE id = @id AND user_id = @u`)
      .run({ ...v, t: now(), id: rid, u: userId });
  } else {
    db.prepare(`INSERT INTO ${table} (id, user_id, ${fields.join(", ")}, created_at, updated_at) VALUES (@id, @u, ${fields.map((f) => "@" + f).join(", ")}, @t, @t)`)
      .run({ ...v, id: rid, u: userId, t: now() });
  }
  return { rid, v, old };
}

export function clientSave(userId, it) {
  return merge("work_clients", ["name", "phone", "country", "source", "note"], it, "c", userId).rid;
}
export function clientDelete(userId, id) {
  const n = db.prepare(`SELECT COUNT(*) n FROM work_projects WHERE user_id = ? AND client_id = ?`).get(userId, id).n;
  if (n) throw new Error(`العميل ده عنده ${n} مشروع — امسحهم الأول`);
  db.prepare(`DELETE FROM work_clients WHERE id = ? AND user_id = ?`).run(id, userId);
}

export async function dealSave(userId, it) {
  if (!String(it.started_at || "").trim() && !it.id) it = { ...it, started_at: now().slice(0, 10) };
  const { rid, v, old } = merge("work_projects", DEAL_FIELDS, it, "d", userId);
  db.prepare(`UPDATE finance SET project_title = ? WHERE user_id = ? AND project_id = ?`).run(v.title, userId, rid);
  // العربون اتعلّم إنه اتدفع دلوقتي → يتقيّد مرة واحدة
  if (v.deposit_at && !old.deposit_at && v.deposit > 0) {
    const dup = projectFin(userId).find((f) => f.deal_id === rid && (f.category === "عربون" || (f.kind === "income" && Math.abs(f.amount - v.deposit) < 0.01)));
    if (!dup) await finSave(userId, { deal_id: rid, kind: "income", category: "عربون", amount: v.deposit, dt: v.deposit_at, note: `عربون ${v.title}` });
  }
  return rid;
}
export async function dealDelete(userId, id) {
  // الحركات ماتتمسحش — بتتفكّ من المشروع بس (وتفضل في «الفلوس»)
  for (const f of db.prepare(`SELECT id FROM finance WHERE user_id = ? AND project_id = ?`).all(userId, id)) {
    setFinanceProject(userId, f.id, { projectId: null });
    await syncFinance(userId, f.id).catch(() => {});
  }
  db.prepare(`DELETE FROM work_projects WHERE id = ? AND user_id = ?`).run(id, userId);
}
export function dealsOrder(userId, ids) {
  db.prepare(`UPDATE work_projects SET pos = 0 WHERE user_id = ?`).run(userId);
  (ids || []).forEach((id, i) => db.prepare(`UPDATE work_projects SET pos = ? WHERE id = ? AND user_id = ?`).run(i + 1, String(id), userId));
}

export function staffSave(userId, it) {
  const rules = Array.isArray(it.alloc) ? allocRules(it.alloc) : undefined;
  const old = db.prepare(`SELECT * FROM work_staff WHERE id = ? AND user_id = ?`).get(String(it.id || ""), userId) || {};
  const rid = String(it.id || "").trim() || `s${Date.now()}`;
  const v = {
    name: String(it.name ?? old.name ?? "").trim(), role: String(it.role ?? old.role ?? "").trim(),
    salary: Number(it.salary ?? old.salary) || 0, phone: String(it.phone ?? old.phone ?? "").trim(),
    note: String(it.note ?? old.note ?? ""), rules: rules ? JSON.stringify(rules) : old.rules || "[]",
  };
  if (old.id) db.prepare(`UPDATE work_staff SET name=@name, role=@role, salary=@salary, phone=@phone, note=@note, rules=@rules, updated_at=@t WHERE id=@id AND user_id=@u`).run({ ...v, t: now(), id: rid, u: userId });
  else db.prepare(`INSERT INTO work_staff (id, user_id, name, role, salary, currency, phone, note, rules, created_at, updated_at) VALUES (@id,@u,@name,@role,@salary,'EGP',@phone,@note,@rules,@t,@t)`).run({ ...v, id: rid, u: userId, t: now() });
  // فريق المشاريع: اسمه يتحط في المشاريع اللي اتعلّمت ويتشال من الباقي، ولو الاسم اتغيّر يتغيّر في كل الفرق
  const nw = v.name, prev = old.name || "";
  if (nw && ("projects" in it || (prev && nm(prev) !== nm(nw)))) {
    const want = "projects" in it ? new Set(it.projects || []) : null;
    for (const d of db.prepare(`SELECT id, team FROM work_projects WHERE user_id = ?`).all(userId)) {
      let names = teamList(d.team);
      const had = names.some((x) => [nm(nw), nm(prev)].includes(nm(x)));
      names = names.filter((x) => ![nm(nw), nm(prev)].includes(nm(x)));
      if (want ? want.has(d.id) : had) names.push(nw);
      const t = names.join("، ");
      if (t !== (d.team || "")) db.prepare(`UPDATE work_projects SET team = ?, updated_at = ? WHERE id = ?`).run(t, now(), d.id);
    }
  }
  return rid;
}
export function staffDelete(userId, id) {
  const r = db.prepare(`SELECT name FROM work_staff WHERE id = ? AND user_id = ?`).get(id, userId);
  if (r?.name)
    for (const d of db.prepare(`SELECT id, team FROM work_projects WHERE user_id = ?`).all(userId)) {
      const t = teamList(d.team).filter((x) => nm(x) !== nm(r.name)).join("، ");
      if (t !== (d.team || "")) db.prepare(`UPDATE work_projects SET team = ?, updated_at = ? WHERE id = ?`).run(t, now(), d.id);
    }
  db.prepare(`DELETE FROM work_staff WHERE id = ? AND user_id = ?`).run(id, userId);
}

// حركة على مشروع (أو عامة): المبلغ بعملة المشروع زي الماكينة. بتتسجّل في «الفلوس» وبتتبعت للماكينة لو المشروع منها.
export async function finSave(userId, it) {
  const did = String(it.deal_id || "");
  const deal = did === GEN ? { currency: "EGP", title: "🧰 مصاريف الشغل العامة" } : db.prepare(`SELECT * FROM work_projects WHERE id = ? AND user_id = ?`).get(did, userId);
  if (!deal) throw new Error("المشروع مش موجود");
  const amount = Number(it.amount) || 0;
  if (!(amount > 0)) throw new Error("المبلغ لازم يكون أكبر من صفر");
  const kind = it.kind === "income" ? "income" : "expense";
  const id = Number(it.id) || 0;
  if (id && getFinance(userId, id)) {
    // تعديل (مثلاً رقم إعلانات فيسبوك) — بنفس عملة القيد الأصلية
    const f = getFinance(userId, id);
    const amt = conv(amount, deal.currency, f.currency);
    db.prepare(`UPDATE finance SET amount = ?, entry_date = ?, machine_sync = CASE WHEN machine_id IS NULL OR machine_id = 'skip' THEN machine_sync ELSE NULL END WHERE user_id = ? AND id = ?`)
      .run(r2(amt), it.dt || f.entry_date, userId, id);
    await syncFinance(userId, id).catch(() => {});
    return id;
  }
  const saved = addFinanceChecked({
    userId, entryDate: it.dt || now().slice(0, 10), direction: kind, amount, currency: AR_CUR[deal.currency] || "جنيه",
    category: "شغل", note: String(it.note || "").trim() || `${kind === "income" ? "دفعة" : "مصروف"} — ${deal.title}`,
  });
  db.prepare(`UPDATE finance SET work_cat = ? WHERE user_id = ? AND id = ?`).run(String(it.category || "").trim() || null, userId, saved.id);
  setFinanceProject(userId, saved.id, { projectId: did, projectTitle: deal.title });
  await syncFinance(userId, saved.id).catch(() => {});
  if (kind === "income" && did !== GEN) autoExtra(userId, did, saved.id, amount, it.dt, it.note);
  return saved.id;
}
export async function finDelete(userId, id) {
  const row = getFinance(userId, Number(id));
  if (!row) return false;
  const ok = deleteFinance(userId, row.id);
  if (ok) await forgetFinance(userId, row);
  return ok;
}
// ربط قيد موجود في «الفلوس» بمشروع (من خانة «مش مربوط»)
export async function finLink(userId, id, dealId) {
  const f = getFinance(userId, Number(id));
  if (!f) throw new Error("القيد مش موجود");
  const deal = dealId === GEN ? { title: "🧰 مصاريف الشغل العامة" } : db.prepare(`SELECT title FROM work_projects WHERE id = ? AND user_id = ?`).get(dealId, userId);
  if (!deal) throw new Error("المشروع مش موجود");
  setFinanceProject(userId, f.id, { projectId: dealId, projectTitle: deal.title });
  // قيد قديم: غالبًا متقيّد في الماكينة بطريقة تانية — يتحسب هنا بس
  if (Date.now() - Date.parse(f.created_at) > 48 * 3600 * 1000 && !f.machine_id)
    db.prepare(`UPDATE finance SET machine_id = 'skip', machine_sync = 'ok' WHERE user_id = ? AND id = ?`).run(userId, f.id);
  else await syncFinance(userId, f.id).catch(() => {});
}

// دفعة عدّت إجمالي المشروع → الزيادة تتضاف تطوير إضافي لوحدها (زي الماكينة)
function autoExtra(userId, did, fid, amount, dt, note) {
  const d = db.prepare(`SELECT value, extras, billing, title, currency FROM work_projects WHERE id = ? AND user_id = ?`).get(did, userId);
  if (!d || d.billing === "monthly" || !(Number(d.value) > 0)) return;
  const ex = parseJ(d.extras);
  if (ex.some((x) => x?.fin_id === String(fid))) return;
  const full = Number(d.value) + ex.reduce((s, x) => s + (Number(x?.amount) || 0), 0);
  const inc = projectFin(userId).filter((f) => f.deal_id === did && f.kind === "income").reduce((s, f) => s + f.amount, 0);
  const over = r2(Math.min(inc - full, Number(amount) || 0));
  if (over <= 0.009) return;
  ex.push({ title: "تحديثات", amount: over, dt: String(dt || now()).slice(0, 10), fin_id: String(fid), auto: "1" });
  db.prepare(`UPDATE work_projects SET extras = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(ex), now(), did);
}

/* ===== ماليات المحتوى (بالدولار — زي صفحة الماكينة) ===== */
// البنود بأساميها القديمة في الماكينة
const CONTENT_LABEL = {
  "رعايات": "رعايات (Sponsor)", "ريفيوهات": "ريفيوهات (Reviews)", "أدسنس": "Google Adsense", "كورسات": "كورسات (Courses)",
  "مونتاج": "مونتاج (Editing)", "بودكاست": "بودكاست (Podcast)", "معدّات": "معدّات (Gear) 📸", "سوفتوير": "سوفتوير (Software)",
  "فريلانسرز": "فريلانسرز (Freelancers)", "أدوات واشتراكات": "أدوات واشتراكات", "إعلانات": "إعلانات",
};
const LABEL_KEY = Object.fromEntries(Object.entries(CONTENT_LABEL).map(([k, v]) => [v, k]));
export function contentList(userId) {
  const rows = [];
  for (const f of db.prepare(`SELECT * FROM finance WHERE user_id = ? AND project_id IS NULL AND (sponsor_id IS NOT NULL OR (work_cat IS NOT NULL AND work_cat <> 'مشاريع'))`).all(userId)) {
    const cat = f.work_cat || "رعايات";
    const from = normCurKey(f.currency || "جنيه");
    rows.push({
      id: String(f.id), dt: f.entry_date, kind: f.direction, category: CONTENT_LABEL[cat] || cat, amount: r2(conv(f.amount, from, "USD")),
      note: `${f.note || ""}${from !== "USD" ? ` (${Number(f.amount).toLocaleString("en-US")}${SYM[from] || " " + from})` : ""}`.replace(/\s*·\s*من الماكينة/, ""),
    });
  }
  for (const h of db.prepare(`SELECT * FROM work_history WHERE user_id = ?`).all(userId))
    rows.push({ id: h.id, dt: h.entry_date, kind: h.direction, category: CONTENT_LABEL[h.work_cat] || h.work_cat, amount: r2(conv(h.amount, h.currency, "USD")), note: h.note || "" });
  rows.sort((a, b) => (a.dt < b.dt ? 1 : -1));
  const inc = r2(rows.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0));
  const exp = r2(rows.filter((r) => r.kind !== "income").reduce((s, r) => s + r.amount, 0));
  return { rows, totals: { income: inc, expense: exp, net: r2(inc - exp) } };
}
export function contentSave(userId, it) {
  const amount = Number(it.amount) || 0;
  if (!(amount > 0)) throw new Error("اكتب المبلغ");
  const label = String(it.category || "").trim();
  const cat = LABEL_KEY[label] || label || "أخرى";
  const saved = addFinanceChecked({
    userId, entryDate: it.dt || now().slice(0, 10), direction: it.kind === "income" ? "income" : "expense", amount,
    currency: "دولار", category: "شغل", note: String(it.note || "").trim() || label,
  });
  db.prepare(`UPDATE finance SET work_cat = ? WHERE user_id = ? AND id = ?`).run(cat, userId, saved.id);
  return saved.id;
}
export function contentDelete(userId, id) {
  if (/^\d+$/.test(String(id))) {
    const f = getFinance(userId, Number(id));
    if (!f || f.project_id) return false;
    return deleteFinance(userId, f.id);
  }
  return db.prepare(`DELETE FROM work_history WHERE user_id = ? AND id = ?`).run(userId, String(id)).changes > 0;
}
