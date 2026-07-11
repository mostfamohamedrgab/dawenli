/* ===================== State ===================== */
const state = {
  me: null,
  journal: [],
  goals: [],
  metrics: [],
  health: [],
  conversations: [],
  conditions: [],
  meals: [],
  habits: [],
  finance: [],
  tasks: [],
  ideas: [],
  problems: [],
  files: [],
  assets: [],
  market: { goldG24Egp: null, rates: {}, updatedAt: null },
  profile: [],
  categories: [],
  finFilter: { dir: "all", cat: "all", q: "", limit: 40 },
  finBudget: { month: "", budget: null, goal: null },
  fileFilter: "all",
  pageDate: null,
  mealDate: null,
  calY: new Date().getFullYear(),
  calM: new Date().getMonth(),
  selDate: null,
};

const $ = (id) => document.getElementById(id);
const TODAY = () => new Date().toISOString().slice(0, 10);

/* ===================== Helpers ===================== */
// أرقام هندية زي التصميم: ٧.٢ ، ١٬٨٠٠
const arNum = (n) => Number(n || 0).toLocaleString("ar-EG");

const MOOD_SCORES = [
  { re: /مبسوط|سعيد|فرحان|متحمّس|متحمس|رايق|ممتاز/, score: 5, emoji: "😄" },
  { re: /كويس|حلو|مرتاح|هادي|راضي/, score: 4, emoji: "🙂" },
  { re: /عادي|محايد/, score: 3, emoji: "😐" },
  { re: /متوتر|قلقان|عصبي|مضغوط|متوتّر|زهقان|تعبان/, score: 2, emoji: "😣" },
  { re: /حزين|زعلان|متضايق|مكتئب/, score: 1, emoji: "😔" },
];
function moodInfo(mood = "") {
  const m = String(mood).toLowerCase();
  for (const x of MOOD_SCORES) if (x.re.test(m)) return x;
  return { score: 3, emoji: "🙂" };
}

const CAT_ICONS = {
  "أكل": "🍔", "مواصلات": "🚌", "فواتير": "🧾", "صحة": "💊", "تسوق": "🛍️",
  "ترفيه": "🎮", "بيت": "🏠", "شغل": "💼", "تعليم": "📚", "أخرى": "📦",
};
const HEALTH_ICON = { "تمرين": "🏃", "دواء": "💊", "أكل": "🍽️", "عرض": "🤒", "نوم": "😴", "نفسية": "🧠", "ملاحظة": "📝" };

// حرف اليوم زي التصميم: س ح ن ث ر خ ج
const DAY_LETTER = ["ح", "ن", "ث", "ر", "خ", "ج", "س"]; // jsDay 0=الأحد
const MONEY = "🪙"; // رمز فلوس محايد — مابنحدّدش عملة معيّنة (العملات بتختلف بين الناس)
const curLabel = (f) => (f.currency && f.currency !== "جنيه" ? escapeHtml(f.currency) : MONEY);

function fmtDate(d) {
  try { return new Date(d).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" }); }
  catch { return d; }
}
function fmtShort(d) {
  try { return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }); }
  catch { return d; }
}
function fmtDateTime(d) {
  try { return new Date(d).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
  catch { return d; }
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = "/login"; throw new Error("unauth"); }
  return res;
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  return out;
}
// أول الأسبوع الحالي (السبت — بداية الأسبوع في مصر) كـ YYYY-MM-DD
function weekStartISO() {
  const d = new Date(TODAY() + "T00:00:00");
  const back = (d.getDay() + 1) % 7; // السبت=0 رجوع، الأحد=1 ... الجمعة=6
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
}
// عرض تقارير الموديل: عناوين ## وبولد **
function renderRich(text) {
  const esc = escapeHtml(text || "");
  return esc.split("\n").map((line) => {
    if (line.startsWith("## ")) return `<h4 class="report-h">${line.slice(3)}</h4>`;
    if (line.startsWith("# ")) return `<h4 class="report-h">${line.slice(2)}</h4>`;
    return line ? `<p>${line.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^- /, "• ")}</p>` : "";
  }).join("");
}
// دودل الدفتر للحالات الفاضية (من الـ design system)
const DOODLE = `<svg class="empty-doodle" viewBox="0 0 96 96" fill="none" stroke="var(--hairline-strong)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 24c18-4 34-4 52 0 1 16 1 36 0 52-18 4-34 4-52 0-1-16-1-36 0-52Z" fill="var(--surface-card)"/>
  <path d="M48 22c1 18 1 38 0 56"/><path d="M30 22v8M38 22v8M22 40h8M22 54h8"/>
  <path d="M56 42c5-3 10 4 16 0" stroke="var(--brand)"/><path d="M56 54c6-2 11 3 16-1" stroke="var(--brand)"/>
</svg>`;
function emptyState(title, message) {
  return `<div class="empty">${DOODLE}<h3>${title}</h3><p>${message}</p></div>`;
}

/* ===================== Confirm Modal ===================== */
const confirmOverlay = $("confirmOverlay");
let confirmResolver = null;
function askConfirm() {
  confirmOverlay.classList.remove("hidden");
  return new Promise((resolve) => { confirmResolver = resolve; });
}
function closeConfirm(result) {
  confirmOverlay.classList.add("hidden");
  if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
}
$("confirmOk").addEventListener("click", () => closeConfirm(true));
$("confirmCancel").addEventListener("click", () => closeConfirm(false));
confirmOverlay.addEventListener("click", (e) => { if (e.target === confirmOverlay) closeConfirm(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmOverlay.classList.contains("hidden")) closeConfirm(false);
});
async function del(kind, id) {
  if (!(await askConfirm())) return;
  await api(`/api/${kind}/${id}`, { method: "DELETE" });
  loadAll();
}
window.del = del;

/* ===================== تعديل أي عنصر (مودال موحّد) ===================== */
const escAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");
const EDIT_CONFIGS = {
  finance: { title: "تعديل عملية", source: () => state.finance, fields: [
    { key: "direction", label: "النوع", type: "select", options: [["expense", "صرف ➖"], ["income", "دخل ➕"]] },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "category", label: "البند", type: "select", options: () => (state.categories || []).map((c) => [c, c]) },
    { key: "note", label: "ملاحظة", type: "text" },
    { key: "entry_date", label: "التاريخ", type: "date" },
  ] },
  health: { title: "تعديل تسجيل صحي", source: () => state.health, fields: [
    { key: "category", label: "النوع", type: "select", options: [["تمرين", "تمرين"], ["دواء", "دواء"], ["أكل", "أكل"], ["عرض", "عرض"], ["نوم", "نوم"], ["نفسية", "نفسية"], ["ملاحظة", "ملاحظة"]] },
    { key: "detail", label: "التفاصيل", type: "text" },
    { key: "body_region", label: "المنطقة", type: "select", options: [["عام", "عام"], ["راس", "راس"], ["صدر", "صدر"], ["معدة", "معدة"], ["بطن", "بطن"], ["ذراعين", "ذراعين"], ["ساقين", "ساقين"]] },
    { key: "entry_date", label: "التاريخ", type: "date" },
  ] },
  entries: { title: "تعديل يوميات", source: () => state.journal, fields: [
    { key: "mood", label: "المزاج", type: "text" },
    { key: "summary", label: "التدوينة", type: "textarea" },
    { key: "entry_date", label: "التاريخ", type: "date" },
  ] },
  tasks: { title: "تعديل مهمة", source: () => state.tasks, fields: [
    { key: "title", label: "المهمة", type: "text" },
    { key: "due_date", label: "التاريخ (سيبه فاضي = مهمة عامة)", type: "date" },
    { key: "due_time", label: "الوقت", type: "time" },
    { key: "note", label: "ملاحظة", type: "text" },
    { key: "resources", label: "موارد (وصف/مصادر/روابط)", type: "textarea" },
  ] },
  meals: { title: "تعديل وجبة", source: () => state.meals, fields: [
    { key: "items", label: "الأكل", type: "text" },
    { key: "at_time", label: "الوقت", type: "text" },
    { key: "note", label: "ملاحظة", type: "text" },
    { key: "entry_date", label: "التاريخ", type: "date" },
  ] },
  goals: { title: "تعديل هدف", source: () => state.goals, fields: [
    { key: "title", label: "الهدف", type: "text" },
    { key: "target", label: "المستهدف", type: "number" },
    { key: "unit", label: "الوحدة", type: "text" },
    { key: "period", label: "المدة", type: "select", options: [["", "مستمر (بلا نهاية)"], ["week", "أسبوعي"], ["month", "شهري"], ["date", "بتاريخ محدد"]] },
    { key: "deadline", label: "ينتهي في (للتاريخ المحدد)", type: "date" },
  ] },
  metrics: { title: "تعديل متتبِّع", source: () => state.metrics, fields: [
    { key: "title", label: "الاسم", type: "text" },
    { key: "unit", label: "الوحدة", type: "text" },
    { key: "emoji", label: "إيموجي", type: "text" },
    { key: "daily_target", label: "هدف يومي (اختياري)", type: "number" },
  ] },
  ideas: { title: "تعديل فكرة", source: () => state.ideas, fields: [
    { key: "title", label: "الفكرة", type: "text" },
    { key: "detail", label: "التفاصيل", type: "text" },
  ] },
  problems: { title: "تعديل مشكلة", source: () => state.problems, fields: [
    { key: "title", label: "المشكلة", type: "text" },
    { key: "area", label: "المجال", type: "select", options: () => PROBLEM_AREAS.map((a) => [a, a]) },
    { key: "detail", label: "التفاصيل", type: "text" },
  ] },
  habits: { title: "تعديل عادة", source: () => state.habits, fields: [
    { key: "title", label: "العادة", type: "text" },
    { key: "kind", label: "النوع", type: "select", options: [["do", "أعملها 🔁"], ["quit", "أبطّلها 🚭"]] },
    { key: "emoji", label: "إيموجي", type: "text" },
  ] },
  assets: { title: "تعديل أصل", source: () => state.assets, fields: [
    { key: "name", label: "الاسم/الوصف", type: "text" },
    { key: "quantity", label: "الكمية (جرام دهب / مبلغ كاش)", type: "number" },
    { key: "karat", label: "العيار (للدهب)", type: "number" },
    { key: "currency", label: "العملة (للكاش)", type: "text" },
    { key: "manual_value", label: "القيمة بالجنيه (للأصل العادي)", type: "number" },
    { key: "goal", label: "هدف القيمة", type: "number" },
    { key: "note", label: "ملاحظة", type: "text" },
  ] },
};
let editState = null;
function openEdit(type, id) {
  if (type === "assets") { window.openEditAsset?.(id); return; } // الأصول ليها فورم خاص بيخفي الحقول حسب النوع
  const cfg = EDIT_CONFIGS[type];
  if (!cfg) return;
  const item = (cfg.source() || []).find((x) => x.id === id);
  if (!item) return;
  editState = { type, id };
  $("editTitle").textContent = cfg.title;
  const body = cfg.fields
    .map((f) => {
      const val = item[f.key] ?? "";
      if (f.type === "select") {
        const opts = typeof f.options === "function" ? f.options() : f.options;
        return `<label class="ef-row"><span>${f.label}</span><select name="${f.key}" class="field">${opts
          .map(([v, l]) => `<option value="${escAttr(v)}"${String(v) === String(val) ? " selected" : ""}>${escapeHtml(l)}</option>`)
          .join("")}</select></label>`;
      }
      if (f.type === "textarea") {
        return `<label class="ef-row"><span>${f.label}</span><textarea name="${f.key}" class="field" rows="4">${escapeHtml(val)}</textarea></label>`;
      }
      return `<label class="ef-row"><span>${f.label}</span><input name="${f.key}" type="${f.type}" class="field" value="${escAttr(val)}" /></label>`;
    })
    .join("");
  $("editForm").innerHTML = body + `<div class="ef-actions"><button type="button" class="btn secondary sm" id="editCancel">إلغاء</button><button type="submit" class="btn sm">💾 حفظ</button></div>`;
  $("editOverlay").classList.remove("hidden");
}
window.openEdit = openEdit;
function closeEdit() { $("editOverlay")?.classList.add("hidden"); editState = null; }
$("editClose")?.addEventListener("click", closeEdit);
$("editOverlay")?.addEventListener("click", (e) => { if (e.target === $("editOverlay")) closeEdit(); });
$("editForm")?.addEventListener("click", (e) => { if (e.target.id === "editCancel") closeEdit(); });
$("editForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editState) return;
  const cfg = EDIT_CONFIGS[editState.type];
  const patch = {};
  for (const f of cfg.fields) {
    const el = e.target.elements[f.key];
    if (el) patch[f.key] = el.value;
  }
  try {
    await api(`/api/${editState.type}/${editState.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  } catch {}
  closeEdit();
  await loadAll();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("editOverlay")?.classList.contains("hidden")) closeEdit(); });

/* ===================== Navigation ===================== */
function gotoTab(tab) {
  // الأقسام الأربعة بقت جوّه هَب «دفترك» — أي تنقّل ليها يفتح الهَب على نفس القسم
  if (["journal", "thoughts", "ideas", "problems"].includes(tab)) {
    dafterSub = tab; try { localStorage.setItem("dw_dafter_sub", tab); } catch {}
    tab = "dafter";
  }
  // نثبّت الصفحة الحالية في الـ hash + localStorage عشان الريلود يفضّل واقف فيها
  try { localStorage.setItem("dw_tab", tab); } catch {}
  try { if ((location.hash || "").replace(/^#/, "") !== tab) history.replaceState(null, "", "#" + tab); } catch {}
  document.querySelectorAll(".nav-btn[data-tab], .tabbar-btn[data-tab]").forEach((b) => b.dataset.active = String(b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
  const panel = document.querySelector(`.tab-panel[data-panel="${tab}"]`);
  if (panel) { panel.classList.remove("view-fade"); void panel.offsetWidth; panel.classList.add("view-fade"); }
  closeSidebar();
  if (tab === "overview") renderOverview();
  if (tab === "health") { renderHealthPage(); }
  if (tab === "habits") renderHabitsPage();
  if (tab === "goals") renderGoalsPage();
  if (tab === "finances") renderFinancesPage();
  if (tab === "ideas") renderIdeasPage();
  if (tab === "tasks") renderTasksPage();
  if (tab === "assets") renderAssetsPage();
  if (tab === "problems") renderProblemsPage();
  if (tab === "ask") renderAskPage();
  if (tab === "files") renderFilesPage();
  if (tab === "thoughts") renderThoughts();
  if (tab === "dafter") openDafter();
  if (tab === "aicost") renderAiCostPage();
  if (tab === "about") renderAboutPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("sideNav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (btn) gotoTab(btn.dataset.tab);
});
$("tabBar")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tabbar-btn");
  if (btn) gotoTab(btn.dataset.tab);
});
document.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => gotoTab(c.dataset.go)));

/* ===================== هَب «دفترك» (يوميات/خواطر/أفكار/مشاكل في صفحة واحدة) ===================== */
const DAFTER_SUBS = ["journal", "thoughts", "ideas", "problems"];
let dafterSub = (() => { try { return localStorage.getItem("dw_dafter_sub") || "journal"; } catch { return "journal"; } })();
let dafterInit = false;
function dafterStashAll() {
  const stash = $("dafterStash"); if (!stash) return;
  DAFTER_SUBS.forEach((s) => {
    const sec = document.querySelector(`section[data-panel="${s}"]`);
    // نشيل كلاس tab-panel عشان منطق إخفاء التابات العام ميتحكمش فيها — بنتحكم احنا
    if (sec) { sec.classList.remove("tab-panel"); stash.appendChild(sec); }
  });
}
function showDafterSub(sub) {
  if (!DAFTER_SUBS.includes(sub)) sub = "journal";
  dafterSub = sub;
  try { localStorage.setItem("dw_dafter_sub", sub); } catch {}
  document.querySelectorAll("#dafterSeg .seg-btn").forEach((b) => b.dataset.active = String(b.dataset.sub === sub));
  const mount = $("dafterMount"), stash = $("dafterStash");
  DAFTER_SUBS.forEach((s) => {
    const sec = document.querySelector(`section[data-panel="${s}"]`);
    if (!sec) return;
    if (s === sub) { sec.classList.remove("hidden"); mount.appendChild(sec); }
    else { sec.classList.add("hidden"); stash.appendChild(sec); }
  });
  if (sub === "journal") renderJournal?.();
  else if (sub === "thoughts") renderThoughts();
  else if (sub === "ideas") renderIdeasPage();
  else if (sub === "problems") renderProblemsPage();
}
function openDafter() {
  if (!dafterInit) { dafterStashAll(); dafterInit = true; }
  showDafterSub(dafterSub);
}
$("dafterSeg")?.addEventListener("click", (e) => {
  const b = e.target.closest(".seg-btn"); if (b) { showDafterSub(b.dataset.sub); window.scrollTo({ top: 0, behavior: "smooth" }); }
});

/* ===================== تفاصيل تكلفة الـ AI (صفحة المستخدم) ===================== */
const AICOST_LABEL = {
  agent: "🧠 ترتيب وتنظيم اليوميات", ask: "💬 الأسئلة والمكالمات الصوتية",
  transcribe: "🎙️ تفريغ الصوت لنص", analyze: "📊 تحليلات الفترات",
  report: "📄 التقارير", classify: "🗂️ تصنيف الملفات المرفوعة",
  doctor: "🩺 الملخص الطبي", reflect: "🪞 تأملات وملاحظات", other: "حاجات تانية",
};
async function renderAiCostPage() {
  const totalEl = $("aicostTotal"), listEl = $("aicostList"), noteEl = $("aicostNote");
  if (listEl) listEl.innerHTML = `<div class="muted">بحمّل التكلفة…</div>`;
  let d;
  try { d = await api("/api/my-usage/details").then((r) => r.json()); }
  catch { if (listEl) listEl.innerHTML = `<div class="muted">معرفتش أجيب التكلفة، جرّب تاني.</div>`; return; }
  const usd = Number(d.totals?.cost_usd || 0), month = Number(d.month?.cost_usd || 0);
  const rate = Number(d.usdEgp) || 50;
  const egp = (u) => arNum(Math.round(u * rate));
  const dollars = (u) => "$" + Number(u).toFixed(u >= 1 ? 2 : 3);
  if (totalEl) totalEl.innerHTML = `
    <div class="at-main"><span class="at-label">إجمالي استهلاكك على الـ AI</span><span class="at-value">${dollars(usd)} <span style="font-size:15px;color:var(--ink-muted);font-weight:600">≈ ${egp(usd)} ${MONEY}</span></span></div>
    <div class="at-sub-main"><span class="at-label">الشهر ده</span><span class="at-value2">${dollars(month)} ≈ ${egp(month)} ${MONEY}</span></div>
    <div class="at-breakdown"><span>${arNum(d.totals?.calls || 0)} نداء</span><span>🎙️ ${arNum(Math.round((d.totals?.audio_seconds || 0) / 60))} دقيقة صوت</span><span class="muted">من ${d.totals?.since || "—"}</span></div>`;
  const rows = (d.byKind || []).filter((r) => (r.cost_usd > 0) || (r.calls > 0));
  if (listEl) listEl.innerHTML = rows.length ? rows.map((r) => {
    const label = AICOST_LABEL[r.kind] || r.kind;
    const sub = r.kind === "transcribe" ? `${arNum(Math.round((r.audio_seconds || 0) / 60))} دقيقة · ${arNum(r.calls)} مرة` : `${arNum(r.calls)} نداء`;
    return `<div class="aicost-row"><div class="ac-left"><b>${label}</b><span class="muted">${sub}</span></div><div class="ac-right"><b>${dollars(Number(r.cost_usd))}</b><span class="muted">${egp(r.cost_usd)} ${MONEY}</span></div></div>`;
  }).join("") : `<div class="muted">لسه مفيش استهلاك متسجّل.</div>`;
  if (noteEl) noteEl.textContent = `الأسعار تقريبية حسب أسعار OpenAI، والتحويل للجنيه بسعر دولار ${arNum(rate.toFixed(2))}. المكالمة الصوتية بتستخدم موديل أوفر (gpt-4o-mini) والتعرّف على صوتك والرد بيحصلوا في المتصفح ببلاش.`;
}
$("costChip")?.addEventListener("click", () => gotoTab("aicost"));
document.querySelector("[data-refresh-aicost]")?.addEventListener("click", renderAiCostPage);

// زرار المايك العائم يختفي وقت ما يفتح أي شيت/قائمة عشان ميركبش فوق المحتوى
function syncFab() {
  const hide =
    $("sidebar")?.classList.contains("open") ||
    $("notifPanel")?.classList.contains("open") ||
    $("chatSheet")?.classList.contains("open") ||
    $("toolsSheet")?.classList.contains("open") ||
    $("moreSheet")?.classList.contains("open");
  $("voiceFab")?.classList.toggle("hidden", !!hide);
  $("toolsFab")?.classList.toggle("hidden", !!hide);
}
function openSidebar() { $("sidebar").classList.add("open"); $("sideScrim").classList.add("show"); syncFab(); }
function closeSidebar() { $("sidebar").classList.remove("open"); $("sideScrim").classList.remove("show"); syncFab(); }
$("menuBtn")?.addEventListener("click", openSidebar);
$("sideScrim")?.addEventListener("click", closeSidebar);

/* ===================== تحديث مباشر ===================== */
document.querySelectorAll("[data-refresh]").forEach((b) =>
  b.addEventListener("click", async () => {
    if (b.classList.contains("spinning")) return;
    b.classList.add("spinning");
    await loadAll(true);
    setTimeout(() => b.classList.remove("spinning"), 750);
  })
);

/* ===================== زرار الصوت العائم + شيت الشات ===================== */
const composerEl = document.querySelector(".composer");
const composerParent = composerEl?.parentNode || null;
const composerNext = composerEl?.nextSibling || null;
function openChat() {
  if (composerEl) $("chatSheetBody").appendChild(composerEl);
  $("chatSheet")?.classList.add("open");
  $("chatScrim")?.classList.add("show");
  syncFab();
  setTimeout(() => $("composerText")?.focus(), 280);
}
function closeChat() {
  $("chatSheet")?.classList.remove("open");
  $("chatScrim")?.classList.remove("show");
  syncFab();
  // رجّع الكومبوزر لمكانه الأصلي بعد الأنيميشن
  setTimeout(() => { if (composerEl && composerParent) composerParent.insertBefore(composerEl, composerNext); }, 320);
}
$("voiceFab")?.addEventListener("click", openChat);
$("chatClose")?.addEventListener("click", closeChat);
$("chatScrim")?.addEventListener("click", closeChat);

/* ===================== زرار «أدوات» العائم → اسأل دوّنلي طاير ===================== */
// بننقل نفس صندوق «اسأل دوّنلي» (#askBox) للشيت العائم وبنرجّعه مكانه عند الإغلاق،
// عشان نفس المحادثة والـ listeners تفضل شغّالة من أي مكان في الموقع.
const askBoxEl = $("askBox");
const askBoxParent = askBoxEl?.parentNode || null;
const askBoxNext = askBoxEl?.nextSibling || null;
function returnAskBoxHome() {
  if (askBoxEl && askBoxParent && askBoxEl.parentNode !== askBoxParent) {
    askBoxParent.insertBefore(askBoxEl, askBoxNext);
  }
}
function openTools() {
  if (askBoxEl) $("toolsSheetBody").appendChild(askBoxEl);
  $("toolsSheet")?.classList.add("open");
  $("toolsScrim")?.classList.add("show");
  renderAskThread();
  syncFab();
  setTimeout(() => $("askInput")?.focus(), 280);
}
function closeTools() {
  $("toolsSheet")?.classList.remove("open");
  $("toolsScrim")?.classList.remove("show");
  syncFab();
  setTimeout(returnAskBoxHome, 320); // رجّع الصندوق مكانه بعد الأنيميشن
}
$("toolsFab")?.addEventListener("click", openTools);
$("toolsClose")?.addEventListener("click", closeTools);
$("toolsScrim")?.addEventListener("click", closeTools);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("chatSheet")?.classList.contains("open")) closeChat(); });

/* ===================== جولة تعريفية لأول مرة ===================== */
const TOUR_STEPS = [
  { sel: null, ico: "👋", title: "أهلاً بك في دوّنلي", body: "دفترك الشخصي الذكي. خلّينا نأخذ جولة سريعة — أقل من دقيقة." },
  { sel: "#voiceFab", ico: "🎙️", title: "احكِ يومك", body: "من هذا الزر تسجّل صوتك أو تكتب، ودوّنلي يرتّب كلامك تلقائيًا. واسأله أي وقت: «كم صرفت؟»، «ماذا سجّلت أمس؟»." },
  { sel: ".dw-tabbar, #sideNav", ico: "🌱", title: "عوالمك الأربعة", body: "صحتك، عاداتك، أهدافك، وأموالك — كلها مرتّبة ومتابَعة في مكان واحد." },
  { sel: "[data-refresh]", ico: "🔔", title: "نتابع معك كل يوم", body: "نذكّرك ونسألك عمّا فاتك. وتقدر تحدّث بياناتك من زر التحديث وقت ما تشاء." },
  { sel: null, ico: "✨", title: "جاهز؟", body: "ابدأ بأول تدوينة الآن — اضغط زر المايك واحكِ يومك." },
];
let tourIdx = 0;
function tourFirstVisible(selList) {
  for (const s of selList.split(",").map((x) => x.trim())) {
    const e = document.querySelector(s);
    if (e) { const r = e.getBoundingClientRect(); if (r.width && r.height) return e; }
  }
  return null;
}
function startTour() {
  if ($("tourOv")) return;
  tourIdx = 0;
  const ov = document.createElement("div");
  ov.className = "tour-ov"; ov.id = "tourOv";
  ov.innerHTML = `
    <div class="tour-ring" id="tourRing"></div>
    <div class="tour-card" id="tourCard">
      <div class="tour-ico" id="tourIco"></div>
      <h3 id="tourTitle"></h3>
      <p id="tourBody"></p>
      <div class="tour-foot">
        <button class="tour-skip" id="tourSkip">تخطّي</button>
        <div class="tour-dots" id="tourDots">${TOUR_STEPS.map(() => `<span class="tour-dot"></span>`).join("")}</div>
        <button class="btn sm" id="tourNext">التالي</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  $("tourSkip").onclick = endTour;
  $("tourNext").onclick = () => { if (tourIdx >= TOUR_STEPS.length - 1) endTour(); else { tourIdx++; renderTourStep(); } };
  window.addEventListener("resize", renderTourStep);
  renderTourStep();
}
function renderTourStep() {
  const step = TOUR_STEPS[tourIdx]; if (!step || !$("tourOv")) return;
  $("tourIco").textContent = step.ico;
  $("tourTitle").textContent = step.title;
  $("tourBody").textContent = step.body;
  $("tourNext").textContent = tourIdx >= TOUR_STEPS.length - 1 ? "يلا نبدأ ✨" : "التالي";
  [...$("tourDots").children].forEach((d, i) => d.classList.toggle("on", i === tourIdx));
  const ring = $("tourRing"), card = $("tourCard"), ov = $("tourOv");
  const el = step.sel ? tourFirstVisible(step.sel) : null;
  card.style.top = ""; card.style.bottom = "";
  if (el) {
    const r = el.getBoundingClientRect(), pad = 8;
    ov.style.background = "transparent";
    ring.style.display = "block";
    ring.style.top = (r.top - pad) + "px";
    ring.style.left = (r.left - pad) + "px";
    ring.style.width = (r.width + pad * 2) + "px";
    ring.style.height = (r.height + pad * 2) + "px";
    if (window.innerHeight - r.bottom > 240) { card.classList.remove("centered"); card.style.top = (r.bottom + 14) + "px"; }
    else if (r.top > 240) { card.classList.remove("centered"); card.style.bottom = (window.innerHeight - r.top + 14) + "px"; }
    else { card.classList.add("centered"); }
  } else {
    ring.style.display = "none";
    ov.style.background = "rgba(40,36,32,.62)";
    card.classList.add("centered");
  }
}
function endTour() {
  window.removeEventListener("resize", renderTourStep);
  $("tourOv")?.remove();
  try { localStorage.setItem("dawenli_tour_v1", "1"); } catch {}
}
window.startTour = startTour; // عشان نقدر نشغّلها يدويًا

/* ===================== سحب لتحت للتحديث (زي السوشيال) ===================== */
(function pullToRefresh() {
  const THRESH = 72;
  let startY = 0, pulling = false, dist = 0, busy = false;
  const ind = document.createElement("div");
  ind.className = "ptr-ind";
  ind.innerHTML = `<span class="ptr-spin"></span>`;
  document.body.appendChild(ind);
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  const blocked = () => busy || $("chatSheet")?.classList.contains("open") || !!$("tourOv") || $("sidebar")?.classList.contains("open");
  window.addEventListener("touchstart", (e) => {
    if (!atTop() || blocked()) { pulling = false; return; }
    startY = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    dist = e.touches[0].clientY - startY;
    if (dist > 0) {
      if (e.cancelable) e.preventDefault();
      const pull = Math.min(dist, 130);
      ind.style.transform = `translateX(-50%) translateY(${Math.min(pull * 0.7, 70)}px) rotate(${pull * 2.6}deg)`;
      ind.style.opacity = String(Math.min(1, pull / THRESH));
      ind.classList.toggle("ready", pull >= THRESH);
    } else { pulling = false; ind.style.opacity = ""; ind.style.transform = ""; }
  }, { passive: false });
  window.addEventListener("touchend", async () => {
    if (!pulling) return;
    pulling = false;
    if (dist >= THRESH) {
      busy = true;
      ind.classList.add("spinning"); ind.classList.remove("ready");
      ind.style.transform = `translateX(-50%) translateY(54px)`;
      ind.style.opacity = "1";
      try { await loadAll(true); } catch {}
      ind.classList.remove("spinning");
      busy = false;
    }
    ind.style.transform = ""; ind.style.opacity = ""; dist = 0;
  });
})();

/* ===================== الكومبوزر: رتّبهالي ===================== */
// سطر الإيصال من الـ agent → عالمه (للون الـ chip)
function receiptWorld(line) {
  if (line.startsWith("💰")) return "finances";
  if (line.startsWith("💡")) return "ideas";
  if (line.startsWith("🧩")) return "problems";
  if (line.startsWith("🩺") || line.startsWith("🧠") || line.startsWith("🍽️") || line.startsWith("🩹")) return "health";
  if (line.startsWith("🎯")) return "goals";
  if (line.startsWith("📅") || line.startsWith("☑️")) return "goals";
  if (line.startsWith("✅") || line.startsWith("🔁") || line.startsWith("🚭") || /عادة/.test(line)) return "habits";
  return "";
}
// عرض رد الـ agent + الإيصالات (مشترك بين النص والصوت)
function renderComposerResult(data, transcript) {
  const out = $("composerResult");
  if (data.error) { out.innerHTML = `<div class="comp-reply">${escapeHtml(data.error)}</div>`; return; }
  const chips = (data.receipts || [])
    .flatMap((r) => r.split("\n"))
    .map((r) => `<span class="chip ${receiptWorld(r)}">${escapeHtml(r)}</span>`)
    .join("");
  const heard = transcript ? `<div class="comp-hint" style="margin-bottom:6px">🎙️ سمعتك بتقول: «${escapeHtml(transcript)}»</div>` : "";
  out.innerHTML = `${heard}<div class="comp-reply">${escapeHtml(data.reply || "اتسجّلت ✅")}</div>${chips ? `<div class="comp-chips">${chips}</div>` : ""}`;
}
async function composerSend() {
  const ta = $("composerText");
  const text = ta.value.trim();
  if (!text) return;
  const btn = $("composerBtn");
  const out = $("composerResult");
  btn.disabled = true;
  out.innerHTML = `<div class="comp-reply"><span class="loading"><span class="spinner"></span> بقرا كلامك وبرتّبه…</span></div>`;
  try {
    const res = await api("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    renderComposerResult(data);
    if (!data.error) { ta.value = ""; await loadAll(false); }
  } catch {
    out.innerHTML = `<div class="comp-reply">حصل خطأ، جرّب تاني.</div>`;
  } finally {
    btn.disabled = false;
  }
}
$("composerBtn").addEventListener("click", composerSend);
$("composerText").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) composerSend();
});

/* ===================== تسجيل الصوت من الكومبوزر ===================== */
let mediaRecorder = null;
let recChunks = [];
let recTimer = null;
let recStartedAt = 0;
let recCancelled = false;
let audioCtx = null, waveAnalyser = null, waveRaf = null, wakeLock = null, micStream = null;
// التسجيل بيشتغل في سياقين: log (الكومبوزر) و thought (خواطر — مدة أطول، خام)
const REC_CTX = {
  log:     { bar: "recBar",        time: "recTime",     mic: "micBtn",     prog: "recProgress",     out: "composerResult", btn: "composerBtn", endpoint: "/api/voice",          mode: "log",     maxMs: 7 * 60 * 1000 },
  thought: { bar: "thoughtRecBar", time: "thoughtTime", mic: "thoughtMic", prog: "thoughtProgress", out: "thoughtResult",  btn: "thoughtSave", endpoint: "/api/thoughts/voice", mode: "thought", maxMs: 20 * 60 * 1000 },
};
let recCtxKey = "log";
const rc = () => REC_CTX[recCtxKey];
function recElems() {
  const c = rc();
  return { bar: $(c.bar), time: $(c.time), mic: $(c.mic), comp: $(c.btn) };
}
function fmtRecTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* موجة حيّة بتتحرّك مع مستوى صوت المستخدم فعليًا */
function startWave(stream) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    const src = audioCtx.createMediaStreamSource(stream);
    waveAnalyser = audioCtx.createAnalyser();
    waveAnalyser.fftSize = 64;
    waveAnalyser.smoothingTimeConstant = 0.75;
    src.connect(waveAnalyser);
    const wave = $(rc().bar).querySelector(".rec-wave");
    const bars = wave.querySelectorAll("i");
    wave.classList.add("live");
    const data = new Uint8Array(waveAnalyser.frequencyBinCount);
    const step = Math.max(1, Math.floor(data.length / bars.length));
    const draw = () => {
      waveAnalyser.getByteFrequencyData(data);
      bars.forEach((bar, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
        const level = sum / step / 255; // 0..1
        const scale = Math.max(0.12, Math.min(1, level * 1.7));
        bar.style.transform = `scaleY(${scale.toFixed(3)})`;
      });
      waveRaf = requestAnimationFrame(draw);
    };
    draw();
  } catch { /* لو Web Audio مش متاح، الأنيميشن CSS بيفضل شغّال */ }
}
function stopWave() {
  if (waveRaf) { cancelAnimationFrame(waveRaf); waveRaf = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  waveAnalyser = null;
  const wave = $(rc().bar)?.querySelector(".rec-wave");
  if (wave) {
    wave.classList.remove("live");
    wave.querySelectorAll("i").forEach((b) => (b.style.transform = ""));
  }
}

/* الشاشة تفضل صاحية وانت بتسجّل */
function isRecording() { return mediaRecorder && mediaRecorder.state === "recording"; }
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch { /* بعض المتصفحات بتمنعها — نتجاهل */ }
}
function onRecVisibility() {
  // iOS بيفكّ القفل لما الصفحة تختفي — نرجّعه لما ترجع وإحنا لسه بنسجّل
  if (document.visibilityState === "visible" && isRecording()) requestWakeLock();
}
async function releaseWakeLock() {
  document.removeEventListener("visibilitychange", onRecVisibility);
  try { if (wakeLock) await wakeLock.release(); } catch {}
  wakeLock = null;
}
// المايك بنطلبه مرة واحدة بس ونعيد استخدام نفس الـ stream — مفيش طلب صلاحية كل مرة
async function getMic() {
  if (micStream && micStream.getTracks().some((t) => t.readyState === "live")) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return micStream;
}
window.addEventListener("pagehide", () => { micStream?.getTracks().forEach((t) => t.stop()); micStream = null; });

/* ===== حماية التسجيل من الضياع: نحفظه في IndexedDB ونعيد المحاولة لو النت فصل ===== */
function voiceIDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("dawenli-voice", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pending", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function savePending(blob, endpoint) {
  try {
    const db = await voiceIDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction("pending", "readwrite").objectStore("pending")
        .add({ blob, type: blob.type || "audio/webm", endpoint, ts: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}
async function removePending(id) {
  if (id == null) return;
  try { const db = await voiceIDB(); db.transaction("pending", "readwrite").objectStore("pending").delete(id); } catch {}
}
async function allPending() {
  try {
    const db = await voiceIDB();
    return await new Promise((resolve) => {
      const req = db.transaction("pending", "readonly").objectStore("pending").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}
let _draining = false;
async function drainPending(manual = false) {
  if (_draining || (!navigator.onLine && !manual)) return;
  _draining = true;
  if (manual) await setPendingBanner("sending"); // مؤشر فوري إن في حاجة بتحصل
  let sent = 0, failed = false;
  try {
    for (const it of await allPending()) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 60000); // متعلقش للأبد
        const res = await api(it.endpoint || "/api/voice", { method: "POST", headers: { "Content-Type": it.type }, body: it.blob, signal: ctrl.signal });
        clearTimeout(t);
        const data = await res.json().catch(() => ({}));
        if (!data.error) { await removePending(it.id); sent++; }
        else { failed = true; break; }
      } catch { failed = true; break; } // النت واقع أو الطلب فشل — نسيبهم للمرة الجاية
    }
    if (sent) { await setPendingBanner("sent"); await loadAll(false); }
  } finally {
    _draining = false;
    if (manual && failed && (await allPending()).length) await setPendingBanner("error");
    else if (!sent) await updatePendingBanner();
  }
}
function _pendingEl() {
  let el = $("pendingVoice");
  if (!el) {
    el = document.createElement("div");
    el.id = "pendingVoice"; el.className = "pending-voice";
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (el.classList.contains("pv-busy")) return;       // بيتبعت دلوقتي — استنى
      if (e.target.closest(".pv-x")) { discardPending(); return; }
      drainPending(true);
    });
  }
  return el;
}
async function setPendingBanner(state = "idle") {
  const n = (await allPending()).length;
  if (!n && state !== "sent") { $("pendingVoice")?.remove(); return; }
  const el = _pendingEl();
  el.classList.toggle("pv-busy", state === "sending");
  if (state === "sending") {
    el.innerHTML = `<span class="spinner"></span> بيتبعت…`;
  } else if (state === "sent") {
    el.innerHTML = `✅ اتبعت`;
    setTimeout(() => updatePendingBanner(), 1400); // يختفي بعد ما يطمّنك
  } else if (state === "error") {
    el.innerHTML = `⚠️ فشل الإرسال — دوس تجرّب تاني <button class="pv-x" title="احذف التسجيل">✕</button>`;
  } else {
    el.innerHTML = `📡 <b>${arNum(n)}</b> تسجيل محفوظ — اضغط للإرسال <button class="pv-x" title="احذف">✕</button>`;
  }
}
async function updatePendingBanner() { return setPendingBanner("idle"); }
async function discardPending() {
  if (!confirm("تحذف التسجيل المحفوظ؟ مش هينفع ترجّعه تاني.")) return;
  for (const it of await allPending()) await removePending(it.id);
  await updatePendingBanner();
}
window.addEventListener("online", () => drainPending());

async function startRecording(key = "log") {
  recCtxKey = REC_CTX[key] ? key : "log";
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    $(rc().out).innerHTML = `<div class="comp-reply">متصفحك مش بيدعم التسجيل الصوتي — اكتب بدل الصوت 🙏</div>`;
    return;
  }
  let stream;
  try {
    stream = await getMic();
    stream.getTracks().forEach((t) => (t.enabled = true));
  } catch {
    $(rc().out).innerHTML = `<div class="comp-reply">لازم تسمح للمايك عشان أسجّل صوتك 🎙️</div>`;
    return;
  }
  // اختار صيغة يدعمها المتصفح
  const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
  mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  recChunks = [];
  recCancelled = false;
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    // مانوقّفش الـ tracks — نسكّتها بس عشان نحافظ على الصلاحية ومنطلبهاش تاني
    stream.getTracks().forEach((t) => (t.enabled = false));
    clearInterval(recTimer);
    stopWave();
    releaseWakeLock();
    const { bar, mic } = recElems();
    bar.classList.add("hidden");
    mic.classList.remove("hidden");
    if (recCancelled || !recChunks.length) return;
    const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    const pendId = await savePending(blob, rc().endpoint); // اتحفظ فورًا — مايضيعش لو حصل أي حاجة
    await sendVoice(blob, pendId);
  };
  mediaRecorder.start();
  recStartedAt = Date.now();
  const { bar, time, mic } = recElems();
  mic.classList.add("hidden");
  bar.classList.remove("hidden");
  time.textContent = "0:00";
  bar.classList.remove("warn");
  const prog = $(rc().prog);
  if (prog) prog.style.width = "0%";
  startWave(stream);
  requestWakeLock();
  document.addEventListener("visibilitychange", onRecVisibility);
  const maxMs = rc().maxMs;
  recTimer = setInterval(() => {
    const elapsed = Date.now() - recStartedAt;
    const remaining = maxMs - elapsed;
    const warn = remaining <= 45000; // آخر ٤٥ ثانية = تحذير
    bar.classList.toggle("warn", warn);
    time.textContent = warn ? `⚠️ باقي ${fmtRecTime(Math.max(0, remaining))}` : fmtRecTime(elapsed);
    if (prog) prog.style.width = `${Math.min(100, (elapsed / maxMs) * 100)}%`;
    if (remaining <= 0) stopRecording(); // سقف المدة حسب السياق
  }, 250);
}
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}
function cancelRecording() {
  recCancelled = true;
  stopRecording();
}
async function sendVoice(blob, pendId) {
  const c = rc();
  const out = $(c.out);
  const { comp, mic } = recElems();
  comp.disabled = true; mic.disabled = true;
  out.innerHTML = `<div class="comp-reply"><span class="loading"><span class="spinner"></span> ${c.mode === "thought" ? "بفرّغ كلامك…" : "بفرّغ صوتك وبرتّبه…"}</span></div>`;
  try {
    const res = await api(c.endpoint, {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob,
    });
    const data = await res.json();
    await removePending(pendId); // اتبعت بنجاح → نشيله من المحفوظ
    if (c.mode === "thought") { renderThoughtResult(data); if (!data.error) await loadThoughts(); }
    else { renderComposerResult(data, data.transcript); if (!data.error) await loadAll(false); }
  } catch {
    // النت فصل / فشل الرفع — التسجيل محفوظ في IndexedDB وهيتبعت لوحده
    out.innerHTML = `<div class="comp-reply">📡 النت فصل — تسجيلك <b>محفوظ</b> وهيتبعت لوحده أول ما النت يرجع (أو اضغط شارة «تسجيل محفوظ» تحت).</div>`;
    updatePendingBanner();
  } finally {
    comp.disabled = false; mic.disabled = false;
  }
}
$("micBtn").addEventListener("click", () => startRecording("log"));
$("recStop").addEventListener("click", stopRecording);
$("recCancel").addEventListener("click", cancelRecording);
$("thoughtMic")?.addEventListener("click", () => startRecording("thought"));
$("thoughtStop")?.addEventListener("click", stopRecording);
$("thoughtCancel")?.addEventListener("click", cancelRecording);

/* ===================== خواطر / عصف ذهني ===================== */
function renderThoughtResult(data) {
  const out = $("thoughtResult");
  if (!out) return;
  if (data.error) { out.innerHTML = `<div class="comp-reply">${escapeHtml(data.error)}</div>`; return; }
  const heard = data.transcript ? `<div class="comp-hint" style="margin-bottom:6px">🎙️ «${escapeHtml(data.transcript)}»</div>` : "";
  out.innerHTML = `${heard}<div class="comp-reply">💭 اتسجّلت في خواطرك</div>`;
  setTimeout(() => { if ($("thoughtResult")) $("thoughtResult").innerHTML = ""; }, 4000);
}
async function thoughtSaveText() {
  const ta = $("thoughtText");
  const text = ta.value.trim();
  if (!text) return;
  const btn = $("thoughtSave");
  btn.disabled = true;
  try {
    const res = await api("/api/thoughts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const data = await res.json();
    if (!data.error) { ta.value = ""; await loadThoughts(); } else renderThoughtResult(data);
  } catch { renderThoughtResult({ error: "حصل خطأ، جرّب تاني." }); }
  finally { btn.disabled = false; }
}
async function loadThoughts() {
  try { state.thoughts = await api("/api/thoughts").then((r) => r.json()); } catch { state.thoughts = state.thoughts || []; }
  renderThoughts();
}
function renderThoughts() {
  const el = $("thoughtsList");
  if (!el) return;
  const data = state.thoughts || [];
  if (!data.length) {
    el.innerHTML = emptyState("لا توجد خواطر بعد", "افتح المايك واتكلّم بحرية (لحد ٢٠ دقيقة)، أو اكتب فكرة — بنحفظها زي ما هي.");
    return;
  }
  el.innerHTML = data.map((t) => `
    <div class="thought-card">
      <button class="icon-btn th-del" onclick="del('thoughts', ${t.id})" title="حذف">🗑️</button>
      <div class="th-text">${escapeHtml(t.text)}</div>
      <div class="th-meta">${t.kind === "voice" ? "🎙️" : "✍️"} ${fmtDateTime(t.created_at)}</div>
    </div>`).join("");
}
$("thoughtSave")?.addEventListener("click", thoughtSaveText);
$("thoughtText")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) thoughtSaveText(); });

/* ===================== النظرة العامة ===================== */
function computeStreak(entries) {
  const days = new Set(entries.map((e) => e.entry_date));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (days.has(iso)) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0 && iso === TODAY()) { d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}
function greeting() {
  const name = state.me?.name ? ` يا ${state.me.name.split(" ")[0]}` : "";
  const h = new Date().getHours();
  if (h < 12) return `صباح الخير${name} 👋`;
  if (h < 18) return `يومك سعيد${name} 👋`;
  return `مساء الخير${name} 🌙`;
}

/* ===================== الذاكرة الدائمة (دوّنلي يعرف عنك) ===================== */
const PROFILE_CAT = {
  "هوية": { label: "هوية", emoji: "🪪" },
  "دراسة_وشغل": { label: "دراسة وشغل", emoji: "🎓" },
  "صحة": { label: "صحة", emoji: "🩺" },
  "تفضيلات": { label: "تفضيلات", emoji: "⭐" },
  "علاقات": { label: "علاقات", emoji: "👥" },
  "أخرى": { label: "أخرى", emoji: "📌" },
};
function renderProfile() {
  const el = $("profileFacts");
  if (!el) return;
  const data = state.profile || [];
  if (!data.length) {
    el.innerHTML = `<p class="muted" style="font-size:var(--text-sm)">لسه فاضية — كل ما تحكي لدوّنلي حاجة ثابتة عنك (بدرس إيه، عندك مرض مزمن...) هيفتكرها هنا. أو ضيفها بنفسك بزرار «معلومة».</p>`;
    return;
  }
  const byCat = {};
  for (const f of data) (byCat[f.category] = byCat[f.category] || []).push(f);
  el.innerHTML = Object.entries(byCat).map(([cat, facts]) => {
    const meta = PROFILE_CAT[cat] || PROFILE_CAT["أخرى"];
    return `<div style="margin-bottom:14px">
      <div class="muted" style="font-size:var(--text-xs);font-weight:700;margin-bottom:6px">${meta.emoji} ${meta.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${facts.map((f) => `<span class="chip" style="gap:8px">
          <b style="font-weight:700">${escapeHtml(f.fact_key)}:</b> ${escapeHtml(f.value)}
          <button class="icon-btn" style="width:18px;height:18px;font-size:11px" onclick="del('profile', ${f.id})" title="نسّيه">✕</button>
        </span>`).join("")}
      </div>
    </div>`;
  }).join("");
}
$("profileAddBtn")?.addEventListener("click", () => $("profileForm").classList.toggle("hidden"));
$("profileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const category = $("profileCategory").value;
  const key = $("profileKey").value.trim();
  const value = $("profileValue").value.trim();
  if (!key || !value) return;
  await api("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, key, value }) });
  e.target.reset();
  $("profileForm").classList.add("hidden");
  await loadAll(false);
  renderProfile();
  renderAboutCore();
});
// صفحة «دوّنلي يعرف عنك» — كل المعلومات + كروت الأساسيات (جنسية/عملات)
function renderAboutPage() { renderProfile(); renderAboutCore(); }
function findFact(keys) {
  return (state.profile || []).find((f) => keys.some((k) => (f.fact_key || "").includes(k)));
}
function renderAboutCore() {
  const el = $("aboutCore"); if (!el) return;
  const nat = findFact(["جنسي", "بلد", "الوطن", "الجنسية"]);
  const cur = findFact(["عملة", "عملات", "currenc"]); // عملة/العملات
  const card = (ico, label, fact, hint) => `
    <div class="ac-core-card${fact ? "" : " missing"}">
      <span class="acc-ico">${ico}</span>
      <div class="acc-body">
        <span class="acc-label">${label}</span>
        <b class="acc-val">${fact ? escapeHtml(fact.value) : `<span class="muted">${hint}</span>`}</b>
      </div>
    </div>`;
  el.innerHTML =
    card("🌍", "الجنسية / البلد", nat, "لسه دوّنلي ما يعرفهاش — قوله أو ضيفها") +
    card("💱", "العملات اللي بتستخدمها", cur, "لسه ما اتحددتش — قوله أو ضيفها");
}

function renderOverview() {
  $("heroGreeting").textContent = greeting();
  const streak = computeStreak(state.journal);
  $("heroSub").textContent = streak > 0 ? "هذه حياتك مرتّبة — حتى الآن." : "ابدأ بخطوة صغيرة — احكِ لي عن يومك.";
  $("todayChip").textContent = `🗓 ${fmtDate(TODAY())}`;
  $("streakChip").textContent = `🔥 ${arNum(streak)} ${streak === 1 ? "يوم" : "أيام"}`;
  if ($("costChip")) {
    const mu = state.myUsage || { total: 0, month: 0 };
    $("costChip").textContent = `💸 كلّفت $${Number(mu.total || 0).toFixed(2)}`;
    $("costChip").title = `إجمالي استهلاكك على الذكاء الاصطناعي · الشهر ده: $${Number(mu.month || 0).toFixed(2)}`;
  }
  renderProfile();

  // كروت العوالم بأرقام حقيقية
  const week = lastNDays(7);
  const healthWeek = state.health.filter((h) => week.includes(h.entry_date));
  const lastHealth = state.health[0];
  const bestHabit = [...state.habits].sort((a, b) => b.streak - a.streak)[0];
  const habitsDone = state.habits.filter((h) => h.doneToday).length;
  const topGoal = [...state.goals].filter((g) => g.target).sort((a, b) => (b.current / b.target) - (a.current / a.target))[0] || state.goals[0];
  const monthStart = TODAY().slice(0, 8) + "01";
  const monthFin = state.finance.filter((f) => f.entry_date >= monthStart);
  const isEGP = (f) => !f.currency || f.currency === "جنيه";
  const mExpense = monthFin.filter((f) => f.direction === "expense" && isEGP(f)).reduce((a, f) => a + f.amount, 0);

  const worlds = [
    {
      w: "health", title: "الصحة",
      metric: healthWeek.length ? `${arNum(healthWeek.length)} تدوينة هذا الأسبوع` : "لا تزال هادئة",
      caption: lastHealth ? lastHealth.detail : "احكِ لي عن نومك وجسمك",
    },
    {
      w: "habits", title: "العادات",
      metric: bestHabit ? `ستريك ${arNum(bestHabit.streak)} ${bestHabit.streak === 1 ? "يوم" : "أيام"} 🔥` : "ابدأ عادة",
      caption: bestHabit ? `${bestHabit.title} · ${arNum(habitsDone)}/${arNum(state.habits.length)} اليوم` : "قل لدوّنلي «ألعب رياضة كل يوم»",
    },
    {
      w: "goals", title: "الأهداف",
      metric: topGoal && topGoal.target ? `${arNum(Math.min(100, Math.round((topGoal.current / topGoal.target) * 100)))}٪ من هدفك` : (topGoal ? topGoal.title : "حدّد هدف"),
      caption: topGoal ? topGoal.title : "قل لدوّنلي «أريد الوصول…»",
    },
    {
      w: "finances", title: "الفلوس",
      metric: monthFin.length ? `صرفت ${arNum(mExpense)}` : "سجّل أول عملية",
      caption: monthFin.length ? "اضغط لرؤية تفاصيل مصاريفك هذا الشهر" : "قل لدوّنلي «صرفت ٢٠٠ على الطعام»",
    },
  ];
  $("worldGrid").innerHTML = worlds.map((x) => `
    <div class="world-card ${x.w}" data-nav="${x.w}">
      <div class="wc-art"><img src="/assets/illustrations/world-${x.w}.svg" alt="${x.title}" /></div>
      <div class="wc-body">
        <span class="wc-tag">${x.title}</span>
        <div class="wc-metric">${escapeHtml(x.metric)}</div>
        <div class="wc-caption">${escapeHtml(x.caption)}</div>
      </div>
    </div>`).join("");
  $("worldGrid").querySelectorAll(".world-card").forEach((c) =>
    c.addEventListener("click", () => gotoTab(c.dataset.nav)));

  // مهام النهاردة (المؤرّخة بتاريخ النهاردة)
  const todayTasks = state.tasks
    .filter((t) => t.due_date === TODAY())
    .sort((a, b) => ((a.due_time || "99") < (b.due_time || "99") ? -1 : 1));
  renderTaskRows($("todayTasks"), todayTasks, "مفيش مهام النهاردة — يوم خفيف 🌤️");

  renderFeed();
}

function renderFeed() {
  const items = [];
  for (const e of state.journal.slice(0, 5)) items.push({ t: e.created_at || e.entry_date, txt: e.summary || "تدوينة", chips: [{ c: "", t: `📝 يوميات${e.mood ? " · " + e.mood : ""}` }] });
  for (const h of state.health.slice(0, 5)) items.push({ t: h.created_at, txt: h.detail, chips: [{ c: "health", t: `${HEALTH_ICON[h.category] || "🩺"} ${h.category}` }] });
  for (const f of state.finance.slice(0, 5)) items.push({ t: f.created_at, txt: f.note || f.category || "عملية", chips: [{ c: "finances", t: `${f.direction === "income" ? "➕" : "➖"} ${arNum(f.amount)} ${curLabel(f)}` }] });
  for (const t of state.tasks.slice(-4)) items.push({ t: t.created_at, txt: t.title, chips: [{ c: "goals", t: `📅 ${fmtShort(t.due_date)}${t.due_time ? " · " + t.due_time : ""}` }] });
  items.sort((a, b) => new Date(b.t) - new Date(a.t));
  const top = items.slice(0, 8);
  $("recentFeed").innerHTML = top.length
    ? top.map((x) => `
      <div class="log-row">
        <div class="lr-top">
          <span class="lr-text">${escapeHtml(x.txt)}</span>
          <span class="lr-time">${fmtDateTime(x.t)}</span>
        </div>
        <div class="lr-chips">${x.chips.map((c) => `<span class="chip ${c.c}">${escapeHtml(c.t)}</span>`).join("")}</div>
      </div>`).join("")
    : emptyState("لا يوجد تدوين هنا بعد", "سجّل صوتك أو اكتب بالأعلى عن يومك وسأبدأ بترتيبه لك.");
}

/* ===================== الصحة ===================== */
function renderHealthPage() {
  const week = lastNDays(7);
  const month = lastNDays(30);
  const healthWeek = state.health.filter((h) => week.includes(h.entry_date));
  const symptomsWeek = healthWeek.filter((h) => h.category === "عرض");
  const mentalWeek = healthWeek.filter((h) => h.category === "نفسية");
  const activeConds = state.conditions.filter((c) => c.status === "active");

  $("healthStats").innerHTML = [
    { label: "تدوينات الأسبوع", value: arNum(healthWeek.length), unit: "", ico: "🩺", delta: "صحة وجسم", trend: "" },
    { label: "أعراض الأسبوع", value: arNum(symptomsWeek.length), unit: "", ico: "🤒", delta: symptomsWeek.length ? "خد بالك من نفسك" : "ولا عرض 👌", trend: symptomsWeek.length ? "down" : "up" },
    { label: "نفسيتك", value: arNum(mentalWeek.length), unit: "تدوينة", ico: "🧠", delta: "آخر أسبوع", trend: "" },
    { label: "متابعات نشطة", value: arNum(activeConds.length), unit: "", ico: "🩹", delta: activeConds[0] ? activeConds[0].title : "—", trend: "" },
  ].map((s) => `
    <div class="stat-card health">
      <div class="sc-top"><span class="sc-ico">${s.ico}</span><span class="sc-label">${s.label}</span></div>
      <div class="sc-value"><b>${s.value}</b>${s.unit ? `<span class="sc-unit">${s.unit}</span>` : ""}</div>
      <div class="sc-delta ${s.trend}">${escapeHtml(s.delta)}</div>
    </div>`).join("");

  renderMoodChart();

  // أعراض آخر ٣٠ يوم كـ chips بعدد التكرار
  const counts = {};
  for (const h of state.health.filter((h) => h.category === "عرض" && month.includes(h.entry_date))) {
    const key = h.detail.length > 26 ? h.detail.slice(0, 26) + "…" : h.detail;
    counts[key] = (counts[key] || 0) + 1;
  }
  const symRows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  $("symptomChips").innerHTML = symRows.length
    ? symRows.map(([t, n]) => `<span class="chip health">${escapeHtml(t)}${n > 1 ? ` ×${arNum(n)}` : ""}</span>`).join("")
    : `<span class="muted" style="font-size:var(--text-sm)">مفيش أعراض متسجّلة — ربنا يديم الصحة 🌿</span>`;

  // تقرير الدكتور: آخر تدوينات صحية كخط زمني
  const toneOf = (c) => c === "عرض" ? "danger" : c === "نوم" ? "warning" : c === "تمرين" ? "success" : c === "نفسية" ? "health" : "goals";
  const tl = state.health.slice(0, 6);
  $("healthTimeline").innerHTML = tl.length
    ? tl.map((h) => `
      <div class="tl-row">
        <span class="badge ${toneOf(h.category)}"><span class="dot"></span>${fmtShort(h.entry_date)}</span>
        <span class="tl-text">${escapeHtml(h.detail)}</span>
      </div>`).join("")
    : `<span class="muted" style="font-size:var(--text-sm)">لا توجد تدوينات صحية بعد.</span>`;

  renderBodyMap();
  renderConditions();
  renderMeals();
}

// مزاجك آخر أسبوع — خط مرسوم باليد (SVG)
function renderMoodChart() {
  const el = $("moodChart");
  const moodByDate = {};
  for (const e of state.journal) if (e.mood) moodByDate[e.entry_date] = e.mood;
  const days = lastNDays(7);
  const pts = days.map((d) => ({ date: d, mood: moodByDate[d] ? moodInfo(moodByDate[d]) : null }));
  if (!pts.some((p) => p.mood)) {
    el.innerHTML = `<div class="empty sm">${DOODLE}<p>لا يوجد مزاج مسجّل — احكِ لي عن يومك وسأرسمه لك هنا.</p></div>`;
    return;
  }
  const W = 560, H = 180, padX = 26, padTop = 18, padBot = 30;
  const X = (i) => padX + (i * (W - padX * 2)) / (days.length - 1);
  const Y = (s) => padTop + (1 - (s - 1) / 4) * (H - padTop - padBot);
  const known = pts.map((p, i) => ({ ...p, i })).filter((p) => p.mood);
  const path = known.map((p, k) => `${k ? "L" : "M"}${X(p.i).toFixed(1)} ${Y(p.mood.score).toFixed(1)}`).join(" ");
  const area = known.length > 1
    ? `${path} L${X(known[known.length - 1].i).toFixed(1)} ${H - padBot} L${X(known[0].i).toFixed(1)} ${H - padBot} Z`
    : "";
  const health = cssVar("--health");
  const dots = known.map((p) => `
    <circle cx="${X(p.i).toFixed(1)}" cy="${Y(p.mood.score).toFixed(1)}" r="11" fill="var(--surface-card)" stroke="${health}" stroke-width="2.4"/>
    <text x="${X(p.i).toFixed(1)}" y="${(Y(p.mood.score) + 4.5).toFixed(1)}" text-anchor="middle" font-size="12">${p.mood.emoji}</text>`).join("");
  const labels = days.map((d, i) => `
    <text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="12" font-family="Tajawal, sans-serif" fill="var(--ink-muted)">${DAY_LETTER[new Date(d + "T00:00:00").getDay()]}</text>`).join("");
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
      ${area ? `<path d="${area}" fill="${health}" fill-opacity="0.13"/>` : ""}
      <path d="${path}" fill="none" stroke="${health}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}${labels}
    </svg>`;
}

/* ---- خريطة الجسم (نفس المنطق، ستايل دفتر) ---- */
const REGION_CENTERS = { "راس": [100, 32], "صدر": [100, 90], "معدة": [100, 137], "بطن": [100, 178], "ذراعين": [153, 120], "ساقين": [116, 270] };
const SVGNS = "http://www.w3.org/2000/svg";
let pageFilter = null;
function healthDates() { return [...new Set(state.health.map((h) => h.entry_date))].sort(); }
function shiftPageDate(delta) {
  if (!state.pageDate) return;
  const d = new Date(state.pageDate + "T00:00:00"); d.setDate(d.getDate() + delta);
  state.pageDate = d.toISOString().slice(0, 10); pageFilter = null; renderBodyMap();
}
function renderBodyMap() {
  const dayLabel = $("dayLabel");
  if (!dayLabel) return;
  if (!state.pageDate) {
    const dates = healthDates();
    state.pageDate = dates.length ? dates[dates.length - 1] : TODAY();
  }
  dayLabel.textContent = fmtDate(state.pageDate);
  const items = state.health.filter((h) => h.entry_date === state.pageDate);
  document.querySelectorAll(".bodypart").forEach((el) => el.classList.remove("hot", "picked"));
  const badges = $("bodyBadges"); badges.innerHTML = "";
  const byRegion = {};
  for (const h of items) { const r = h.body_region || "عام"; (byRegion[r] = byRegion[r] || []).push(h); }
  for (const [region, list] of Object.entries(byRegion)) {
    if (region === "عام" || !REGION_CENTERS[region]) continue;
    document.querySelectorAll(`.bodypart[data-region="${region}"]`).forEach((el) => {
      el.classList.add("hot"); if (pageFilter === region) el.classList.add("picked");
    });
    const [cx, cy] = REGION_CENTERS[region];
    const g = document.createElementNS(SVGNS, "g");
    const circle = document.createElementNS(SVGNS, "circle");
    circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", "11");
    const txt = document.createElementNS(SVGNS, "text");
    txt.setAttribute("x", cx); txt.setAttribute("y", cy + 4); txt.setAttribute("text-anchor", "middle");
    txt.textContent = arNum(list.length);
    g.appendChild(circle); g.appendChild(txt); badges.appendChild(g);
  }
  const general = byRegion["عام"] || [];
  $("generalChips").innerHTML = general.map((h) => `<span class="chip health">${HEALTH_ICON[h.category] || "🩺"} ${escapeHtml(h.detail)}</span>`).join("");
  const listEl = $("healthList");
  const shown = pageFilter ? items.filter((h) => (h.body_region || "عام") === pageFilter) : items;
  if (!items.length) {
    listEl.innerHTML = `<div class="empty sm">${DOODLE}<p>لا توجد تدوينات صحية في هذا اليوم. قل لدوّنلي «جريت ١٠ دقائق» أو «أخذت الدواء».</p></div>`;
    return;
  }
  listEl.innerHTML =
    (pageFilter ? `<button class="btn ghost sm" onclick="clearPageFilter()">↺ كل المناطق</button>` : "") +
    shown.map((h) => `
      <div class="list-row">
        <div class="lm">
          <span class="l1">${HEALTH_ICON[h.category] || "🩺"} ${escapeHtml(h.category || "ملاحظة")}${h.body_region && h.body_region !== "عام" ? " · " + escapeHtml(h.body_region) : ""}</span>
          <span class="l2">${escapeHtml(h.detail)}</span>
        </div>
        <div class="row-actions"><button class="icon-btn" onclick="openEdit('health', ${h.id})" title="تعديل">✏️</button><button class="icon-btn" onclick="del('health', ${h.id})" title="حذف">🗑️</button></div>
      </div>`).join("");
}
function clearPageFilter() { pageFilter = null; renderBodyMap(); }
window.clearPageFilter = clearPageFilter;
$("bodySvg")?.addEventListener("click", (e) => {
  const part = e.target.closest(".bodypart");
  if (!part || !part.classList.contains("hot")) return;
  const region = part.dataset.region;
  pageFilter = pageFilter === region ? null : region; renderBodyMap();
});
$("dayPrev")?.addEventListener("click", () => shiftPageDate(-1));
$("dayNext")?.addEventListener("click", () => shiftPageDate(1));

/* ---- المتابعات ---- */
function daysLeft(endDate) {
  const end = new Date(endDate + "T00:00:00");
  const t = new Date(TODAY() + "T00:00:00");
  return Math.round((end - t) / 86400000);
}
function renderConditions() {
  const el = $("conditions");
  if (!el) return;
  const data = state.conditions;
  if (!data.length) {
    el.innerHTML = `<span class="muted" style="font-size:var(--text-sm)">مفيش متابعات شغّالة.</span>`;
    return;
  }
  el.innerHTML = data.map((c) => {
    const closed = c.status === "closed";
    const left = daysLeft(c.end_date);
    const status = closed ? `<span class="badge"><span class="dot"></span>مقفولة</span>`
      : left >= 0 ? `<span class="badge health"><span class="dot"></span>باقي ${arNum(left)} يوم</span>`
      : `<span class="badge warning"><span class="dot"></span>خلصت المدة</span>`;
    return `<div class="cond-card">
      <div class="cond-head"><span class="cond-title">🩹 ${escapeHtml(c.title)}</span>${status}</div>
      <div class="cond-meta">من ${fmtShort(c.start_date)} لـ ${fmtShort(c.end_date)}</div>
      <div class="cond-actions">
        <button class="btn health sm" onclick="doctorReport(${c.id})">📄 تقرير للدكتور</button>
        ${!closed ? `<button class="btn ghost sm" onclick="closeCondition(${c.id})">إقفال</button>` : ""}
        <button class="icon-btn" onclick="del('conditions', ${c.id})" title="حذف">🗑️</button>
      </div>
      <div class="cond-report hidden" id="report-${c.id}"></div>
    </div>`;
  }).join("");
}
async function doctorReport(id) {
  const box = $(`report-${id}`); if (!box) return;
  box.classList.remove("hidden");
  box.innerHTML = `<div class="loading"><span class="spinner"></span> بحضّر التقرير…</div>`;
  try {
    const res = await api(`/api/conditions/${id}/report`);
    const data = await res.json();
    if (data.error) { box.innerHTML = `<p class="muted">${escapeHtml(data.error)}</p>`; return; }
    const timeline = (data.timeline || []).map((h) =>
      `<div class="tl-row"><span class="badge health"><span class="dot"></span>${fmtShort(h.entry_date)}</span><span class="tl-text">${escapeHtml(h.detail)}</span></div>`).join("");
    box.innerHTML = `<div class="analysis-result" style="margin-top:0">${renderRich(data.summary)}</div>
      <h4 style="font:var(--type-h3);font-size:var(--text-base);margin:14px 0 10px">الخط الزمني للأعراض</h4>
      <div class="tl-rows">${timeline || `<p class="muted">مفيش أعراض في الفترة.</p>`}</div>`;
  } catch { box.innerHTML = `<p class="muted">حصل خطأ في توليد التقرير.</p>`; }
}
window.doctorReport = doctorReport;
async function closeCondition(id) { await api(`/api/conditions/${id}/close`, { method: "PUT" }); loadAll(); }
window.closeCondition = closeCondition;

/* ---- الأكل ---- */
function mealDates() { return [...new Set(state.meals.map((m) => m.entry_date))].sort(); }
function shiftMealDate(delta) {
  if (!state.mealDate) return;
  const d = new Date(state.mealDate + "T00:00:00"); d.setDate(d.getDate() + delta);
  state.mealDate = d.toISOString().slice(0, 10); renderMeals();
}
function renderMeals() {
  const dayLabel = $("mealDayLabel"); if (!dayLabel) return;
  if (!state.mealDate) {
    const dates = mealDates();
    state.mealDate = dates.length ? dates[dates.length - 1] : TODAY();
  }
  dayLabel.textContent = fmtDate(state.mealDate);
  const items = state.meals.filter((m) => m.entry_date === state.mealDate);
  const el = $("meals");
  if (!items.length) { el.innerHTML = `<span class="muted" style="font-size:var(--text-sm)">مفيش أكل مسجّل في اليوم ده.</span>`; return; }
  el.innerHTML = items.map((m) => `
    <div class="list-row">
      <div class="lm">
        <span class="l1">🍽️ ${m.at_time ? escapeHtml(m.at_time) : "أكل"}</span>
        <span class="l2">${escapeHtml(m.items)}${m.note ? " · " + escapeHtml(m.note) : ""}</span>
      </div>
      <div class="row-actions"><button class="icon-btn" onclick="openEdit('meals', ${m.id})" title="تعديل">✏️</button><button class="icon-btn" onclick="del('meals', ${m.id})" title="حذف">🗑️</button></div>
    </div>`).join("");
}
$("mealPrev")?.addEventListener("click", () => shiftMealDate(-1));
$("mealNext")?.addEventListener("click", () => shiftMealDate(1));

/* ===================== العادات ===================== */
function renderHabitsPage() {
  const data = state.habits;
  const best = [...data].sort((a, b) => b.streak - a.streak)[0];

  // لوحة الستريك (أحسن عادة)
  const days = lastNDays(7);
  if (best) {
    const logset = new Set(best.logs || []);
    $("streakPanel").innerHTML = `
      <h3 style="font:var(--type-h3);margin:0 0 16px">${best.emoji || "🔁"} ${escapeHtml(best.title)}</h3>
      <div class="streak-head">
        <span class="fl">🔥</span>
        <div style="display:flex;align-items:baseline;gap:6px">
          <b>${arNum(best.streak)}</b><span>يوم ورا بعض</span>
        </div>
      </div>
      <div class="streak-days">
        ${days.map((d) => `
          <div class="sd">
            <div class="sd-cell ${logset.has(d) ? "done" : ""}">${logset.has(d) ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>` : ""}</div>
            <small>${DAY_LETTER[new Date(d + "T00:00:00").getDay()]}</small>
          </div>`).join("")}
      </div>`;
  } else {
    $("streakPanel").innerHTML = emptyState("لا توجد عادات بعد", "أضف عادة بجانبه، أو قل لدوّنلي «ألعب رياضة كل يوم».");
  }

  // هيت ماب ٨ أسابيع: كل الأيام اللي اتعملت فيها أي عادة
  const allLogs = {};
  for (const h of data) for (const d of h.logs || []) allLogs[d] = (allLogs[d] || 0) + 1;
  const WEEKS = 8;
  // أول عمود (يمين) = الأسبوع الحالي، وكل صف يوم من السبت للجمعة
  const todayD = new Date(TODAY() + "T00:00:00");
  const satOffset = (todayD.getDay() + 1) % 7; // أيام مرّت من السبت
  const weekStart = (wAgo) => {
    const d = new Date(todayD);
    d.setDate(d.getDate() - satOffset - wAgo * 7);
    return d;
  };
  let cells = "";
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < WEEKS; col++) {
      const wAgo = col; // العمود الأول يمين = الأسبوع الحالي
      const d = weekStart(wAgo);
      d.setDate(d.getDate() + row);
      const iso = d.toISOString().slice(0, 10);
      const future = iso > TODAY();
      const n = allLogs[iso] || 0;
      const lv = future ? 0 : n >= 3 ? 3 : n;
      cells += `<span class="hm-cell ${lv ? "l" + lv : ""}" title="${fmtShort(iso)}${n ? " · " + arNum(n) : ""}" style="${future ? "opacity:.35" : ""}"></span>`;
    }
  }
  $("habitHeatmap").innerHTML = `
    <div class="heatmap" style="grid-template-columns:repeat(${WEEKS}, 1fr)">${cells}</div>
    <div class="hm-legend"><span>أقل</span><i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><span>أكتر</span></div>`;

  // صفوف العادات
  $("habitRows").innerHTML = data.length
    ? data.map((h) => {
        const logset = new Set(h.logs || []);
        const dots = days.map((d) => `<i class="${logset.has(d) ? "on" : ""}" title="${fmtShort(d)}"></i>`).join("");
        return `<div class="habit-row lift">
          <div class="hr-top">
            <span class="hr-title">${h.emoji || (h.kind === "quit" ? "🚭" : "🔁")} ${escapeHtml(h.title)}</span>
            <span class="badge habits"><span class="dot"></span>${arNum(h.streak)} يوم 🔥</span>
          </div>
          <div class="hr-dots">${dots}</div>
          <div class="hr-foot">
            <button class="btn ${h.doneToday ? "secondary" : "habits"} sm" onclick="toggleHabit(${h.id}, ${h.doneToday})">
              ${h.doneToday ? "✓ تمّت اليوم" : "علّمها لليوم"}
            </button>
            <button class="icon-btn" onclick="openEdit('habits', ${h.id})" title="تعديل">✏️</button>
            <button class="icon-btn" onclick="del('habits', ${h.id})" title="حذف">🗑️</button>
          </div>
        </div>`;
      }).join("")
    : "";
}
async function toggleHabit(id, doneToday) {
  if (doneToday) await api(`/api/habits/${id}/log?date=${TODAY()}`, { method: "DELETE" });
  else await api(`/api/habits/${id}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: TODAY() }) });
  await loadAll(false);
  renderHabitsPage();
  renderOverview();
}
window.toggleHabit = toggleHabit;
$("habitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("habitTitle").value.trim();
  const kind = $("habitKind").value;
  if (!title) return;
  await api("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, kind }) });
  e.target.reset();
  await loadAll(false);
  renderHabitsPage();
});

/* ===================== الأهداف ===================== */
function ringSVG(pct, size = 130, stroke = 12) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.min(Math.max(pct, 0), 100) / 100);
  return `
    <div class="ring-wrap" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--goals-tint)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--goals)" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"
          style="transition:stroke-dashoffset var(--dur-draw) var(--ease-pen)"/>
      </svg>
      <div class="ring-center" style="font-size:${Math.round(size * 0.2)}px">${arNum(Math.round(pct))}٪</div>
    </div>`;
}
// حالة توقيت الهدف: فاضية لو مستمر، عدّاد لو لسه، أو «انتهى وقته» لو الـ deadline عدّى
function goalTimeInfo(g) {
  if (!g || !g.deadline) return { expired: false, label: "" };
  const n = new Date(); // التاريخ المحلي بتاع المستخدم (مش UTC) عشان العدّاد يطابق يومه
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  const diff = Math.round((new Date(`${g.deadline}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  if (diff < 0) return { expired: true, label: `⌛ انتهى وقته — ${fmtShort(g.deadline)}` };
  if (diff === 0) return { expired: false, label: `⏰ آخر يوم النهاردة` };
  return { expired: false, label: `⏳ باقي ${arNum(diff)} يوم · لحد ${fmtShort(g.deadline)}` };
}
window.goalTimeInfo = goalTimeInfo;
function renderGoalsPage() {
  renderMetrics(); // المتتبِّعات اليومية تحت الأهداف
  const el = $("ringGrid");
  const data = state.goals;
  if (!data.length) {
    el.innerHTML = emptyState("لا توجد أهداف بعد", "أضف هدفًا بالأعلى، أو قل لدوّنلي «هدفي الوصول إلى ٥٠٠ ألف».");
    return;
  }
  el.innerHTML = data.map((g) => {
    const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
    const unit = g.unit ? " " + escapeHtml(g.unit) : "";
    const ti = goalTimeInfo(g);
    return `<div class="ring-card lift${ti.expired ? " goal-expired" : ""}">
      <div class="rc-tap" onclick="openGoalDetail(${g.id})">
        ${g.target ? ringSVG(pct) : `<div style="font-size:44px">🎯</div>`}
        <div class="rc-caption">${escapeHtml(g.title)}</div>
        <div class="rc-meta">${arNum(g.current)}${g.target ? ` / ${arNum(g.target)}` : ""}${unit}${g.target ? ` · باقي ${arNum(Math.max(0, g.target - g.current))}` : ""}</div>
        ${ti.label ? `<div class="rc-deadline${ti.expired ? " exp" : ""}">${ti.label}</div>` : ""}
        <div class="rc-hint">اضغط تشوف السجل ›</div>
      </div>
      <div class="rc-update">
        <input type="number" placeholder="حدّث الرقم" id="gc-${g.id}" class="field" style="flex:1" />
        <button class="btn goals sm" onclick="updateGoal(${g.id})">تحديث</button>
        <button class="icon-btn" onclick="openEdit('goals', ${g.id})" title="تعديل">✏️</button>
        <button class="icon-btn" onclick="del('goals', ${g.id})" title="حذف">🗑️</button>
      </div>
    </div>`;
  }).join("");
}
// ===== المتتبِّعات اليومية (رسم آخر ٧ أيام + الكروت) =====
function metricSparkline(last7, target, sparkDays) {
  const days = sparkDays && sparkDays.length ? sparkDays : lastNDays(7); // مفاتيح الأيام من السيرفر (توقيت القاهرة)
  const byDate = Object.fromEntries((last7 || []).map((r) => [r.entry_date, r.value]));
  const vals = days.map((d) => byDate[d] ?? 0);
  const max = Math.max(Number(target) || 0, ...vals, 1);
  return `<div class="mspark">${days.map((d, i) => {
    const v = vals[i];
    const h = Math.max(4, Math.round((v / max) * 32));
    const cls = v > 0 ? (target && v >= target ? " hit" : " on") : "";
    return `<span class="msbar${cls}" style="height:${h}px" title="${fmtShort(d)}: ${arNum(v)}"></span>`;
  }).join("")}</div>`;
}
function renderMetrics() {
  const el = $("metricGrid");
  if (!el) return;
  const data = state.metrics || [];
  if (!data.length) {
    el.innerHTML = emptyState("لا توجد متتبِّعات بعد", "أضف رقم فوق، أو قل «النهاردة اشتغلت ٦ ساعات».");
    return;
  }
  el.innerHTML = data.map((m) => {
    const s = m.stats || {};
    const unit = m.unit ? " " + escapeHtml(m.unit) : "";
    const todayTxt = s.today != null ? `${arNum(s.today)}${unit}` : "لسه";
    const tgt = m.daily_target ? ` / هدف ${arNum(m.daily_target)}` : "";
    return `<div class="metric-card lift">
      <div class="mc-head">
        <span class="mc-title">${m.emoji ? escapeHtml(m.emoji) + " " : "📊 "}${escapeHtml(m.title)}</span>
        <span class="mc-actions">
          <button class="icon-btn" onclick="openMetricHistory(${m.id})" title="السجل">📜</button>
          <button class="icon-btn" onclick="openEdit('metrics', ${m.id})" title="تعديل">✏️</button>
          <button class="icon-btn" onclick="del('metrics', ${m.id})" title="حذف">🗑️</button>
        </span>
      </div>
      <div class="mc-today">النهاردة: <b>${todayTxt}</b>${tgt}</div>
      ${metricSparkline(s.last7, m.daily_target, s.spark_days)}
      <div class="mc-stats">
        <span>المتوسط <b>${arNum(s.week_avg ?? 0)}</b></span>
        <span>إجمالي الأسبوع <b>${arNum(s.week_total ?? 0)}</b></span>
        <span>الشهر <b>${arNum(s.month_total ?? 0)}</b></span>
      </div>
      <div class="mc-log">
        <input type="number" step="any" placeholder="قيمة النهاردة" id="mv-${m.id}" class="field" style="flex:1" />
        <button class="btn goals sm" onclick="logMetricToday(${m.id})">سجّل</button>
      </div>
    </div>`;
  }).join("");
}
async function logMetricToday(id) {
  const v = $(`mv-${id}`).value;
  if (v === "") return;
  await api(`/api/metrics/${id}/day`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: Number(v) }) });
  await loadAll(false);
  renderMetrics();
}
window.logMetricToday = logMetricToday;
async function openMetricHistory(id) {
  const m = (state.metrics || []).find((x) => x.id === id);
  if (!m) return;
  let hist = [];
  try { hist = await api(`/api/metrics/${id}/history`).then((r) => r.json()); } catch {}
  const unit = m.unit ? " " + escapeHtml(m.unit) : "";
  const rows = hist.length
    ? hist.map((h) => `<div class="gl-row">
        <span class="gl-delta pos">${arNum(h.value)}${unit}</span>
        <div class="gl-mid"><div class="gl-note">${h.note ? escapeHtml(h.note) : "—"}</div><div class="gl-date">${fmtShort(h.entry_date)}</div></div>
        <button class="icon-btn gl-del" onclick="deleteMetricLogEntry(${h.id}, ${id})" title="امسح">🗑️</button>
      </div>`).join("")
    : `<div class="muted" style="text-align:center;padding:24px">لسه مفيش أرقام مسجّلة على المتتبِّع ده.</div>`;
  const ov = document.createElement("div");
  ov.className = "modal-overlay"; ov.id = "metricHistOv";
  ov.innerHTML = `<div class="modal" style="max-width:460px;text-align:right">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">
      <h3 class="modal-title" style="margin:0">${m.emoji ? escapeHtml(m.emoji) + " " : "📊 "}${escapeHtml(m.title)}</h3>
      <button class="icon-btn" onclick="closeMetricHistory()" aria-label="إغلاق">✕</button>
    </div>
    <div class="gl-list">${rows}</div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeMetricHistory(); });
}
function closeMetricHistory() { $("metricHistOv")?.remove(); }
async function deleteMetricLogEntry(logId, metricId) {
  try { await api(`/api/metrics/log/${logId}`, { method: "DELETE" }); } catch { return; }
  await loadAll(false);
  closeMetricHistory();
  openMetricHistory(metricId);
}
window.openMetricHistory = openMetricHistory;
window.closeMetricHistory = closeMetricHistory;
window.deleteMetricLogEntry = deleteMetricLogEntry;
async function updateGoal(id) {
  const v = $(`gc-${id}`).value;
  if (v === "") return;
  await api(`/api/goals/${id}/current`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: Number(v) }) });
  await loadAll(false);
  renderGoalsPage();
}
window.updateGoal = updateGoal;

async function openGoalDetail(id) {
  closeGoalDetail(); // امنع تكرار الموديل فوق بعضه (كان بيغطّي على الزراير)
  const goal = state.goals.find((g) => g.id === id);
  if (!goal) return;
  let log = [];
  try { log = await api(`/api/goals/${id}/log`).then((r) => r.json()); } catch {}
  const unit = goal.unit ? " " + escapeHtml(goal.unit) : "";
  const pct = goal.target ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
  const rows = log.length
    ? log.map((e) => {
        const delta = e.delta == null ? "" : (e.delta >= 0 ? `+${arNum(e.delta)}` : `−${arNum(Math.abs(e.delta))}`);
        return `<div class="gl-row" id="gl-row-${e.id}" data-delta="${e.delta ?? ""}">
          <span class="gl-delta ${e.delta >= 0 ? "pos" : "neg"}">${delta}${delta ? unit : ""}</span>
          <div class="gl-mid"><div class="gl-note">${escapeHtml(e.note || "تحديث")}</div><div class="gl-date">${fmtShort(e.created_at.slice(0, 10))}</div></div>
          <span class="gl-after">الإجمالي ${arNum(e.current_after)}</span>
          <button class="icon-btn gl-edit" onclick="editGoalLogEntry(${e.id}, ${id})" title="عدّل البند">✏️</button>
          <button class="icon-btn gl-del" onclick="deleteGoalLogEntry(${e.id}, ${id})" title="امسح البند">🗑️</button>
        </div>`;
      }).join("")
    : `<div class="muted" style="text-align:center;padding:24px">لا توجد تحديثات على هذا الهدف بعد — بمجرد أن تزيد فيه ستجد السجل هنا.</div>`;
  const ov = document.createElement("div");
  ov.className = "modal-overlay"; ov.id = "goalDetailOv";
  ov.innerHTML = `<div class="modal" style="max-width:460px;text-align:right">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:4px">
      <h3 class="modal-title" style="margin:0">🎯 ${escapeHtml(goal.title)}</h3>
      <button class="icon-btn" onclick="closeGoalDetail()" aria-label="إغلاق">✕</button>
    </div>
    <div class="muted" style="font-size:var(--text-sm);margin-bottom:14px">${arNum(goal.current)}${goal.target ? ` / ${arNum(goal.target)}` : ""}${unit}${goal.target ? ` · ${arNum(pct)}٪` : ""}</div>
    ${goalTimeInfo(goal).label ? `<div class="gd-deadline${goalTimeInfo(goal).expired ? " exp" : ""}">${goalTimeInfo(goal).label}</div>` : ""}
    <div class="td-sec">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span class="td-label">📎 موارد الهدف</span>
        <button class="icon-btn" onclick="editGoalResources(${id})" title="تعديل الموارد">✏️</button>
      </div>
      <div id="goalResView">${goal.resources ? `<div class="td-res">${linkify(goal.resources)}</div>` : `<span class="muted" style="font-size:var(--text-sm)">مفيش موارد — اضغط ✏️ وضيف وصف/مصادر/روابط.</span>`}</div>
    </div>
    <div class="gl-list">${rows}</div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeGoalDetail(); });
}
function closeGoalDetail() { $("goalDetailOv")?.remove(); }
// تعديل موارد الهدف (وصف/روابط) inline جوّه الموديل
function editGoalResources(id) {
  const g = (state.goals || []).find((x) => x.id === id); if (!g) return;
  const view = $("goalResView"); if (!view) return;
  view.innerHTML = `<textarea id="goalResInput" class="field" rows="4" placeholder="وصف، مصادر، روابط…"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px"><button class="btn sm" onclick="saveGoalResources(${id})">💾 حفظ</button><button class="btn ghost sm" onclick="openGoalDetail(${id})">إلغاء</button></div>`;
  const ta = $("goalResInput"); if (ta) { ta.value = g.resources || ""; ta.focus(); }
}
async function saveGoalResources(id) {
  const val = $("goalResInput")?.value || "";
  try { await api(`/api/goals/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resources: val }) }); } catch {}
  await loadAll(false);
  closeGoalDetail(); openGoalDetail(id);
}
window.editGoalResources = editGoalResources;
window.saveGoalResources = saveGoalResources;
// حذف بند غلط من سجل الهدف — بيطرح قيمته من رصيد الهدف ويحدّث العرض
async function deleteGoalLogEntry(logId, goalId) {
  try { await api(`/api/goals/log/${logId}`, { method: "DELETE" }); } catch { return; }
  await loadAll(false);
  closeGoalDetail();
  openGoalDetail(goalId);
}
window.openGoalDetail = openGoalDetail;
window.closeGoalDetail = closeGoalDetail;
window.deleteGoalLogEntry = deleteGoalLogEntry;
// تعديل بند في سجل الهدف (التفاصيل + المبلغ) inline
function editGoalLogEntry(logId, goalId) {
  const row = document.getElementById(`gl-row-${logId}`);
  if (!row) return;
  const delta = row.dataset.delta || "";
  const note = row.querySelector(".gl-note")?.textContent || "";
  row.innerHTML = `
    <input type="number" class="field" id="gle-d-${logId}" style="width:84px" />
    <input type="text" class="field" id="gle-n-${logId}" placeholder="التفاصيل (مثلاً: من التعاون مع aix)" style="flex:1" />
    <button class="icon-btn" onclick="saveGoalLogEdit(${logId}, ${goalId})" title="حفظ">✓</button>
    <button class="icon-btn" onclick="openGoalDetail(${goalId})" title="إلغاء">✕</button>`;
  document.getElementById(`gle-d-${logId}`).value = delta;
  document.getElementById(`gle-n-${logId}`).value = note === "تحديث" ? "" : note;
  document.getElementById(`gle-n-${logId}`).focus();
}
async function saveGoalLogEdit(logId, goalId) {
  const delta = Number(document.getElementById(`gle-d-${logId}`).value);
  const note = document.getElementById(`gle-n-${logId}`).value.trim();
  try {
    await api(`/api/goals/log/${logId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta, note }) });
  } catch { return; }
  await loadAll(false);
  closeGoalDetail();
  openGoalDetail(goalId);
}
window.editGoalLogEntry = editGoalLogEntry;
window.saveGoalLogEdit = saveGoalLogEdit;

$("goalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("goalTitle").value.trim();
  const target = $("goalTarget").value;
  const unit = $("goalUnit").value.trim();
  if (!title) return;
  await api("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, target, unit }) });
  e.target.reset();
  await loadAll(false);
  renderGoalsPage();
});

$("metricForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("metricTitle").value.trim();
  const value = $("metricValue").value;
  const unit = $("metricUnit").value.trim();
  if (!title) return;
  await api("/api/metrics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, value, unit }) });
  e.target.reset();
  await loadAll(false);
  renderMetrics();
});

/* ===================== الفلوس ===================== */
// تحويل أي عملية لقيمتها بالجنيه بسعر اليوم (للدخل/التجميع) — بيستخدم أسعار السوق المحمّلة
const FIN_CUR_CODE = { "دولار": "USD", "يورو": "EUR", "ريال": "SAR", "درهم": "AED", "إسترليني": "GBP" };
function finToEgp(f) {
  if (!f.currency || f.currency === "جنيه" || f.currency === "EGP") return f.amount;
  const rate = ((state.market || {}).rates || {})[FIN_CUR_CODE[f.currency] || f.currency];
  return rate ? f.amount * rate : f.amount; // لو السعر مش متوفّر، نحسبه بقيمته (نادر)
}
function renderFinancesPage() {
  const data = state.finance;
  const isEGP = (f) => !f.currency || f.currency === "جنيه";
  const week = lastNDays(7); // للأعمدة اليومية
  const monthStart = TODAY().slice(0, 8) + "01";
  const weekStart = weekStartISO(); // من أول الأسبوع (السبت) مش آخر ٧ أيام
  const weekExpense = data.filter((f) => f.direction === "expense" && f.entry_date >= weekStart && isEGP(f)).reduce((a, f) => a + f.amount, 0);
  const mExpense = data.filter((f) => f.direction === "expense" && f.entry_date >= monthStart && isEGP(f)).reduce((a, f) => a + f.amount, 0);
  const dayOfMonth = Math.max(1, Number(TODAY().slice(8, 10)));
  const avgDay = Math.round(mExpense / dayOfMonth);

  // ===== الدخل: محوّل للجنيه بسعر اليوم + تجميع شهري للمقارنة =====
  const incomeByMonth = {};
  for (const f of data.filter((f) => f.direction === "income")) {
    const mk = (f.entry_date || "").slice(0, 7);
    if (mk) incomeByMonth[mk] = (incomeByMonth[mk] || 0) + finToEgp(f);
  }
  const curMonthKey = TODAY().slice(0, 7);
  const monthIncome = Math.round(incomeByMonth[curMonthKey] || 0);
  const CUR_NAME = { USD: "دولار", "دولار": "دولار", EUR: "يورو", "يورو": "يورو", SAR: "ريال", AED: "درهم", GBP: "إسترليني", EGP: "جنيه", "جنيه": "جنيه" };
  const incCur = {};
  for (const f of data.filter((f) => f.direction === "income" && (f.entry_date || "").slice(0, 7) === curMonthKey)) {
    const cu = CUR_NAME[f.currency] || f.currency || "جنيه"; incCur[cu] = (incCur[cu] || 0) + f.amount;
  }
  const incCurStr = Object.entries(incCur).map(([cu, v]) => `${arNum(v)} ${cu}`).join(" · ");

  $("finStats").innerHTML = [
    { label: "دخل الشهر", value: arNum(monthIncome), unit: MONEY, ico: "💰", delta: incCurStr || "مفيش دخل لسه", trend: "pos" },
    { label: "مصاريف الأسبوع", value: arNum(weekExpense), unit: MONEY, ico: "💸", delta: "من أول الأسبوع (السبت)", trend: "" },
    { label: "مصاريف الشهر", value: arNum(mExpense), unit: MONEY, ico: "🧾", delta: "من يوم ١ في الشهر", trend: "" },
    { label: "متوسط اليوم", value: arNum(avgDay), unit: MONEY, ico: "📊", delta: "في المتوسط", trend: "" },
  ].map((s) => `
    <div class="stat-card finances">
      <div class="sc-top"><span class="sc-ico">${s.ico}</span><span class="sc-label">${s.label}</span></div>
      <div class="sc-value"><b>${s.value}</b><span class="sc-unit">${s.unit}</span></div>
      <div class="sc-delta ${s.trend}">${s.delta}</div>
    </div>`).join("");
  renderFinIncome(incomeByMonth, curMonthKey);

  // الفلوس بتروح فين — بنود مصاريف الشهر (من يوم ١) كـ boxes
  const byCatMonth = {};
  for (const f of data.filter((f) => f.direction === "expense" && f.entry_date >= monthStart && isEGP(f))) {
    const c = f.category || "أخرى";
    byCatMonth[c] = (byCatMonth[c] || 0) + f.amount;
  }
  const catRows = Object.entries(byCatMonth).sort((a, b) => b[1] - a[1]);
  const catTotal = catRows.reduce((a, [, v]) => a + v, 0);
  if ($("finCatMonth")) $("finCatMonth").textContent = `الشهر ده · إجمالي ${arNum(catTotal)} ${MONEY}`;
  if ($("finCatBoxes")) {
    $("finCatBoxes").innerHTML = catRows.length
      ? catRows.map(([c, v]) => {
          const pct = catTotal ? Math.round((v / catTotal) * 100) : 0;
          return `<div class="cat-box"><span class="cb-ico">${CAT_ICONS[c] || "📦"}</span><span class="cb-cat">${escapeHtml(c)}</span><b class="cb-val">${arNum(v)} ${MONEY}</b><span class="cb-pct">${arNum(pct)}٪ من الصرف</span></div>`;
        }).join("")
      : `<span class="muted" style="font-size:var(--text-sm)">مفيش مصاريف الشهر ده لسه.</span>`;
  }

  // أعمدة الأسبوع — مرسومة باليد على canvas
  const weekData = week.map((d) => ({
    label: DAY_LETTER[new Date(d + "T00:00:00").getDay()],
    value: data.filter((f) => f.entry_date === d && f.direction === "expense" && isEGP(f)).reduce((a, f) => a + f.amount, 0),
  }));
  drawSketchBars($("finBars"), weekData, "finances", 200);

  // على إيه بتصرف — آخر ٣٠ يوم
  const month = lastNDays(30);
  const byCat = {};
  for (const f of data.filter((f) => f.direction === "expense" && month.includes(f.entry_date) && isEGP(f))) {
    const c = f.category || "أخرى";
    byCat[c] = (byCat[c] || 0) + f.amount;
  }
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const total = rows.reduce((a, [, v]) => a + v, 0);
  const accents = ["finances", "health", "goals", "habits", "coin", "", ""];
  $("catBars").innerHTML = rows.length
    ? rows.map(([c, v], i) => {
        const pct = total ? Math.round((v / total) * 100) : 0;
        return `<div class="cat-bar ${accents[i] || ""}">
          <div class="cb-top">
            <span>${CAT_ICONS[c] || "📦"} ${escapeHtml(c)}</span>
            <span class="cb-amount">${arNum(v)} ${MONEY} · ${arNum(pct)}٪</span>
          </div>
          <div class="cb-track"><div class="cb-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join("")
    : `<span class="muted" style="font-size:var(--text-sm)">قل لدوّنلي «صرفت ٢٠٠ على الطعام» وسيُصنّف هنا تلقائيًا.</span>`;

  // آخر حركات
  $("finTx").innerHTML = data.slice(0, 5).map((f) => `
    <div class="tl-row">
      <span class="tl-text" style="flex:1">${escapeHtml(f.note || f.category || "عملية")}</span>
      <span class="l-amount ${f.direction === "income" ? "pos" : "neg"}" style="font:var(--type-label)">${f.direction === "income" ? "+" : "-"}${arNum(f.amount)} ${curLabel(f)}</span>
    </div>`).join("") || `<span class="muted" style="font-size:var(--text-sm)">لا توجد حركات بعد.</span>`;

  // ميزانية/هدف الشهر + قائمة العمليات بفلاتر وتحميل المزيد
  renderBudget();
  fillFinFilterCat();
  renderFinList();
}
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthShortKey = (k) => AR_MONTHS[Number((k || "").split("-")[1]) - 1] || k;
// مقارنة الدخل آخر ٦ شهور (بالجنيه)
function renderFinIncome(incomeByMonth, curKey) {
  const el = $("finIncome"); if (!el) return;
  const keys = [];
  let [y, m] = curKey.split("-").map(Number);
  for (let i = 0; i < 6; i++) { keys.unshift(`${y}-${String(m).padStart(2, "0")}`); m--; if (m < 1) { m = 12; y--; } }
  const vals = keys.map((k) => Math.round(incomeByMonth[k] || 0));
  const max = Math.max(1, ...vals);
  const last = keys.length - 1;
  el.innerHTML = `
    <div class="inc-now"><span class="inc-now-val">${arNum(vals[last])} ${MONEY}</span><span class="muted">دخل شهر ${monthShortKey(curKey)}</span></div>
    <div class="inc-bars">${keys.map((k, i) => {
      const h = Math.round((vals[i] / max) * 100);
      return `<div class="inc-col"><span class="inc-col-val">${vals[i] ? arNum(vals[i]) : "—"}</span><div class="inc-bar-track"><div class="inc-bar-fill${i === last ? " now" : ""}" style="height:${Math.max(2, h)}%"></div></div><span class="inc-col-lbl">${monthShortKey(k)}</span></div>`;
    }).join("")}</div>`;
}

/* ---- قائمة العمليات: فلاتر + تحميل المزيد ---- */
function finRowHtml(f) {
  return `<div class="list-row">
    <div class="lm">
      <span class="l1">${f.direction === "income" ? "➕ دخل" : "➖ صرف"} · ${fmtShort(f.entry_date)}${f.category ? ` · ${CAT_ICONS[f.category] || ""} ${escapeHtml(f.category)}` : ""}</span>
      <span class="l2">${escapeHtml(f.note || "—")}</span>
    </div>
    <div class="row-actions">
      <span class="l-amount ${f.direction === "income" ? "pos" : "neg"}">${arNum(f.amount)} ${curLabel(f)}</span>
      <button class="icon-btn" onclick="openEdit('finance', ${f.id})" title="تعديل">✏️</button>
      <button class="icon-btn" onclick="del('finance', ${f.id})" title="حذف">🗑️</button>
    </div>
  </div>`;
}
function fillFinFilterCat() {
  const sel = $("finFilterCat");
  if (!sel) return;
  const cur = state.finFilter.cat;
  const cats = [...new Set(state.finance.map((f) => f.category || "أخرى"))];
  sel.innerHTML = `<option value="all">كل البنود</option>` + cats.map((c) => `<option value="${escapeHtml(c)}">${CAT_ICONS[c] || ""} ${escapeHtml(c)}</option>`).join("");
  sel.value = cur === "all" || cats.includes(cur) ? cur : "all";
}
function applyFinFilter() {
  const f = state.finFilter;
  let rows = state.finance;
  if (f.dir !== "all") rows = rows.filter((r) => r.direction === f.dir);
  if (f.cat !== "all") rows = rows.filter((r) => (r.category || "أخرى") === f.cat);
  const q = (f.q || "").trim();
  if (q) rows = rows.filter((r) => (r.note || "").includes(q) || (r.category || "").includes(q));
  return rows;
}
function renderFinList() {
  const el = $("finList");
  if (!el) return;
  const all = applyFinFilter();
  const shown = all.slice(0, state.finFilter.limit);
  const exp = all.filter((r) => r.direction === "expense").reduce((a, r) => a + r.amount, 0);
  const inc = all.filter((r) => r.direction === "income").reduce((a, r) => a + r.amount, 0);
  const meta = $("finFilterMeta");
  if (meta) meta.innerHTML = all.length ? `${arNum(all.length)} عملية · صرف ${arNum(exp)} ${MONEY}${inc ? ` · دخل ${arNum(inc)} ${MONEY}` : ""}` : "";
  el.innerHTML = shown.length ? shown.map(finRowHtml).join("") : `<div class="empty sm">${DOODLE}<p>مفيش عمليات بالفلاتر دي.</p></div>`;
  const lm = $("finLoadMore");
  if (lm) lm.innerHTML = all.length > shown.length ? `<button class="btn secondary sm" id="finMoreBtn">تحميل المزيد (${arNum(all.length - shown.length)} فاضلين)</button>` : "";
}
$("finFilterDir")?.addEventListener("change", (e) => { state.finFilter.dir = e.target.value; state.finFilter.limit = 40; renderFinList(); });
$("finFilterCat")?.addEventListener("change", (e) => { state.finFilter.cat = e.target.value; state.finFilter.limit = 40; renderFinList(); });
$("finFilterQ")?.addEventListener("input", (e) => { state.finFilter.q = e.target.value; state.finFilter.limit = 40; renderFinList(); });
$("finLoadMore")?.addEventListener("click", (e) => { if (e.target.id === "finMoreBtn") { state.finFilter.limit += 40; renderFinList(); } });

/* ---- ميزانية وهدف الشهر ---- */
function monthLabel(m) {
  try { return new Date(m + "-01T00:00:00").toLocaleDateString("ar-EG", { month: "long", year: "numeric" }); }
  catch { return m; }
}
function renderBudget() {
  const b = state.finBudget || {};
  const monthStr = TODAY().slice(0, 7);
  const monthStart = monthStr + "-01";
  const isEGP = (f) => !f.currency || f.currency === "جنيه";
  const monthFin = state.finance.filter((f) => f.entry_date >= monthStart && isEGP(f));
  const spent = monthFin.filter((f) => f.direction === "expense").reduce((a, f) => a + f.amount, 0);
  // الدخل بيحسب كل العملات محوّلة للجنيه (عشان الدولار يسمع برضه)
  const income = state.finance.filter((f) => f.direction === "income" && f.entry_date >= monthStart).reduce((a, f) => a + finToEgp(f), 0);
  const incomeR = Math.round(income);
  if ($("budgetMonth")) $("budgetMonth").textContent = monthLabel(monthStr);
  const bar = (cur, target, kind) => {
    const pct = target > 0 ? Math.round((cur / target) * 100) : 0;
    const lvl = kind === "spend" ? (pct >= 100 ? "danger" : pct >= 80 ? "warn" : "ok") : "ok";
    return `<div class="budget-bar ${lvl}">
      <div class="bb-track"><div class="bb-fill" style="width:${Math.min(100, pct)}%"></div></div>
      <div class="bb-meta"><span>${arNum(cur)} / ${arNum(target)} ${MONEY}</span><span>${arNum(pct)}٪</span></div>
      ${kind === "spend" && pct >= 100 ? `<div class="bb-alert danger">🚨 تخطّيت ميزانية الشهر بـ ${arNum(cur - target)} ${MONEY}!</div>` : ""}
      ${kind === "spend" && pct >= 80 && pct < 100 ? `<div class="bb-alert warn">⚠️ قرّبت من حد الميزانية — فاضل ${arNum(target - cur)} ${MONEY}</div>` : ""}
    </div>`;
  };
  let html = "";
  if (b.budget) html += `<div class="budget-row"><span class="br-label">💸 الصرف مقابل الميزانية</span>${bar(spent, b.budget, "spend")}</div>`;
  if (b.goal) html += `<div class="budget-row"><span class="br-label">🎯 الدخل مقابل هدف الشهر</span>${bar(incomeR, b.goal, "goal")}</div>`;
  if (!b.budget && !b.goal) html = `<p class="muted" style="font-size:var(--text-sm);margin:0">حدّد حد صرف شهري وهدف للشهر تحت — ودوّنلي يتابعهم وينبّهك لو قرّبت من الميزانية.</p>`;
  if ($("budgetView")) $("budgetView").innerHTML = html;
  if ($("budgetInput")) $("budgetInput").value = b.budget ?? "";
  if ($("goalInput")) $("goalInput").value = b.goal ?? "";
}
$("budgetForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const month = TODAY().slice(0, 7);
  try {
    const res = await api("/api/finance-budget", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, budget: $("budgetInput").value, goal: $("goalInput").value }) });
    const data = await res.json();
    state.finBudget = data.budget || state.finBudget;
  } catch {}
  renderBudget();
});
$("finForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const direction = $("finDir").value;
  const amount = $("finAmount").value;
  const category = $("finCategory").value;
  const currency = $("finCurrency")?.value || "جنيه";
  const note = $("finNote").value.trim();
  if (amount === "") return;
  await api("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction, amount, category, currency, note }) });
  e.target.reset();
  fillCategorySelect();
  await loadAll(false);
  renderFinancesPage();
});
function fillCategorySelect() {
  const sel = $("finCategory");
  if (!sel || !state.categories.length) return;
  sel.innerHTML = state.categories.map((c) => `<option value="${c}">${CAT_ICONS[c] || ""} ${c}</option>`).join("");
}

/* أعمدة مرسومة باليد — مقتبسة من BarChart بتاع الـ design system */
function drawSketchBars(canvas, data, accent = "finances", height = 200) {
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = wrap.clientWidth || 320;
  const H = height;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const stroke = cssVar(`--${accent}-deep`) || "#527F35";
  const fillBottom = cssVar(`--${accent}-tint`) || "#CFE3BD";
  const fillTop = cssVar(`--${accent}`) || "#6FA84A";
  const ink = cssVar("--ink-muted");
  const hair = cssVar("--hairline");

  const padX = 18, padTop = 16, padBottom = 34;
  const max = Math.max(...data.map((d) => d.value), 1);
  const n = data.length || 1;
  const slot = (W - padX * 2) / n;
  const bw = Math.min(slot * 0.56, 48);
  const jit = (i, k) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) * 2 - 1;

  // خط القاعدة المرسوم باليد
  ctx.strokeStyle = hair;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(padX, H - padBottom + 0.5);
  for (let x = padX; x <= W - padX; x += 14) ctx.lineTo(x, H - padBottom + Math.sin(x) * 0.6);
  ctx.stroke();

  data.forEach((d, i) => {
    const cx = padX + slot * i + slot / 2;
    const bh = Math.max((d.value / max) * (H - padTop - padBottom), 0.01);
    const x = cx - bw / 2 + jit(i, 1) * 1.2;
    const y = H - padBottom - bh;

    const grad = ctx.createLinearGradient(0, y, 0, H - padBottom);
    grad.addColorStop(0, fillTop);
    grad.addColorStop(1, fillBottom);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, bw, bh, 7);
    ctx.fill();

    if (d.value > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x + jit(i, 2), y + 6 + jit(i, 3));
      ctx.lineTo(x + jit(i, 4), y + jit(i, 2) - 0.5);
      ctx.lineTo(x + bw + jit(i, 5), y + jit(i, 6));
      ctx.lineTo(x + bw + jit(i, 7), H - padBottom);
      ctx.stroke();
    }

    ctx.fillStyle = ink;
    ctx.font = "13px Tajawal, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(d.label), cx, H - padBottom + 20);
  });
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2 || r);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, 0);
  ctx.arcTo(x, y + h, x, y, 0);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ===================== اليوميات ===================== */
function renderJournal() {
  const el = $("entries");
  const data = state.journal;
  if (!data.length) {
    el.innerHTML = emptyState("لا يوجد تدوين بعد", "سجّل صوتك أو اكتب عن يومك وأنا أرتّبه.");
    return;
  }
  el.innerHTML = data.map((e) => {
    const tags = (e.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    return `<article class="entry-card">
      <div class="e-head">
        <span class="e-date">${fmtDate(e.entry_date)}</span>
        <div class="row-actions">
          <span class="badge health"><span class="dot"></span>${moodInfo(e.mood).emoji} ${escapeHtml(e.mood || "")}</span>
          <button class="icon-btn" onclick="openEdit('entries', ${e.id})" title="تعديل">✏️</button>
          <button class="icon-btn" onclick="del('entries', ${e.id})" title="حذف">🗑️</button>
        </div>
      </div>
      <p class="e-summary">${escapeHtml(e.summary || "")}</p>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      <details><summary>النص الكامل</summary><p>${escapeHtml(e.transcript || "")}</p></details>
    </article>`;
  }).join("");
}
async function analyze() {
  const days = $("days").value;
  const analysisEl = $("analysis");
  analysisEl.classList.remove("hidden");
  analysisEl.innerHTML = `<div class="loading"><span class="spinner"></span> بحلّل أيامك…</div>`;
  $("analyzeBtn").disabled = true;
  try {
    const res = await api(`/api/analyze?days=${days}`);
    const data = await res.json();
    analysisEl.innerHTML = renderRich(data.analysis || data.error || "");
  } catch { analysisEl.innerHTML = `<p class="muted">حصل خطأ في التحليل.</p>`; }
  finally { $("analyzeBtn").disabled = false; }
}
$("analyzeBtn").addEventListener("click", analyze);

/* ===================== التقرير الشامل ===================== */
async function makeReport() {
  const days = $("reportDays").value;
  const box = $("reportResult");
  box.classList.remove("hidden");
  box.innerHTML = `<div class="loading"><span class="spinner"></span> بجمّع كل كلامك وبجهّز التقرير… ممكن ياخد شوية</div>`;
  $("reportBtn").disabled = true;
  try {
    const res = await api(`/api/report?days=${days}`);
    const data = await res.json();
    box.innerHTML = data.report ? renderRich(data.report) : `<p class="muted">${escapeHtml(data.error || "حصل خطأ")}</p>`;
  } catch { box.innerHTML = `<p class="muted">حصل خطأ في توليد التقرير.</p>`; }
  finally { $("reportBtn").disabled = false; }
}
$("reportBtn").addEventListener("click", makeReport);

/* ===================== المهام والتقويم ===================== */
const AR_WD = ["سبت", "حد", "اتنين", "تلات", "أربع", "خميس", "جمعة"];
const wdIndex = (jsDay) => (jsDay + 1) % 7; // السبت أول الأسبوع
function isoOf(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function renderCalendar() {
  if (!state.selDate) state.selDate = TODAY();
  $("calWeekdays").innerHTML = AR_WD.map((w) => `<span>${w}</span>`).join("");
  const { calY: y, calM: m } = state;
  $("calTitle").textContent = new Date(y, m, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = wdIndex(new Date(y, m, 1).getDay());
  const byDate = {};
  for (const t of state.tasks) (byDate[t.due_date] = byDate[t.due_date] || []).push(t);

  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<span class="cal-cell blank"></span>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoOf(y, m, d);
    const dayTasks = byDate[iso] || [];
    const pending = dayTasks.filter((t) => t.status === "pending").length;
    const done = dayTasks.filter((t) => t.status === "done").length;
    const cls = ["cal-cell", iso === TODAY() ? "today" : "", iso === state.selDate ? "sel" : ""].filter(Boolean).join(" ");
    const dots = (pending ? `<i class="cd p"></i>` : "") + (done ? `<i class="cd d"></i>` : "");
    cells += `<button class="${cls}" data-date="${iso}"><span class="cal-num">${arNum(d)}</span><span class="cal-dots">${dots}</span></button>`;
  }
  $("calGrid").innerHTML = cells;
  $("calGrid").querySelectorAll(".cal-cell[data-date]").forEach((c) =>
    c.addEventListener("click", () => { state.selDate = c.dataset.date; renderCalendar(); })
  );

  const isToday = state.selDate === TODAY();
  $("dayTasksTitle").textContent = isToday ? "مهام اليوم" : `مهام ${fmtDate(state.selDate)}`;
  const sel = (byDate[state.selDate] || []).slice().sort((a, b) => ((a.due_time || "99") < (b.due_time || "99") ? -1 : 1));
  renderTaskRows($("dayTasks"), sel, "مفيش مهام في اليوم ده — ضيف واحدة فوق ✍️");
  // المهام العامة (من غير يوم) — due_date فاضي
  const general = state.tasks.filter((t) => !t.due_date).sort((a, b) => (a.status === b.status ? 0 : a.status === "done" ? 1 : -1));
  renderTaskRows($("generalTasks"), general, "مفيش مهام عامة — فعّل «عامة» وانت بتضيف مهمة ملهاش يوم 📌");
}
// نحوّل الروابط في النص لروابط قابلة للضغط (آمنة)
function linkify(text) {
  return escapeHtml(String(text || "")).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
function renderTaskRows(el, tasks, emptyMsg) {
  if (!el) return;
  if (!tasks.length) {
    el.innerHTML = `<div class="empty sm">${DOODLE}<p>${emptyMsg || "مفيش مهام هنا — ضيف واحدة ✍️"}</p></div>`;
    return;
  }
  el.innerHTML = tasks.map((t) => `
    <div class="task-row ${t.status === "done" ? "done" : ""}">
      <button class="task-check" onclick="toggleTask(${t.id}, '${t.status}')" title="${t.status === "done" ? "رجّعها" : "خلصت"}">${t.status === "done" ? "✓" : ""}</button>
      <div class="lm" style="flex:1;cursor:pointer" onclick="openTaskDetail(${t.id})" title="عرض التفاصيل">
        <span class="task-title">${escapeHtml(t.title)}${t.resources ? ` <span class="res-dot" title="فيها موارد">📎</span>` : ""}</span>
        ${t.note ? `<span class="task-note">${escapeHtml(t.note)}</span>` : ""}
      </div>
      <div class="row-actions">
        ${t.due_time ? `<span class="time-chip">⏰ ${t.due_time}</span>` : ""}
        <button class="icon-btn" onclick="openTaskDetail(${t.id})" title="عرض المهمة">👁</button>
        <button class="icon-btn" onclick="openEdit('tasks', ${t.id})" title="تعديل">✏️</button>
        <button class="icon-btn" onclick="delTask(${t.id})" title="حذف">🗑️</button>
      </div>
    </div>`).join("");
}
// بوب-اب عرض المهمة بالموارد (وصف/روابط)
function openTaskDetail(id) {
  const t = (state.tasks || []).find((x) => x.id === id);
  if (!t) return;
  closeTaskDetail();
  const isGeneral = !t.due_date;
  const when = isGeneral ? "📌 مهمة عامة (من غير يوم محدّد)" : `🗓 ${fmtDate(t.due_date)}${t.due_time ? " · ⏰ " + t.due_time : ""}`;
  const ov = document.createElement("div");
  ov.className = "modal-overlay"; ov.id = "taskDetailOv";
  ov.innerHTML = `<div class="modal" style="max-width:480px;text-align:right">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">
      <h3 class="modal-title" style="margin:0">${t.status === "done" ? "✅ " : "📋 "}${escapeHtml(t.title)}</h3>
      <button class="icon-btn" onclick="closeTaskDetail()" aria-label="إغلاق">✕</button>
    </div>
    <div class="muted" style="font-size:var(--text-sm);margin-bottom:14px">${when}</div>
    ${t.note ? `<div class="td-sec"><span class="td-label">ملاحظة</span><p>${escapeHtml(t.note)}</p></div>` : ""}
    <div class="td-sec"><span class="td-label">📎 الموارد</span>${t.resources ? `<div class="td-res">${linkify(t.resources)}</div>` : `<p class="muted" style="margin:0">مفيش موارد لسه — اضغط «تعديل» وضيف وصف/مصادر/روابط.</p>`}</div>
    <div class="ef-actions" style="margin-top:16px">
      <button class="btn secondary sm" onclick="closeTaskDetail(); openEdit('tasks', ${t.id})">✏️ تعديل</button>
      <button class="btn sm" onclick="closeTaskDetail(); toggleTask(${t.id}, '${t.status}')">${t.status === "done" ? "↩️ رجّعها" : "✓ خلصت"}</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if (e.target === ov) closeTaskDetail(); });
}
function closeTaskDetail() { $("taskDetailOv")?.remove(); }
window.openTaskDetail = openTaskDetail;
window.closeTaskDetail = closeTaskDetail;
async function toggleTask(id, status) {
  await api(`/api/tasks/${id}/${status === "done" ? "reopen" : "done"}`, { method: "PUT" });
  await loadAll(false);
  renderCalendar();
}
window.toggleTask = toggleTask;
async function delTask(id) {
  if (!(await askConfirm())) return;
  await api(`/api/tasks/${id}`, { method: "DELETE" });
  await loadAll(false);
  renderCalendar();
}
window.delTask = delTask;
$("taskResToggle")?.addEventListener("click", () => $("taskResources")?.classList.toggle("hidden"));
$("taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("taskTitle").value.trim();
  const dueTime = $("taskTime").value || null;
  const resources = $("taskResources")?.value.trim() || "";
  const general = $("taskGeneral")?.checked;
  if (!title) return;
  await api("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, dueDate: general ? "" : (state.selDate || TODAY()), dueTime: general ? null : dueTime, resources }),
  });
  e.target.reset();
  $("taskResources")?.classList.add("hidden");
  await loadAll(false);
  renderCalendar();
});
$("calPrev").addEventListener("click", () => { state.calM--; if (state.calM < 0) { state.calM = 11; state.calY--; } renderCalendar(); });
$("calNext").addEventListener("click", () => { state.calM++; if (state.calM > 11) { state.calM = 0; state.calY++; } renderCalendar(); });
$("calToday").addEventListener("click", () => {
  const n = new Date();
  state.calY = n.getFullYear(); state.calM = n.getMonth(); state.selDate = TODAY();
  renderCalendar();
});

/* ===================== الأفكار (دماغك) — هَب موحّد مع المهام/التقويم ===================== */
const IDEA_STATUS = {
  inbox: { label: "فكرة", emoji: "💡" },
  planned: { label: "مخطّط لها", emoji: "📌" },
  done: { label: "اتعملت", emoji: "✅" },
};
function renderIdeasPage() {
  renderIdeas();
}
function renderTasksPage() {
  renderCalendar();
}

/* ===================== الأصول (دهب / كاش / أصول تانية) ===================== */
const ASSET_ICON = { gold: "🪙", cash: "💵", other: "🏷️", liability: "📉" };
const KARATS = [24, 22, 21, 18, 14];
// قيمة قطعة دهب (جرام × عدد × سعر الجرام × العيار) بالجنيه
function goldItemEgp(it, g24) {
  if (!g24) return null;
  return (Number(it.g) || 0) * (Number(it.n) || 0) * g24 * ((Number(it.k) || 24) / 24);
}
// قيمة الأصل بالجنيه حسب أسعار السوق
function assetValueEgp(a, market) {
  const rates = (market && market.rates) || {};
  if (a.type === "gold") {
    const g24 = market && market.goldG24Egp;
    if (!g24) return null;
    if (Array.isArray(a.items) && a.items.length)
      return a.items.reduce((s, it) => s + (goldItemEgp(it, g24) || 0), 0);
    if (!a.quantity) return null;
    return a.quantity * g24 * ((a.karat || 24) / 24);
  }
  if (a.type === "cash" || a.type === "liability") {
    // الكاش والالتزام: مبلغ بعملة (بنحوّله للجنيه بسعر اليوم — بيتحدّث مع تحديث الأسعار)
    const amt = a.quantity || 0;
    const cur = a.currency || "EGP";
    if (cur === "EGP") return amt;
    const rate = rates[cur];
    return rate ? amt * rate : null;
  }
  // other → قيمة يدوية بالجنيه
  return a.manual_value != null ? a.manual_value : null;
}
async function renderAssetsPage() {
  try {
    const d = await api("/api/assets").then((r) => r.json());
    state.assets = d.assets || [];
    state.market = d.market || state.market;
  } catch {}
  renderAssets();
}
function renderAssets() {
  const market = state.market || {};
  const mEl = $("assetsMarket");
  if (mEl) {
    const gold = market.goldG24Egp ? `${arNum(Math.round(market.goldG24Egp))} ج/جرام (ع٢٤)` : "—";
    const usd = market.rates && market.rates.USD ? `${arNum(Number(market.rates.USD).toFixed(2))} ج/دولار` : "—";
    const when = market.updatedAt ? fmtNotifTime(market.updatedAt) : "لسه ماتحدّثش";
    mEl.innerHTML = `<span>🪙 الدهب: <b>${gold}</b></span><span>💵 الدولار: <b>${usd}</b></span><span class="muted">آخر تحديث: ${when}</span>`;
  }
  const withVal = (state.assets || []).map((a) => ({ ...a, _val: assetValueEgp(a, market) }));
  const sumType = (t) => withVal.filter((a) => a.type === t).reduce((s, a) => s + (a._val || 0), 0);
  const liabilities = sumType("liability");
  const assetsSum = sumType("gold") + sumType("cash") + sumType("other");
  const total = assetsSum - liabilities;            // صافي الثروة (بعد خصم الالتزامات)
  const liquid = sumType("gold") + sumType("cash"); // من غير الأصول التانية (سائل)
  const tEl = $("assetsTotal");
  if (tEl) {
    tEl.innerHTML = `
      <div class="at-main"><span class="at-label">صافي ثروتك التقريبي</span><span class="at-value">${arNum(Math.round(total))} ${MONEY}</span></div>
      <div class="at-sub-main"><span class="at-label">صافي الثروة من غير الأصول التانية <span class="muted">(دهب + كاش)</span></span><span class="at-value2">${arNum(Math.round(liquid))} ${MONEY}</span></div>
      <div class="at-breakdown">
        <span>🪙 دهب: ${arNum(Math.round(sumType("gold")))}</span>
        <span>💵 كاش: ${arNum(Math.round(sumType("cash")))}</span>
        <span>🏷️ أصول تانية: ${arNum(Math.round(sumType("other")))}</span>
        ${liabilities ? `<span class="at-neg">📉 التزامات: −${arNum(Math.round(liabilities))}</span>` : ""}
      </div>`;
  }
  const el = $("assetsList");
  if (!el) return;
  if (!withVal.length) {
    el.innerHTML = emptyState("مفيش أصول بعد", "ضيف دهب/كاش/أصل/التزام من فوق، ودوّنلي يحسبلك قيمتها وإجمالي ثروتك.");
    return;
  }
  const g24 = market.goldG24Egp;
  el.innerHTML = withVal.map((a) => {
    const isLiab = a.type === "liability";
    const curName = (c) => ({ EGP: "جنيه", USD: "دولار", EUR: "يورو", SAR: "ريال", AED: "درهم", GBP: "إسترليني" }[c] || c || "جنيه");
    const detail = a.type === "gold" ? `إجمالي ${arNum(a.quantity || 0)} جرام`
      : a.type === "cash" ? `${arNum(a.quantity || 0)} ${curName(a.currency)}`
      : isLiab ? `${arNum(a.quantity || 0)} ${curName(a.currency)} متبقّي عليك`
      : "أصل";
    const valStr = a._val != null ? `${isLiab ? "−" : ""}${arNum(Math.round(a._val))} ${MONEY}` : `<span class="muted">محتاج سعر — حدّث الأسعار</span>`;
    // قايمة بنود الدهب (كل قطعة: عدد + قيمة تقريبية)
    let itemsList = "";
    if (a.type === "gold" && Array.isArray(a.items) && a.items.length) {
      itemsList = `<ul class="asset-items">` + a.items.map((it) => {
        const grams = (Number(it.g) || 0) * (Number(it.n) || 0);
        const v = goldItemEgp(it, g24);
        return `<li><span>${arNum(it.g)}ج × عيار ${arNum(it.k || 24)} × ${arNum(it.n)} قطعة <span class="muted">= ${arNum(grams)}ج</span></span><b>${v != null ? arNum(Math.round(v)) + " " + MONEY : "—"}</b></li>`;
      }).join("") + `</ul>`;
    }
    let goalBar = "";
    if (a.goal && a._val != null) {
      const pct = Math.min(100, Math.round((a._val / a.goal) * 100));
      const left = Math.max(0, a.goal - a._val);
      goalBar = `<div class="asset-goal"><div class="ag-track"><div class="ag-fill" style="width:${pct}%"></div></div><span>${arNum(pct)}٪ من هدف ${arNum(a.goal)} · ناقص ${arNum(Math.round(left))}</span></div>`;
    }
    const dn = a.type === "gold" ? "دهب" : a.type === "cash" ? "كاش" : isLiab ? "التزام" : "أصل";
    return `<div class="asset-card asset-${a.type}">
      <div class="asset-top">
        <span class="asset-name">${ASSET_ICON[a.type]} ${escapeHtml(a.name || dn)}</span>
        <span class="asset-val${isLiab ? " neg" : ""}">${valStr}</span>
      </div>
      <div class="asset-mid">
        <span class="asset-detail">${detail}${a.note ? " · " + escapeHtml(a.note) : ""}</span>
        <span class="row-actions"><button class="icon-btn" onclick="openEditAsset(${a.id})" title="تعديل">✏️</button><button class="icon-btn" onclick="del('assets', ${a.id})" title="حذف">🗑️</button></span>
      </div>
      ${itemsList}
      ${goalBar}
    </div>`;
  }).join("");
}
/* ---- بنود الدهب (repeater) ---- */
function goldItemRow(it) {
  it = it || { g: "", k: 24, n: 1 };
  const opts = KARATS.map((k) => `<option value="${k}"${Number(it.k) === k ? " selected" : ""}>عيار ${arNum(k)}</option>`).join("");
  return `<div class="agb-row">
    <input type="number" step="any" inputmode="decimal" class="field gi-g" placeholder="جرام" value="${it.g ?? ""}" />
    <select class="field gi-k">${opts}</select>
    <input type="number" step="1" min="1" inputmode="numeric" class="field gi-n" placeholder="عدد" value="${it.n ?? 1}" />
    <button type="button" class="icon-btn gi-del" title="شيل القطعة">✕</button>
  </div>`;
}
function setGoldItems(items) {
  const box = $("assetGoldItems"); if (!box) return;
  const arr = (Array.isArray(items) && items.length) ? items : [{ g: "", k: 24, n: 1 }];
  box.innerHTML = arr.map(goldItemRow).join("");
}
function collectGoldItems() {
  return [...document.querySelectorAll("#assetGoldItems .agb-row")].map((r) => ({
    g: Number(r.querySelector(".gi-g")?.value) || 0,
    k: Number(r.querySelector(".gi-k")?.value) || 24,
    n: Number(r.querySelector(".gi-n")?.value) || 1,
  })).filter((it) => it.g > 0 && it.n > 0);
}
function updateAssetFields() {
  const t = $("assetType")?.value || "gold";
  const show = (id, on) => { $(id)?.classList.toggle("hidden", !on); };
  show("assetGoldBox", t === "gold");                 // تفصيل القطع للدهب بس
  show("assetQty", t === "cash" || t === "liability"); // مبلغ الكاش/الالتزام
  show("assetKarat", false);                           // العيار بقى لكل قطعة جوّه البنود
  show("assetCurrency", t === "cash" || t === "liability"); // العملة للكاش والالتزام
  show("assetValue", t === "other");                   // القيمة اليدوية للأصل التاني بس
  if ($("assetQty")) $("assetQty").placeholder = t === "liability" ? "المبلغ المتبقّي عليك" : "المبلغ";
  if ($("assetValue")) $("assetValue").placeholder = "القيمة بالجنيه";
  if (t === "gold" && $("assetGoldItems") && !$("assetGoldItems").children.length) setGoldItems(null);
  if ($("assetFormHint")) $("assetFormHint").textContent =
    t === "gold" ? "ضيف كل قطعة دهب لوحدها (جرام/عيار/عدد) ودوّنلي يحسب قيمتها من سعر اليوم."
    : t === "cash" ? "لو عملة غير الجنيه، يحوّلها بسعر اليوم."
    : t === "liability" ? "التزام عليك (قسط/دين) بالجنيه أو الدولار — بيتحوّل بسعر اليوم وبيتخصم من صافي ثروتك."
    : "اكتب قيمة الأصل بالجنيه (زي العربية).";
}
function resetAssetForm() {
  $("assetForm")?.reset();
  if ($("assetEditId")) $("assetEditId").value = "";
  if ($("assetFormTitle")) $("assetFormTitle").textContent = "ضيف أصل";
  if ($("assetSubmit")) $("assetSubmit").textContent = "＋ إضافة";
  $("assetCancelEdit")?.classList.add("hidden");
  setGoldItems(null);
  updateAssetFields();
}
function openEditAsset(id) {
  const a = (state.assets || []).find((x) => x.id === id);
  if (!a) return;
  if ($("assetEditId")) $("assetEditId").value = a.id;
  $("assetType").value = a.type;
  $("assetName").value = a.name || "";
  $("assetQty").value = a.type === "gold" ? "" : (a.quantity ?? "");
  $("assetKarat").value = a.karat || 24;
  $("assetCurrency").value = a.currency || "EGP";
  $("assetValue").value = a.manual_value ?? "";
  $("assetGoal").value = a.goal ?? "";
  if (a.type === "gold")
    setGoldItems(Array.isArray(a.items) && a.items.length ? a.items : (a.quantity ? [{ g: a.quantity, k: a.karat || 24, n: 1 }] : null));
  if ($("assetFormTitle")) $("assetFormTitle").textContent = "تعديل أصل";
  if ($("assetSubmit")) $("assetSubmit").textContent = "💾 حفظ";
  $("assetCancelEdit")?.classList.remove("hidden");
  updateAssetFields();
  $("assetForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("assetName")?.focus(), 200);
}
window.openEditAsset = openEditAsset;
$("assetType")?.addEventListener("change", updateAssetFields);
$("assetAddItem")?.addEventListener("click", () => { $("assetGoldItems")?.insertAdjacentHTML("beforeend", goldItemRow()); });
$("assetGoldItems")?.addEventListener("click", (e) => {
  if (!e.target.closest(".gi-del")) return;
  const rows = document.querySelectorAll("#assetGoldItems .agb-row");
  if (rows.length > 1) e.target.closest(".agb-row").remove(); else setGoldItems(null);
});
$("assetCancelEdit")?.addEventListener("click", resetAssetForm);
$("assetForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = $("assetType").value;
  const editId = $("assetEditId")?.value || "";
  const items = type === "gold" ? collectGoldItems() : null;
  try {
    if (editId) {
      // التعديل بيستخدم أسماء أعمدة الـ DB (manual_value)
      const patch = { type, name: $("assetName").value.trim(), quantity: $("assetQty").value, karat: $("assetKarat").value, currency: $("assetCurrency").value, manual_value: $("assetValue").value, goal: $("assetGoal").value, items };
      await api(`/api/assets/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    } else {
      const body = { type, name: $("assetName").value.trim(), quantity: $("assetQty").value, karat: $("assetKarat").value, currency: $("assetCurrency").value, manualValue: $("assetValue").value, goal: $("assetGoal").value, items };
      await api("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
  } catch {}
  resetAssetForm();
  await renderAssetsPage();
});
updateAssetFields(); // ضبط ظهور الحقول من البداية
$("assetsRefresh")?.addEventListener("click", async () => {
  const btn = $("assetsRefresh");
  if (btn) { btn.disabled = true; btn.textContent = "بيحدّث…"; }
  try {
    const m = await api("/api/assets/refresh-prices", { method: "POST" }).then((r) => r.json());
    if (m && !m.error) state.market = m;
    renderAssets();
  } catch {}
  if (btn) { btn.disabled = false; btn.textContent = "🔄 حدّث الأسعار"; }
});
updateAssetFields();
function renderIdeas() {
  const el = $("ideasList");
  if (!el) return;
  const data = state.ideas;
  if (!data.length) {
    el.innerHTML = emptyState("لا توجد أفكار بعد", "اكتب فكرة بالأعلى، أو قل لدوّنلي «عندي فكرة…».");
    return;
  }
  el.innerHTML = data.map((i) => {
    const meta = IDEA_STATUS[i.status] || IDEA_STATUS.inbox;
    const done = i.status === "done";
    return `<div class="idea-card ${done ? "done" : ""}">
      <div class="ic-top">
        <span class="ic-title">${meta.emoji} ${escapeHtml(i.title)}</span>
        <span style="display:flex;gap:4px">
          <button class="icon-btn" onclick="openEdit('ideas', ${i.id})" title="تعديل">✏️</button>
          <button class="icon-btn" onclick="del('ideas', ${i.id})" title="حذف">🗑️</button>
        </span>
      </div>
      ${i.detail ? `<p class="ic-detail">${escapeHtml(i.detail)}</p>` : ""}
      <div class="ic-foot">
        <span class="badge ideas"><span class="dot"></span>${meta.label}</span>
        <div class="ic-actions">
          ${!done ? `<button class="btn ideas sm" onclick="ideaToTask(${i.id})">حوّلها لمهمة</button>` : ""}
          <button class="btn ghost sm" onclick="changeIdeaStatus(${i.id}, '${done ? "inbox" : "done"}')">${done ? "رجّعها" : "تمّت ✓"}</button>
        </div>
      </div>
    </div>`;
  }).join("");
}
async function changeIdeaStatus(id, status) {
  await api(`/api/ideas/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  await loadAll(false);
  renderIdeas();
}
window.changeIdeaStatus = changeIdeaStatus;
async function ideaToTask(id) {
  const idea = state.ideas.find((x) => x.id === id);
  if (!idea) return;
  await api("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: idea.title, dueDate: TODAY() }) });
  await api(`/api/ideas/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "planned" }) });
  await loadAll(false);
  renderIdeasPage();
}
window.ideaToTask = ideaToTask;
$("ideaForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("ideaTitle").value.trim();
  if (!title) return;
  await api("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
  e.target.reset();
  await loadAll(false);
  renderIdeas();
});

/* ===================== المشاكل (قلبك) ===================== */
const PROBLEM_AREAS = ["شغل", "صحة", "علاقات", "نفسي", "فلوس", "أخرى"];
const PROB_STATUS = {
  active: { label: "نشطة", cls: "danger" },
  working: { label: "بنشتغل عليها", cls: "warning" },
  resolved: { label: "اتحلّت", cls: "success" },
};
function fillProblemAreas() {
  const sel = $("problemArea");
  if (sel && !sel.children.length) sel.innerHTML = PROBLEM_AREAS.map((a) => `<option value="${a}">${a}</option>`).join("");
}
function renderProblemsPage() {
  fillProblemAreas();
  const el = $("problemsList");
  if (!el) return;
  const data = state.problems;
  if (!data.length) {
    el.innerHTML = emptyState("مفيش مشاكل مسجّلة", "احكِ لدوّنلي اللي مضايقك وهيطلّعه هنا، أو ضيفه بالأعلى.");
    return;
  }
  el.innerHTML = data.map((p) => {
    const st = PROB_STATUS[p.status] || PROB_STATUS.active;
    const resolved = p.status === "resolved";
    return `<div class="problem-card ${p.status}">
      <div class="pc-top">
        <span class="pc-title">🧩 ${escapeHtml(p.title)}</span>
        <span class="badge ${st.cls}"><span class="dot"></span>${st.label}</span>
      </div>
      ${p.detail ? `<p class="pc-detail">${escapeHtml(p.detail)}</p>` : ""}
      <div class="pc-foot">
        ${p.area ? `<span class="chip problems">${escapeHtml(p.area)}</span>` : ""}
        <div class="pc-actions">
          ${resolved
            ? `<button class="btn ghost sm" onclick="changeProblemStatus(${p.id}, 'active')">رجّعها</button>`
            : `${p.status === "active" ? `<button class="btn ghost sm" onclick="changeProblemStatus(${p.id}, 'working')">بنشتغل عليها</button>` : ""}
               <button class="btn problems sm" onclick="changeProblemStatus(${p.id}, 'resolved')">اتحلّت ✓</button>`}
          <button class="icon-btn" onclick="openEdit('problems', ${p.id})" title="تعديل">✏️</button>
          <button class="icon-btn" onclick="del('problems', ${p.id})" title="حذف">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join("");
}
async function changeProblemStatus(id, status) {
  await api(`/api/problems/${id}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  await loadAll(false);
  renderProblemsPage();
}
window.changeProblemStatus = changeProblemStatus;
$("problemForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("problemTitle").value.trim();
  const area = $("problemArea").value;
  if (!title) return;
  await api("/api/problems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, area }) });
  e.target.reset();
  fillProblemAreas();
  await loadAll(false);
  renderProblemsPage();
});

/* ===================== شيت «أقسام أكتر» (موبايل) ===================== */
function openMore() { $("moreSheet")?.classList.add("open"); $("moreScrim")?.classList.add("show"); syncFab(); }
function closeMore() { $("moreSheet")?.classList.remove("open"); $("moreScrim")?.classList.remove("show"); syncFab(); }
$("moreTabBtn")?.addEventListener("click", openMore);
$("moreClose")?.addEventListener("click", closeMore);
$("moreScrim")?.addEventListener("click", closeMore);
$("moreSheet")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".more-item");
  if (!btn) return;
  closeMore();
  gotoTab(btn.dataset.tab);
});

/* ===================== تصدير التدوينات في ملف ===================== */
function exportJournal() {
  const data = [...state.journal].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)); // الأحدث الأول
  if (!data.length) {
    $("exportBtn") && ($("exportBtn").textContent = "مفيش تدوينات");
    setTimeout(() => $("exportBtn") && ($("exportBtn").textContent = "⬇️ صدّر"), 1500);
    return;
  }
  const lines = [];
  lines.push(`تدوينات ${state.me?.name || "دوّنلي"}`);
  lines.push(`صُدّرت في ${fmtDate(TODAY())}`);
  lines.push("");
  for (const e of data) {
    lines.push("════════════════════════════════");
    lines.push(`تدوينات يوم ${fmtDate(e.entry_date)}`);
    if (e.mood) lines.push(`المزاج: ${e.mood}`);
    lines.push("");
    // الكلام الخام كامل زي ما اتقال/اتكتب (transcript) — مش التلخيص
    lines.push((e.transcript || e.summary || "").trim());
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `دوّنلي-تدويناتي-${TODAY()}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("exportBtn")?.addEventListener("click", exportJournal);

/* ===================== اسأل دوّنلي (شات سياقي) ===================== */
const askMessages = []; // ذاكرة المحادثة (بتتبعت كاملة للسيرفر عشان الـ context يفضل)
function renderAskThread() {
  const el = $("askThread");
  if (!el) return;
  if (!askMessages.length) {
    el.innerHTML = `<div class="ask-empty">اسألني عن أي يوم، أو «اعمللي ملخص للأسبوع»، أو «إيه اللي بيأثر على مزاجي؟» — وأنا أرد من تدويناتك.</div>`;
    return;
  }
  el.innerHTML = askMessages
    .map((m, i) => `<div class="ask-bubble ${m.role}">${m.pending ? `<span class="loading"><span class="spinner"></span> بفكّر…</span>` : escapeHtml(m.content)}${m.role === "assistant" && !m.pending && m.content ? ` <button class="tts-btn" data-i="${i}" title="اسمع الرد">🔊</button>` : ""}</div>`)
    .join("");
  el.scrollTop = el.scrollHeight;
}
function renderAskPage() {
  returnAskBoxHome(); // لو الصندوق كان مفتوح في الـ widget الطاير، رجّعه للصفحة
  $("askDate") && $("askDate").classList.toggle("hidden", $("askScope")?.value !== "day");
  renderAskThread();
}
$("askScope")?.addEventListener("change", () => {
  $("askDate")?.classList.toggle("hidden", $("askScope").value !== "day");
});
let askBusy = false;
$("askForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (askBusy) return; // يمنع إرسال تاني (بالـ Enter) والطلب لسه شغّال
  const input = $("askInput");
  const text = input.value.trim();
  if (!text) return;
  const scope = $("askScope")?.value || "all";
  const date = $("askDate")?.value || null;
  if (scope === "day" && !date) { input.placeholder = "اختار اليوم الأول ☝️"; return; }
  askBusy = true;
  askMessages.push({ role: "user", content: text });
  askMessages.push({ role: "assistant", content: "", pending: true });
  input.value = "";
  input.disabled = true;
  if ($("askSend")) $("askSend").disabled = true;
  renderAskThread();
  try {
    const payload = { messages: askMessages.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content })), scope, date };
    const res = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (askMessages[askMessages.length - 1]?.pending) askMessages.pop(); // شيل الـ pending بأمان
    askMessages.push({ role: "assistant", content: data.reply || data.error || "مقدرتش أرد، جرّب تاني" });
  } catch {
    if (askMessages[askMessages.length - 1]?.pending) askMessages.pop();
    askMessages.push({ role: "assistant", content: "حصل خطأ، جرّب تاني." });
  } finally {
    askBusy = false;
    input.disabled = false;
    if ($("askSend")) $("askSend").disabled = false;
    renderAskThread();
  }
});
// نحمّل المحادثة المحفوظة من السيرفر عشان تفضل موجودة بعد الريلود
async function loadAskHistory() {
  try {
    const h = await api("/api/ask/history").then((r) => r.json());
    askMessages.length = 0;
    for (const m of h || []) if (m && m.content) askMessages.push({ role: m.role, content: m.content });
  } catch {}
  renderAskThread();
}
$("askClear")?.addEventListener("click", async () => {
  if (!askMessages.length) return;
  if (!(await askConfirm())) return;
  try { await api("/api/ask/history", { method: "DELETE" }); } catch {}
  askMessages.length = 0;
  renderAskThread();
});

/* ---- محادثة صوتية: تسجيل + رد صوتي ---- */
let askRec = null, askRecChunks = [];
async function toggleAskVoice() {
  const mic = $("askMic");
  if (askRec && askRec.state === "recording") { askRec.stop(); return; }
  if (askBusy) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    askMessages.push({ role: "assistant", content: "متصفحك مش بيدعم التسجيل — اكتب سؤالك 🙏" });
    renderAskThread();
    return;
  }
  let stream;
  try { stream = await getMic(); stream.getTracks().forEach((t) => (t.enabled = true)); }
  catch { askMessages.push({ role: "assistant", content: "لازم تسمح للمايك عشان أسمعك 🎙️" }); renderAskThread(); return; }
  const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m)) || "";
  askRec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  askRecChunks = [];
  askRec.ondataavailable = (e) => { if (e.data.size) askRecChunks.push(e.data); };
  askRec.onstop = async () => {
    stream.getTracks().forEach((t) => (t.enabled = false));
    if (mic) { mic.classList.remove("recording"); mic.textContent = "🎙️"; }
    if (askRecChunks.length) await sendAskVoice(new Blob(askRecChunks, { type: askRec.mimeType || "audio/webm" }));
  };
  askRec.start();
  if (mic) { mic.classList.add("recording"); mic.textContent = "⏹️"; }
}
async function sendAskVoice(blob) {
  if (askBusy) return;
  askBusy = true;
  if ($("askSend")) $("askSend").disabled = true;
  const ph = { role: "user", content: "🎙️ بسمعك وبفكّر…" };
  askMessages.push(ph);
  renderAskThread();
  const scope = $("askScope")?.value || "all";
  const date = $("askDate")?.value || "";
  try {
    const res = await api(`/api/ask/voice?scope=${encodeURIComponent(scope)}&date=${encodeURIComponent(date)}`, {
      method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob,
    });
    const data = await res.json();
    const i = askMessages.indexOf(ph);
    if (i >= 0) askMessages.splice(i, 1);
    if (data.transcript) askMessages.push({ role: "user", content: data.transcript });
    askMessages.push({ role: "assistant", content: data.reply || data.error || "مقدرتش أرد، جرّب تاني" });
    renderAskThread();
    if (data.reply && !data.error) playTTS(data.reply); // رد صوتي تلقائي لما تكلّمه صوت
  } catch {
    const i = askMessages.indexOf(ph);
    if (i >= 0) askMessages.splice(i, 1);
    askMessages.push({ role: "assistant", content: "حصل خطأ في الصوت، جرّب تاني." });
    renderAskThread();
  } finally {
    askBusy = false;
    if ($("askSend")) $("askSend").disabled = false;
  }
}
// تحويل النص لصوت عبر المتصفح (Web Speech API) — مجاني وبيدعم العربي على الموبايل،
// ومش محتاج access لموديل TTS من OpenAI.
function playTTS(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text || "").slice(0, 1200));
    u.lang = "ar-EG";
    const ar = (speechSynthesis.getVoices() || []).find((v) => /^ar/i.test(v.lang));
    if (ar) u.voice = ar;
    speechSynthesis.speak(u);
  } catch {}
}
$("askMic")?.addEventListener("click", toggleAskVoice);
$("askThread")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tts-btn");
  if (!btn) return;
  const m = askMessages[Number(btn.dataset.i)];
  if (m && m.content) playTTS(m.content);
});

/* ---- مكالمة صوتية مباشرة (turn-taking): يسمعك → يرد بصوت → يسمع تاني ----
   بنستخدم Web Speech API بتاع المتصفح (تعرّف صوت فوري + نطق) عشان تبقى محادثة
   حقيقية من غير ما تبعت ملف كل مرة، ومن غير ما نحتاج موديل TTS من OpenAI. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let callOn = false, recog = null, callTurnBusy = false;
function callSupported() { return !!SR; }
function setCallStatus(text, cls) {
  const s = $("callStatus"); if (s) s.textContent = text;
  const orb = $("callOrb"); if (orb) orb.className = "call-orb " + (cls || "");
}
async function startCall() {
  if (callOn) return;
  if (!callSupported()) {
    askMessages.push({ role: "assistant", content: "متصفحك مايدعمش المكالمة المباشرة 🙏 افتح دوّنلي من Chrome، أو استخدم زرار المايك 🎙️ (سجّل وابعت)." });
    renderAskThread();
    return;
  }
  // نطلب إذن المايك مرة عشان المتصفح ميقطعش المكالمة
  try { const st = await getMic(); st.getTracks().forEach((t) => t.stop()); }
  catch { askMessages.push({ role: "assistant", content: "لازم تسمح للمايك عشان نبدأ المكالمة 🎙️" }); renderAskThread(); return; }
  callOn = true;
  $("askCall")?.classList.remove("hidden");
  $("askForm")?.classList.add("hidden");
  try { speechSynthesis?.getVoices(); } catch {}
  listenTurn();
}
function listenTurn() {
  if (!callOn) return;
  recog = new SR();
  recog.lang = "ar-EG";
  recog.interimResults = true;
  recog.continuous = false;
  recog.maxAlternatives = 1;
  let finalText = "";
  setCallStatus("بسمعك… اتكلم 🎙️", "listening");
  recog.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    const cap = $("callCaption"); if (cap) cap.textContent = (finalText + " " + interim).trim();
  };
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") endCall("اتقفل إذن المايك — المكالمة خلصت.");
    // 'no-speech' / 'aborted' بيتعالجوا في onend
  };
  recog.onend = () => {
    if (!callOn || callTurnBusy) return;
    const text = finalText.trim();
    if (!text) { listenTurn(); return; } // مسمعش حاجة، يسمع تاني
    handleCallTurn(text);
  };
  try { recog.start(); } catch { setTimeout(() => { if (callOn) listenTurn(); }, 350); }
}
async function handleCallTurn(text) {
  callTurnBusy = true;
  askMessages.push({ role: "user", content: text });
  renderAskThread();
  setCallStatus("بفكّر… 🤔", "thinking");
  const cap = $("callCaption"); if (cap) cap.textContent = "";
  const scope = $("askScope")?.value || "all";
  const date = $("askScope")?.value === "day" ? ($("askDate")?.value || null) : null;
  let reply = "";
  try {
    // fast:true → السيرفر بيرد بموديل أسرع (gpt-4o-mini) وردّ مختصر مناسب للمكالمة
    const payload = { messages: askMessages.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content })).slice(-12), scope, date, fast: true };
    const res = await api("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    reply = data.reply || data.error || "مقدرتش أرد، قول تاني؟";
  } catch { reply = "حصل خطأ بسيط، تقول تاني؟"; }
  askMessages.push({ role: "assistant", content: reply });
  renderAskThread();
  callTurnBusy = false;
  if (callOn) speakThenListen(reply);
}
function speakThenListen(text) {
  if (!callOn) return;
  setCallStatus("بيتكلم… 🔊 (دوس الدايرة لو عايز تقاطعه)", "speaking");
  if (!("speechSynthesis" in window)) { listenTurn(); return; }
  try { speechSynthesis.cancel(); } catch {}
  const u = new SpeechSynthesisUtterance(String(text || "").slice(0, 1200));
  u.lang = "ar-EG";
  u.rate = 1.25; // أسرع شوية في المكالمة عشان الرد ميبقاش بطيء
  u.pitch = 1.0;
  const ar = (speechSynthesis.getVoices() || []).find((v) => /^ar/i.test(v.lang));
  if (ar) u.voice = ar;
  u.onend = () => { if (callOn) listenTurn(); };
  u.onerror = () => { if (callOn) listenTurn(); };
  speechSynthesis.speak(u);
}
function endCall(msg) {
  callOn = false; callTurnBusy = false;
  try { recog && recog.abort(); } catch {}
  recog = null;
  try { speechSynthesis.cancel(); } catch {}
  $("askCall")?.classList.add("hidden");
  $("askForm")?.classList.remove("hidden");
  setCallStatus("", "");
  const cap = $("callCaption"); if (cap) cap.textContent = "";
  if (msg) { askMessages.push({ role: "assistant", content: msg }); renderAskThread(); }
}
$("askCallBtn")?.addEventListener("click", startCall);
$("callEnd")?.addEventListener("click", () => endCall());
// دوس الدايرة وهو بيتكلم = قاطعه واسمعني (barge-in)
$("callOrb")?.addEventListener("click", () => {
  if (!callOn) return;
  try { speechSynthesis.cancel(); } catch {}
  if (!callTurnBusy) { try { recog && recog.abort(); } catch {} listenTurn(); }
});

/* ===================== مركز الملفات (رفع + تصنيف) ===================== */
const FILE_CAT_ICON = { "دواء": "💊", "روشتة": "📝", "تحليل": "🧪", "أشعة": "🩻", "فاتورة": "🧾", "مستند": "📄", "أخرى": "📎" };
function renderFilesPage() { renderFiles(); }
function renderFiles() {
  const el = $("filesGrid");
  if (!el) return;
  const all = state.files || [];
  // فلتر الفئات (chips)
  const filterEl = $("filesFilter");
  if (filterEl) {
    if (all.length) {
      const cats = [...new Set(all.map((f) => f.category || "مستند"))];
      filterEl.innerHTML = [["all", "الكل"]].concat(cats.map((c) => [c, c]))
        .map(([v, l]) => `<button class="filter-chip ${state.fileFilter === v ? "on" : ""}" data-cat="${escapeHtml(v)}">${v !== "all" ? (FILE_CAT_ICON[v] || "📄") + " " : ""}${escapeHtml(l)}</button>`)
        .join("");
    } else filterEl.innerHTML = "";
  }
  if (!all.length) {
    el.innerHTML = emptyState("مفيش ملفات بعد", "ارفع صورة دوا أو روشتة أو فاتورة وهتظهر هنا متصنّفة.");
    return;
  }
  const data = state.fileFilter === "all" ? all : all.filter((f) => (f.category || "مستند") === state.fileFilter);
  if (!data.length) {
    el.innerHTML = `<div class="empty sm">${DOODLE}<p>مفيش ملفات في الفئة دي.</p></div>`;
    return;
  }
  el.innerHTML = data
    .map((f) => {
      const isImg = (f.mime || "").startsWith("image/");
      const ico = FILE_CAT_ICON[f.category] || "📄";
      return `<div class="file-card">
        <a class="fc-thumb" href="/api/files/${f.id}/raw" target="_blank" rel="noopener">
          ${isImg ? `<img src="/api/files/${f.id}/raw" alt="${escapeHtml(f.filename)}" loading="lazy" />` : `<span class="fc-ico">${ico}</span>`}
        </a>
        <div class="fc-body">
          <span class="badge health"><span class="dot"></span>${ico} ${escapeHtml(f.category || "مستند")}</span>
          <div class="fc-name">${escapeHtml(f.description || f.filename)}</div>
          <div class="fc-foot">
            <span class="fc-date">${fmtShort((f.created_at || "").slice(0, 10))}</span>
            <button class="icon-btn" onclick="del('files', ${f.id})" title="حذف">🗑️</button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}
$("filesFilter")?.addEventListener("click", (e) => {
  const b = e.target.closest(".filter-chip");
  if (!b) return;
  state.fileFilter = b.dataset.cat;
  renderFiles();
});
$("fileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const status = $("fileUploadStatus");
  if (status) status.innerHTML = `<div class="loading"><span class="spinner"></span> بيرفع ويصنّف… ممكن ياخد ثواني</div>`;
  try {
    const res = await api(`/api/files?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const data = await res.json();
    if (data.error) {
      if (status) status.innerHTML = `<p class="muted">${escapeHtml(data.error)}</p>`;
    } else {
      if (status) status.innerHTML = `<p class="muted">✅ اترفع واتصنّف: ${escapeHtml(data.file?.category || "مستند")}</p>`;
      await loadAll(false);
      renderFiles();
      setTimeout(() => { if (status) status.innerHTML = ""; }, 2500);
    }
  } catch {
    if (status) status.innerHTML = `<p class="muted">حصل خطأ في الرفع، جرّب تاني.</p>`;
  }
  e.target.value = "";
});

/* ===================== المحادثات ===================== */
const KIND_LABEL = { voice: "🎙️ صوت", text: "⌨️ كتابة", command: "⚙️ أمر", checkin: "⏰ سؤال اليوم", dashboard: "✎ من الداشبورد" };
function renderChats() {
  const el = $("chats");
  const data = state.conversations;
  if (!data.length) { el.innerHTML = emptyState("لا توجد محادثات بعد", "بمجرد أن تحكي لدوّنلي ستجد كل شيء هنا."); return; }
  el.innerHTML = data.slice(0, 60).map((c) => `
    <div class="chat-card">
      <div class="chat-head">
        <span class="badge"><span class="dot"></span>${KIND_LABEL[c.kind] || "💬"}</span>
        <div class="row-actions">
          <span class="chat-date">${fmtDateTime(c.created_at)}</span>
          <button class="icon-btn" onclick="del('conversations', ${c.id})" title="حذف">🗑️</button>
        </div>
      </div>
      ${c.user_text ? `<div class="bubble user"><span class="who">أنت</span>${escapeHtml(c.user_text)}</div>` : ""}
      ${c.ai_reply ? `<div class="bubble ai"><span class="who">دوّنلي</span>${escapeHtml(c.ai_reply)}</div>` : ""}
    </div>`).join("");
}

/* ===================== خروج + تحميل ===================== */
async function logout() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
}
$("logoutBtn").addEventListener("click", logout);

async function loadAll(rerender = true) {
  try {
    const [me, j, g, h, c, cond, m, hab, fin, tasks, cats, prof, idea, prob, files, budget, th, mu, mk, met] = await Promise.all([
      api("/api/me").then((r) => r.json()),
      api("/api/entries").then((r) => r.json()),
      api("/api/goals").then((r) => r.json()),
      api("/api/health").then((r) => r.json()),
      api("/api/conversations").then((r) => r.json()),
      api("/api/conditions").then((r) => r.json()),
      api("/api/meals").then((r) => r.json()),
      api("/api/habits").then((r) => r.json()),
      api("/api/finance").then((r) => r.json()),
      api("/api/tasks").then((r) => r.json()),
      api("/api/finance-categories").then((r) => r.json()),
      api("/api/profile").then((r) => r.json()),
      api("/api/ideas").then((r) => r.json()),
      api("/api/problems").then((r) => r.json()),
      api("/api/files").then((r) => r.json()),
      api("/api/finance-budget").then((r) => r.json()),
      api("/api/thoughts").then((r) => r.json()),
      api("/api/my-usage").then((r) => r.json()),
      api("/api/market").then((r) => r.json()).catch(() => null),
      api("/api/metrics").then((r) => r.json()).catch(() => []),
    ]);
    state.me = me;
    state.journal = j; state.goals = g; state.health = h; state.conversations = c;
    state.conditions = cond; state.meals = m; state.habits = hab; state.finance = fin;
    state.tasks = tasks; state.categories = cats; state.profile = prof;
    state.ideas = idea; state.problems = prob; state.files = files; state.finBudget = budget;
    state.thoughts = th; state.myUsage = mu;
    state.metrics = Array.isArray(met) ? met : [];
    if (mk) state.market = mk; // أسعار السوق للتحويل في الفلوس
  } catch { return; }

  const first = (state.me?.name || "د").trim()[0] || "د";
  $("userAvatar").textContent = first;
  $("userName").textContent = state.me?.name || "صاحب الدفتر";
  fillCategorySelect();

  if (!rerender) return;
  renderOverview();
  renderJournal();
  renderChats();
  const active = document.querySelector('.nav-btn[data-active="true"]')?.dataset.tab;
  if (active === "health") renderHealthPage();
  if (active === "habits") renderHabitsPage();
  if (active === "goals") renderGoalsPage();
  if (active === "finances") renderFinancesPage();
  if (active === "ideas") renderIdeasPage();
  if (active === "tasks") renderTasksPage();
  if (active === "assets") renderAssetsPage();
  if (active === "problems") renderProblemsPage();
  if (active === "files") renderFilesPage();
  if (active === "thoughts") renderThoughts();
}

loadAll().then(() => {
  renderJournal();
  loadAskHistory();
  updatePendingBanner();   // لو فيه تسجيل محفوظ من مرة فاتت
  drainPending();          // وابعته لو النت موجود
  // رجّع آخر صفحة كان واقف فيها قبل الـ reload (الـ hash الأول لأنه أضمن، وإلا localStorage)
  try {
    const fromHash = (location.hash || "").replace(/^#/, "");
    let saved = fromHash || localStorage.getItem("dw_tab");
    // أي قسم اتدمج جوّه «دفترك» نفتح الهَب عليه
    if (["journal", "thoughts", "ideas", "problems"].includes(saved)) saved = "dafter";
    if (saved && saved !== "overview" && document.querySelector(`.tab-panel[data-panel="${saved}"]`)) {
      gotoTab(saved);
    }
  } catch {}
  if (state.me && !localStorage.getItem("dawenli_tour_v1")) setTimeout(startTour, 800);
});

/* ===================== الإشعارات (الجرس) + PWA ===================== */
function b64ToUint8(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const notif = { items: [], unread: 0, swReady: null };

function fmtNotifTime(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `من ${arNum(Math.floor(diff / 60))} دقيقة`;
  if (diff < 86400) return `من ${arNum(Math.floor(diff / 3600))} ساعة`;
  if (diff < 604800) return `من ${arNum(Math.floor(diff / 86400))} يوم`;
  try { return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "short" }); }
  catch { return ""; }
}

function setBadge(n) {
  notif.unread = n;
  document.querySelectorAll("[data-bell-badge]").forEach((b) => {
    b.textContent = n > 99 ? "99+" : arNum(n);
    b.classList.toggle("hidden", !n);
  });
}

function renderNotifList() {
  const list = $("notifList");
  if (!list) return;
  if (!notif.items.length) {
    list.innerHTML = `<div class="notif-empty">لا توجد إشعارات بعد.<br>ستصلك هنا تذكيرات المهام والمتابعة اليومية.</div>`;
    return;
  }
  list.innerHTML = notif.items.map((n) => `
    <div class="notif-item ${n.read_at ? "" : "unread"}" data-id="${n.id}" data-url="${escapeHtml(n.url || "/")}">
      <span class="ni-ico">${escapeHtml(n.icon || "🔔")}</span>
      <div class="ni-body">
        <div class="ni-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="ni-text">${escapeHtml(n.body)}</div>` : ""}
        <div class="ni-time">${fmtNotifTime(n.created_at)}</div>
      </div>
      ${n.read_at ? "" : `<span class="ni-dot"></span>`}
    </div>`).join("");
}

async function loadNotifications() {
  try {
    const d = await api("/api/notifications").then((r) => r.json());
    notif.items = d.items || [];
    setBadge(d.unread || 0);
    renderNotifList();
  } catch {}
}

function openNotif() {
  closeSidebar();
  $("notifPanel").classList.add("open");
  $("notifScrim").classList.add("show");
  $("notifPanel").setAttribute("aria-hidden", "false");
  syncFab();
  loadNotifications();
}
function closeNotif() {
  $("notifPanel").classList.remove("open");
  $("notifScrim").classList.remove("show");
  $("notifPanel").setAttribute("aria-hidden", "true");
  syncFab();
}

document.querySelectorAll("[data-bell]").forEach((b) =>
  b.addEventListener("click", () =>
    $("notifPanel").classList.contains("open") ? closeNotif() : openNotif()
  )
);
$("notifClose")?.addEventListener("click", closeNotif);
$("notifScrim")?.addEventListener("click", closeNotif);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNotif(); });

$("notifMarkAll")?.addEventListener("click", async () => {
  try {
    await api("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    notif.items.forEach((n) => (n.read_at = n.read_at || new Date().toISOString()));
    setBadge(0);
    renderNotifList();
  } catch {}
});

$("notifList")?.addEventListener("click", async (e) => {
  const item = e.target.closest(".notif-item");
  if (!item) return;
  const id = Number(item.dataset.id);
  const url = item.dataset.url || "/";
  if (item.classList.contains("unread")) {
    item.classList.remove("unread");
    item.querySelector(".ni-dot")?.remove();
    const row = notif.items.find((n) => n.id === id);
    if (row) row.read_at = new Date().toISOString();
    setBadge(Math.max(0, notif.unread - 1));
    api("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
  }
  if (url && url !== "/" && !location.pathname.endsWith(url)) location.href = url;
});

async function initPWA() {
  if (!("serviceWorker" in navigator)) { loadNotifications(); return; }
  try { await navigator.serviceWorker.register("/sw.js"); notif.swReady = await navigator.serviceWorker.ready; } catch {}
  loadNotifications();
  // تحديث خفيف للبادج كل دقيقة (من غير ما نقاطع اللوحة وهي مفتوحة)
  setInterval(() => { if (!$("notifPanel")?.classList.contains("open")) loadNotifications(); }, 60000);

  const pushRow = $("notifPush");
  const enableBtn = $("enablePushBtn");
  if (!pushRow || !enableBtn || !("PushManager" in window) || !("Notification" in window)) return;

  let key = null;
  try {
    const info = await api("/api/push/key").then((r) => r.json());
    if (!info.enabled) return; // الـpush متعطّل على السيرفر — نسيب صف التفعيل مخفي
    key = info.key;
  } catch { return; }

  const existing = notif.swReady ? await notif.swReady.pushManager.getSubscription() : null;
  if (existing && Notification.permission === "granted") return; // مفعّل خلاص

  pushRow.classList.remove("hidden");
  enableBtn.onclick = async () => {
    enableBtn.disabled = true;
    enableBtn.textContent = "بفعّل…";
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { enableBtn.textContent = "مرفوض"; return; }
      const sub = existing || (await notif.swReady.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(key),
      }));
      await api("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      await api("/api/push/test", { method: "POST" }).catch(() => {});
      pushRow.classList.add("hidden");
      loadNotifications();
    } catch (err) {
      console.error("push enable error:", err);
      enableBtn.disabled = false;
      enableBtn.textContent = "فعّل";
    }
  };
}
initPWA();
