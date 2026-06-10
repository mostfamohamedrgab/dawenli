/* ===================== State ===================== */
const state = {
  me: null,
  journal: [],
  goals: [],
  health: [],
  conversations: [],
  conditions: [],
  meals: [],
  habits: [],
  finance: [],
  tasks: [],
  usage: null,
  categories: [],
  pageDate: null,
  mealDate: null,
  calY: new Date().getFullYear(),
  calM: new Date().getMonth(),
  selDate: null,
};

const USD_TO_EGP = 50;

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

/* ===================== Navigation ===================== */
function gotoTab(tab) {
  document.querySelectorAll(".nav-btn[data-tab]").forEach((b) => b.dataset.active = String(b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
  const panel = document.querySelector(`.tab-panel[data-panel="${tab}"]`);
  if (panel) { panel.classList.remove("view-fade"); void panel.offsetWidth; panel.classList.add("view-fade"); }
  closeSidebar();
  if (tab === "overview") renderOverview();
  if (tab === "health") { renderHealthPage(); }
  if (tab === "habits") renderHabitsPage();
  if (tab === "goals") renderGoalsPage();
  if (tab === "finances") renderFinancesPage();
  if (tab === "tasks") renderCalendar();
  if (tab === "usage") renderUsage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("sideNav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-btn");
  if (btn) gotoTab(btn.dataset.tab);
});
document.querySelectorAll("[data-go]").forEach((c) => c.addEventListener("click", () => gotoTab(c.dataset.go)));

function openSidebar() { $("sidebar").classList.add("open"); $("sideScrim").classList.add("show"); }
function closeSidebar() { $("sidebar").classList.remove("open"); $("sideScrim").classList.remove("show"); }
$("menuBtn")?.addEventListener("click", openSidebar);
$("sideScrim")?.addEventListener("click", closeSidebar);

/* ===================== الكومبوزر: رتّبهالي ===================== */
// سطر الإيصال من الـ agent → عالمه (للون الـ chip)
function receiptWorld(line) {
  if (line.startsWith("💰")) return "finances";
  if (line.startsWith("🩺") || line.startsWith("🧠") || line.startsWith("🍽️") || line.startsWith("🩹")) return "health";
  if (line.startsWith("🎯")) return "goals";
  if (line.startsWith("📅") || line.startsWith("☑️")) return "goals";
  if (line.startsWith("✅") || line.startsWith("🔁") || line.startsWith("🚭") || /عادة/.test(line)) return "habits";
  return "";
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
    if (data.error) { out.innerHTML = `<div class="comp-reply">${escapeHtml(data.error)}</div>`; return; }
    const chips = (data.receipts || [])
      .flatMap((r) => r.split("\n"))
      .map((r) => `<span class="chip ${receiptWorld(r)}">${escapeHtml(r)}</span>`)
      .join("");
    out.innerHTML = `<div class="comp-reply">${escapeHtml(data.reply || "اتسجّلت ✅")}</div>${chips ? `<div class="comp-chips">${chips}</div>` : ""}`;
    ta.value = "";
    await loadAll(false);
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

function renderOverview() {
  $("heroGreeting").textContent = greeting();
  const streak = computeStreak(state.journal);
  $("heroSub").textContent = streak > 0 ? "دي حياتك مرتّبة — لحد دلوقتي." : "ابدأ بحاجة صغيرة — احكيلي عن يومك.";
  $("todayChip").textContent = `🗓 ${fmtDate(TODAY())}`;
  $("streakChip").textContent = `🔥 ${arNum(streak)} ${streak === 1 ? "يوم" : "أيام"}`;

  // كروت العوالم بأرقام حقيقية
  const week = lastNDays(7);
  const healthWeek = state.health.filter((h) => week.includes(h.entry_date));
  const lastHealth = state.health[0];
  const bestHabit = [...state.habits].sort((a, b) => b.streak - a.streak)[0];
  const habitsDone = state.habits.filter((h) => h.doneToday).length;
  const topGoal = [...state.goals].filter((g) => g.target).sort((a, b) => (b.current / b.target) - (a.current / a.target))[0] || state.goals[0];
  const monthStart = TODAY().slice(0, 8) + "01";
  const monthFin = state.finance.filter((f) => f.entry_date >= monthStart);
  const mIncome = monthFin.filter((f) => f.direction === "income").reduce((a, f) => a + f.amount, 0);
  const mExpense = monthFin.filter((f) => f.direction === "expense").reduce((a, f) => a + f.amount, 0);

  const worlds = [
    {
      w: "health", title: "الصحة",
      metric: healthWeek.length ? `${arNum(healthWeek.length)} تدوينة الأسبوع ده` : "لسه هادية",
      caption: lastHealth ? lastHealth.detail : "احكيلي عن نومك وجسمك",
    },
    {
      w: "habits", title: "العادات",
      metric: bestHabit ? `ستريك ${arNum(bestHabit.streak)} ${bestHabit.streak === 1 ? "يوم" : "أيام"} 🔥` : "ابدأ عادة",
      caption: bestHabit ? `${bestHabit.title} · ${arNum(habitsDone)}/${arNum(state.habits.length)} النهاردة` : "قول للبوت «بلعب رياضة كل يوم»",
    },
    {
      w: "goals", title: "الأهداف",
      metric: topGoal && topGoal.target ? `${arNum(Math.min(100, Math.round((topGoal.current / topGoal.target) * 100)))}٪ من هدفك` : (topGoal ? topGoal.title : "حدّد هدف"),
      caption: topGoal ? topGoal.title : "قول للبوت «عايز أوصل…»",
    },
    {
      w: "finances", title: "الفلوس",
      metric: monthFin.length ? `${mIncome - mExpense >= 0 ? "صافي +" : "صافي -"}${arNum(Math.abs(mIncome - mExpense))}` : "سجّل أول عملية",
      caption: monthFin.length ? `دخل ${arNum(mIncome)} · صرف ${arNum(mExpense)} الشهر ده` : "قول للبوت «صرفت ٢٠٠ على أكل»",
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

  renderFeed();
}

function renderFeed() {
  const items = [];
  for (const e of state.journal.slice(0, 5)) items.push({ t: e.created_at || e.entry_date, txt: e.summary || "تدوينة", chips: [{ c: "", t: `📝 يوميات${e.mood ? " · " + e.mood : ""}` }] });
  for (const h of state.health.slice(0, 5)) items.push({ t: h.created_at, txt: h.detail, chips: [{ c: "health", t: `${HEALTH_ICON[h.category] || "🩺"} ${h.category}` }] });
  for (const f of state.finance.slice(0, 5)) items.push({ t: f.created_at, txt: f.note || f.category || "عملية", chips: [{ c: "finances", t: `${f.direction === "income" ? "➕" : "➖"} ${arNum(f.amount)} ${f.currency || "جنيه"}` }] });
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
    : emptyState("لسه ما دوّنتش حاجة هنا", "ابعتلي رسالة على تيليجرام أو اكتب فوق وأنا هبدأ أرتّبلك.");
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
    : `<span class="muted" style="font-size:var(--text-sm)">لسه مفيش تدوينات صحية.</span>`;

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
    el.innerHTML = `<div class="empty sm">${DOODLE}<p>مفيش مزاج متسجّل — احكيلي عن يومك وهرسمهولك هنا.</p></div>`;
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
    listEl.innerHTML = `<div class="empty sm">${DOODLE}<p>مفيش حاجات صحية في اليوم ده. قول للبوت «جريت ١٠ دقايق» أو «أخدت العلاج».</p></div>`;
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
        <div class="row-actions"><button class="icon-btn" onclick="del('health', ${h.id})" title="حذف">🗑️</button></div>
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
      <div class="row-actions"><button class="icon-btn" onclick="del('meals', ${m.id})" title="حذف">🗑️</button></div>
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
    $("streakPanel").innerHTML = emptyState("لسه مفيش عادات", "ضيف عادة جنب، أو قول للبوت «بلعب رياضة كل يوم».");
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
              ${h.doneToday ? "✓ اتعملت النهاردة" : "علّمها للنهاردة"}
            </button>
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
function renderGoalsPage() {
  const el = $("ringGrid");
  const data = state.goals;
  if (!data.length) {
    el.innerHTML = emptyState("لسه مفيش أهداف", "ضيف هدف فوق، أو قول للبوت «هدفي أوصل ٥٠٠ ألف».");
    return;
  }
  el.innerHTML = data.map((g) => {
    const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
    const unit = g.unit ? " " + escapeHtml(g.unit) : "";
    return `<div class="ring-card lift">
      ${g.target ? ringSVG(pct) : `<div style="font-size:44px">🎯</div>`}
      <div class="rc-caption">${escapeHtml(g.title)}</div>
      <div class="rc-meta">${arNum(g.current)}${g.target ? ` / ${arNum(g.target)}` : ""}${unit}${g.target ? ` · باقي ${arNum(Math.max(0, g.target - g.current))}` : ""}</div>
      <div class="rc-update">
        <input type="number" placeholder="حدّث الرقم" id="gc-${g.id}" class="field" style="flex:1" />
        <button class="btn goals sm" onclick="updateGoal(${g.id})">تحديث</button>
        <button class="icon-btn" onclick="del('goals', ${g.id})" title="حذف">🗑️</button>
      </div>
    </div>`;
  }).join("");
}
async function updateGoal(id) {
  const v = $(`gc-${id}`).value;
  if (v === "") return;
  await api(`/api/goals/${id}/current`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: Number(v) }) });
  await loadAll(false);
  renderGoalsPage();
}
window.updateGoal = updateGoal;
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

/* ===================== الفلوس ===================== */
function renderFinancesPage() {
  const data = state.finance;
  const week = lastNDays(7);
  const monthStart = TODAY().slice(0, 8) + "01";
  const weekExpense = data.filter((f) => f.direction === "expense" && week.includes(f.entry_date)).reduce((a, f) => a + f.amount, 0);
  const mIncome = data.filter((f) => f.direction === "income" && f.entry_date >= monthStart).reduce((a, f) => a + f.amount, 0);
  const mExpense = data.filter((f) => f.direction === "expense" && f.entry_date >= monthStart).reduce((a, f) => a + f.amount, 0);
  const net = mIncome - mExpense;

  $("finStats").innerHTML = [
    { label: "مصاريف الأسبوع", value: arNum(weekExpense), unit: "جنيه", ico: "💸", delta: "آخر ٧ أيام", trend: "" },
    { label: "دخل الشهر", value: arNum(mIncome), unit: "جنيه", ico: "💰", delta: "من أول الشهر", trend: "up" },
    { label: "الصافي", value: arNum(net), unit: "جنيه", ico: "🌱", delta: net >= 0 ? "نبتتك بخير" : "اصرف بالراحة", trend: net >= 0 ? "up" : "down" },
  ].map((s) => `
    <div class="stat-card finances">
      <div class="sc-top"><span class="sc-ico">${s.ico}</span><span class="sc-label">${s.label}</span></div>
      <div class="sc-value"><b>${s.value}</b><span class="sc-unit">${s.unit}</span></div>
      <div class="sc-delta ${s.trend}">${s.delta}</div>
    </div>`).join("");

  // أعمدة الأسبوع — مرسومة باليد على canvas
  const weekData = week.map((d) => ({
    label: DAY_LETTER[new Date(d + "T00:00:00").getDay()],
    value: data.filter((f) => f.entry_date === d && f.direction === "expense").reduce((a, f) => a + f.amount, 0),
  }));
  drawSketchBars($("finBars"), weekData, "finances", 200);

  // على إيه بتصرف — آخر ٣٠ يوم
  const month = lastNDays(30);
  const byCat = {};
  for (const f of data.filter((f) => f.direction === "expense" && month.includes(f.entry_date))) {
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
            <span class="cb-amount">${arNum(v)} جنيه · ${arNum(pct)}٪</span>
          </div>
          <div class="cb-track"><div class="cb-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join("")
    : `<span class="muted" style="font-size:var(--text-sm)">قول للبوت «صرفت ٢٠٠ على أكل» وهيتصنّف هنا لوحده.</span>`;

  // آخر حركات
  $("finTx").innerHTML = data.slice(0, 5).map((f) => `
    <div class="tl-row">
      <span class="tl-text" style="flex:1">${escapeHtml(f.note || f.category || "عملية")}</span>
      <span class="l-amount ${f.direction === "income" ? "pos" : "neg"}" style="font:var(--type-label)">${f.direction === "income" ? "+" : "-"}${arNum(f.amount)} ج</span>
    </div>`).join("") || `<span class="muted" style="font-size:var(--text-sm)">لسه مفيش حركات.</span>`;

  // كل العمليات
  const el = $("finList");
  el.innerHTML = data.length
    ? data.slice(0, 60).map((f) => `
      <div class="list-row">
        <div class="lm">
          <span class="l1">${f.direction === "income" ? "➕ دخل" : "➖ صرف"} · ${fmtShort(f.entry_date)}${f.category ? ` · ${CAT_ICONS[f.category] || ""} ${escapeHtml(f.category)}` : ""}</span>
          <span class="l2">${escapeHtml(f.note || "—")}</span>
        </div>
        <div class="row-actions">
          <span class="l-amount ${f.direction === "income" ? "pos" : "neg"}">${arNum(f.amount)} ${escapeHtml(f.currency || "جنيه")}</span>
          <button class="icon-btn" onclick="del('finance', ${f.id})" title="حذف">🗑️</button>
        </div>
      </div>`).join("")
    : emptyState("مفيش عمليات لسه", "قول للبوت «صرفت ٢٠٠ على أكل» أو ضيف عملية فوق.");
}
$("finForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const direction = $("finDir").value;
  const amount = $("finAmount").value;
  const category = $("finCategory").value;
  const note = $("finNote").value.trim();
  if (amount === "") return;
  await api("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction, amount, category, note }) });
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
    el.innerHTML = emptyState("لسه ما دوّنتش حاجة", "ابعت voice أو اكتب للبوت على تيليجرام عن يومك.");
    return;
  }
  el.innerHTML = data.map((e) => {
    const tags = (e.tags || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("");
    return `<article class="entry-card">
      <div class="e-head">
        <span class="e-date">${fmtDate(e.entry_date)}</span>
        <div class="row-actions">
          <span class="badge health"><span class="dot"></span>${moodInfo(e.mood).emoji} ${escapeHtml(e.mood || "")}</span>
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
  $("dayTasksTitle").textContent = isToday ? "مهام النهاردة" : `مهام ${fmtDate(state.selDate)}`;
  const sel = (byDate[state.selDate] || []).slice().sort((a, b) => ((a.due_time || "99") < (b.due_time || "99") ? -1 : 1));
  renderTaskRows($("dayTasks"), sel);
}
function renderTaskRows(el, tasks) {
  if (!el) return;
  if (!tasks.length) {
    el.innerHTML = `<div class="empty sm">${DOODLE}<p>مفيش مهام في اليوم ده — ضيف واحدة فوق ✍️</p></div>`;
    return;
  }
  el.innerHTML = tasks.map((t) => `
    <div class="task-row ${t.status === "done" ? "done" : ""}">
      <button class="task-check" onclick="toggleTask(${t.id}, '${t.status}')" title="${t.status === "done" ? "رجّعها" : "خلصت"}">${t.status === "done" ? "✓" : ""}</button>
      <div class="lm" style="flex:1">
        <span class="task-title">${escapeHtml(t.title)}</span>
        ${t.note ? `<span class="task-note">${escapeHtml(t.note)}</span>` : ""}
      </div>
      <div class="row-actions">
        ${t.due_time ? `<span class="time-chip">⏰ ${t.due_time}</span>` : ""}
        <button class="icon-btn" onclick="delTask(${t.id})" title="حذف">🗑️</button>
      </div>
    </div>`).join("");
}
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
$("taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("taskTitle").value.trim();
  const dueTime = $("taskTime").value || null;
  if (!title) return;
  await api("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, dueDate: state.selDate || TODAY(), dueTime }),
  });
  e.target.reset();
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

/* ===================== المحادثات ===================== */
const KIND_LABEL = { voice: "🎙️ صوت", text: "⌨️ كتابة", command: "⚙️ أمر", checkin: "⏰ سؤال اليوم", dashboard: "✎ من الداشبورد" };
function renderChats() {
  const el = $("chats");
  const data = state.conversations;
  if (!data.length) { el.innerHTML = emptyState("لسه مفيش محادثات", "أول ما تكلم البوت هتلاقي كل حاجة هنا."); return; }
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

/* ===================== تكلفة الـAI ===================== */
const USAGE_KINDS = {
  transcribe: { label: "تفريغ الصوت", emoji: "🎙️" },
  agent: { label: "الـ Agent (فهم وتسجيل ورد)", emoji: "🧠" },
  classify: { label: "تصنيف الكلام (قديم)", emoji: "🗂️" },
  reflect: { label: "رد البوت (قديم)", emoji: "💬" },
  analyze: { label: "تحليل اليوميات", emoji: "📈" },
  report: { label: "التقرير الشامل", emoji: "📋" },
  doctor: { label: "تقرير الدكتور", emoji: "🩺" },
  other: { label: "غير ذلك", emoji: "⚙️" },
};
const usd = (n) => "$" + Number(n || 0).toFixed(Number(n) >= 1 ? 2 : 4);
const egp = (n) => arNum(Math.round(Number(n || 0) * USD_TO_EGP)) + " ج";

function renderUsage() {
  const u = state.usage;
  if (!u) { $("usageSummary").innerHTML = ""; return; }
  const t = u.totals || {};
  const total = t.cost_usd || 0;
  const monthCost = u.month?.cost_usd || 0;
  const tokens = (t.input_tokens || 0) + (t.output_tokens || 0);
  const minutes = (t.audio_seconds || 0) / 60;

  $("usageSummary").innerHTML = [
    { label: "إجمالي التكلفة", value: usd(total), unit: "", delta: "≈ " + egp(total), ico: "🧮" },
    { label: "الشهر ده", value: usd(monthCost), unit: "", delta: "≈ " + egp(monthCost), ico: "🗓" },
    { label: "النداءات", value: arNum(t.calls || 0), unit: "", delta: `${arNum(tokens)} توكن · ${arNum(minutes.toFixed(1))} دقيقة صوت`, ico: "🤖" },
  ].map((s) => `
    <div class="stat-card">
      <div class="sc-top"><span class="sc-ico">${s.ico}</span><span class="sc-label">${s.label}</span></div>
      <div class="sc-value"><b style="font-size:var(--text-h3)">${s.value}</b></div>
      <div class="sc-delta">${s.delta}</div>
    </div>`).join("");

  // التكلفة اليومية — آخر ٣٠ يوم
  const map = {};
  (u.daily || []).forEach((d) => (map[d.usage_date] = d.cost_usd));
  const days = lastNDays(30).map((d, i) => ({
    label: i % 5 === 0 ? fmtShort(d) : "",
    value: map[d] || 0,
  }));
  drawSketchBars($("usageChart"), days, "", 180);

  const byKind = {};
  (u.byKind || []).forEach((r) => {
    const k = USAGE_KINDS[r.kind] ? r.kind : "other";
    if (!byKind[k]) byKind[k] = { calls: 0, cost: 0 };
    byKind[k].calls += r.calls; byKind[k].cost += r.cost_usd;
  });
  const rows = Object.entries(byKind).sort((a, b) => b[1].cost - a[1].cost);
  $("usageBreakdown").innerHTML = rows.length
    ? rows.map(([k, v]) => {
        const meta = USAGE_KINDS[k];
        const pct = total ? Math.round((v.cost / total) * 100) : 0;
        return `<div class="list-row">
          <div class="lm">
            <span class="l1">${meta.emoji} ${meta.label}</span>
            <span class="l2">${arNum(v.calls)} نداء · ${arNum(pct)}٪ من التكلفة</span>
          </div>
          <span class="l-amount">${usd(v.cost)}</span>
        </div>`;
      }).join("")
    : `<span class="muted" style="font-size:var(--text-sm)">لسه مفيش استهلاك متسجّل.</span>`;

  const since = t.since ? `بيتتبّع من ${fmtShort(t.since)} · ` : "";
  $("usageNote").textContent = `${since}الأرقام تقديرية حسب أسعار OpenAI، والتحويل للجنيه على سعر ${USD_TO_EGP}.`;
}

/* ===================== خروج + تحميل ===================== */
async function logout() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
}
$("logoutBtn").addEventListener("click", logout);

async function loadAll(rerender = true) {
  try {
    const [me, j, g, h, c, cond, m, hab, fin, tasks, cats, usg] = await Promise.all([
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
      api("/api/usage").then((r) => r.json()),
    ]);
    state.me = me;
    state.journal = j; state.goals = g; state.health = h; state.conversations = c;
    state.conditions = cond; state.meals = m; state.habits = hab; state.finance = fin;
    state.tasks = tasks; state.categories = cats; state.usage = usg;
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
  if (active === "tasks") renderCalendar();
  if (active === "usage") renderUsage();
}

loadAll().then(() => {
  renderJournal();
});
