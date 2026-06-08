/* ===================== State ===================== */
const state = {
  journal: [],
  goals: [],
  health: [],
  conversations: [],
  conditions: [],
  meals: [],
  habits: [],
  finance: [],
  usage: null,
  pageDate: null,
  mealDate: null,
};

// سعر صرف تقريبي للدولار (للعرض بالجنيه فقط — عدّله وقت ما تحب)
const USD_TO_EGP = 50;

const $ = (id) => document.getElementById(id);
const TODAY = () => new Date().toISOString().slice(0, 10);

const PAGE_TITLES = {
  overview: "الرئيسية",
  journal: "يوميات",
  health: "الصحة",
  habits: "العادات",
  goals: "الأهداف",
  finance: "الماليات",
  meals: "الأكل",
  chats: "المحادثات",
  usage: "تكلفة الـAI",
};

/* ===================== Helpers ===================== */
const MOODS = [
  { re: /مبسوط|سعيد|فرحان|متحمّس|متحمس|رايق|كويس/, emoji: "😄" },
  { re: /حزين|زعلان|متضايق|مكتئب|تعبان نفسيا/, emoji: "😔" },
  { re: /متوتر|قلقان|عصبي|مضغوط|متوتّر/, emoji: "😣" },
  { re: /عادي|محايد/, emoji: "😐" },
];
function moodEmoji(mood = "") {
  const m = String(mood).toLowerCase();
  for (const x of MOODS) if (x.re.test(m)) return x.emoji;
  return "🙂";
}
function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
  } catch { return d; }
}
function fmtShort(d) {
  try {
    return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
  } catch { return d; }
}
function fmtDateTime(d) {
  try {
    return new Date(d).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
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
  document.querySelectorAll(".nav-item").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
  $("pageTitle").textContent = PAGE_TITLES[tab] || "";
  closeSidebar();
  if (tab === "overview") renderOverview();
  if (tab === "finance") renderFinance();
  if (tab === "usage") renderUsage();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("sideNav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item");
  if (btn) gotoTab(btn.dataset.tab);
});
document.querySelectorAll(".pillar-card[data-go]").forEach((c) =>
  c.addEventListener("click", () => gotoTab(c.dataset.go))
);

/* mobile sidebar */
function openSidebar() { $("sidebar").classList.add("open"); $("sideScrim").classList.remove("hidden"); }
function closeSidebar() { $("sidebar").classList.remove("open"); $("sideScrim").classList.add("hidden"); }
$("menuBtn")?.addEventListener("click", openSidebar);
$("sideScrim")?.addEventListener("click", closeSidebar);

/* ===================== Overview ===================== */
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
function last7() {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  return out;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الفل ☀️";
  if (h < 18) return "نهارك سعيد 🌤️";
  return "مساء الخير 🌙";
}

function renderOverview() {
  $("heroGreeting").textContent = greeting();
  const streak = computeStreak(state.journal);
  $("heroSub").textContent = streak > 0 ? `ماشي صح — ${streak} يوم تدوين ورا بعض 🔥` : "ابدأ يومك بتدوينة صغيرة.";

  // stat cards
  const totalIncome = state.finance.filter((f) => f.direction === "income").reduce((a, f) => a + f.amount, 0);
  const totalExpense = state.finance.filter((f) => f.direction === "expense").reduce((a, f) => a + f.amount, 0);
  const activeHabits = state.habits.length;
  const doneToday = state.habits.filter((h) => h.doneToday).length;
  const stats = [
    { n: state.journal.length, l: "تدوينات", i: "📝" },
    { n: streak, l: "أيام متتالية", i: "🔥" },
    { n: state.health.length, l: "سجلات صحية", i: "🩺" },
    { n: `${doneToday}/${activeHabits}`, l: "عادات النهاردة", i: "🔁" },
    { n: state.goals.length, l: "أهداف", i: "🎯" },
    { n: fmtNum(totalIncome - totalExpense), l: "صافي الرصيد", i: "💰" },
  ];
  $("overviewStats").innerHTML = stats
    .map((s) => `<div class="stat-card"><span class="stat-ico">${s.i}</span><span class="stat-num">${s.n}</span><span class="stat-label">${s.l}</span></div>`)
    .join("");

  // streak ring
  drawRing($("streakRing"), Math.min(1, streak / 30), cssVar("--violet"));
  $("streakNum").textContent = streak;

  // pillar charts
  const days = last7();
  const healthCounts = days.map((d) => state.health.filter((h) => h.entry_date === d).length);
  drawBars($("chartHealth"), healthCounts, days.map(fmtShort), cssVar("--pink"));
  $("metaHealth").textContent = `${state.health.length} سجل · ${state.conditions.filter((c) => c.status === "active").length} متابعة شغّالة`;

  const habitRatio = activeHabits ? doneToday / activeHabits : 0;
  drawBars($("chartHabits"), state.habits.slice(0, 7).map((h) => h.streak), state.habits.slice(0, 7).map((h) => h.emoji || "🔁"), cssVar("--violet"));
  $("metaHabits").textContent = activeHabits ? `${doneToday} من ${activeHabits} اتعملوا النهاردة (${Math.round(habitRatio * 100)}%)` : "مفيش عادات لسه";

  const topGoals = state.goals.filter((g) => g.target).slice(0, 5);
  drawBars($("chartGoals"), topGoals.map((g) => Math.min(100, Math.round((g.current / g.target) * 100))), topGoals.map((g) => g.title.slice(0, 6)), cssVar("--indigo"), 100);
  $("metaGoals").textContent = state.goals.length ? `${state.goals.length} هدف نشط` : "مفيش أهداف لسه";

  drawIncomeExpense($("chartFinance"), totalIncome, totalExpense);
  $("metaFinance").textContent = `دخل ${fmtNum(totalIncome)} · صرف ${fmtNum(totalExpense)}`;

  // recent feed
  renderFeed();
}

function renderFeed() {
  const items = [];
  for (const e of state.journal.slice(0, 6)) items.push({ t: e.created_at || e.entry_date, ico: "📝", txt: e.summary || "تدوينة", tag: "يوميات" });
  for (const h of state.health.slice(0, 6)) items.push({ t: h.created_at, ico: "🩺", txt: h.detail, tag: "صحة" });
  for (const f of state.finance.slice(0, 6)) items.push({ t: f.created_at, ico: f.direction === "income" ? "➕" : "➖", txt: `${fmtNum(f.amount)} ${f.currency}${f.note ? " · " + f.note : ""}`, tag: "ماليات" });
  for (const m of state.meals.slice(0, 4)) items.push({ t: m.created_at, ico: "🍽️", txt: m.items, tag: "أكل" });
  items.sort((a, b) => new Date(b.t) - new Date(a.t));
  const top = items.slice(0, 10);
  $("recentFeed").innerHTML = top.length
    ? top.map((x) => `<div class="feed-row"><span class="feed-ico">${x.ico}</span><span class="feed-txt">${escapeHtml(x.txt)}</span><span class="feed-tag">${x.tag}</span></div>`).join("")
    : `<div class="empty"><div class="empty-emoji">✨</div><p class="muted">ابدأ تكلّم البوت وهيظهر نشاطك هنا.</p></div>`;
}

/* ===================== Canvas charts ===================== */
function prep(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function drawRing(canvas, ratio, color) {
  if (!canvas) return;
  const { ctx, w, h } = prep(canvas);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8;
  ctx.lineWidth = 9; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(52,48,42,0.10)";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, cssVar("--indigo")); grad.addColorStop(1, cssVar("--finances"));
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, ratio));
  ctx.stroke();
}
function drawBars(canvas, values, labels, color, fixedMax) {
  if (!canvas) return;
  const { ctx, w, h } = prep(canvas);
  if (!values.length) { ctx.fillStyle = "rgba(52,48,42,.4)"; ctx.font = "13px Tajawal"; ctx.textAlign = "center"; ctx.fillText("مفيش بيانات", w / 2, h / 2); return; }
  const pad = 18, bw = (w - pad) / values.length;
  const max = fixedMax || Math.max(1, ...values);
  values.forEach((v, i) => {
    const bh = (v / max) * (h - 30);
    const x = i * bw + pad / 2, y = h - 16 - bh;
    const grad = ctx.createLinearGradient(0, y, 0, h);
    grad.addColorStop(0, color); grad.addColorStop(1, "rgba(255,252,245,0.04)");
    ctx.fillStyle = grad;
    roundRect(ctx, x + 3, y, bw - 8, Math.max(2, bh), 5); ctx.fill();
    ctx.fillStyle = "rgba(52,48,42,.62)"; ctx.font = "11px Tajawal"; ctx.textAlign = "center";
    ctx.fillText(String(labels[i]).slice(0, 8), x + bw / 2, h - 3);
  });
}
function drawIncomeExpense(canvas, income, expense) {
  if (!canvas) return;
  const { ctx, w, h } = prep(canvas);
  const max = Math.max(1, income, expense);
  const data = [{ v: income, c: cssVar("--pos"), l: "دخل" }, { v: expense, c: cssVar("--neg"), l: "صرف" }];
  const bw = w / 2;
  data.forEach((d, i) => {
    const bh = (d.v / max) * (h - 28);
    const x = i * bw, y = h - 16 - bh;
    ctx.fillStyle = d.c;
    roundRect(ctx, x + bw * 0.2, y, bw * 0.6, Math.max(2, bh), 6); ctx.fill();
    ctx.fillStyle = "rgba(52,48,42,.62)"; ctx.font = "11px Tajawal"; ctx.textAlign = "center";
    ctx.fillText(d.l, x + bw / 2, h - 3);
  });
}
function drawFinChart(canvas, days) {
  if (!canvas) return;
  const { ctx, w, h } = prep(canvas);
  const max = Math.max(1, ...days.map((d) => Math.max(d.income, d.expense)));
  const slot = w / days.length, pad = 14;
  days.forEach((d, i) => {
    const x0 = i * slot + pad;
    const bw = (slot - pad * 1.5) / 2;
    [["income", d.income, cssVar("--pos")], ["expense", d.expense, cssVar("--neg")]].forEach(([k, v, c], j) => {
      const bh = (v / max) * (h - 34);
      const x = x0 + j * bw, y = h - 20 - bh;
      ctx.fillStyle = c; roundRect(ctx, x, y, bw - 3, Math.max(1, bh), 4); ctx.fill();
    });
    ctx.fillStyle = "rgba(52,48,42,.6)"; ctx.font = "10px Tajawal"; ctx.textAlign = "center";
    ctx.fillText(fmtShort(d.date), x0 + bw, h - 5);
  });
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ===================== Journal ===================== */
function renderJournal() {
  const el = $("entries");
  const data = state.journal;
  if (!data.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🎙️</div><p>لسه مفيش يوميات.</p><p class="muted">ابعت voice أو اكتب نص للبوت على تليجرام.</p></div>`;
    return;
  }
  el.innerHTML = data.map((e) => {
    const tags = (e.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    return `<article class="entry-card">
      <div class="entry-head">
        <div class="entry-date">${fmtDate(e.entry_date)}</div>
        <div class="row-actions">
          <span class="mood-chip">${moodEmoji(e.mood)} ${escapeHtml(e.mood || "")}</span>
          <button class="del-btn" onclick="del('entries', ${e.id})" title="حذف">🗑️</button>
        </div>
      </div>
      <p class="entry-summary">${escapeHtml(e.summary || "")}</p>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      <details class="entry-full"><summary>النص الكامل</summary><p>${escapeHtml(e.transcript || "")}</p></details>
    </article>`;
  }).join("");
}

/* ===================== Goals ===================== */
function renderGoals() {
  const el = $("goals");
  const data = state.goals;
  if (!data.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🎯</div><p class="muted">ضيف هدف فوق، أو قول للبوت "هدفي أوصل ٥٠٠ ألف".</p></div>`;
    return;
  }
  el.innerHTML = data.map((g) => {
    const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
    const unit = g.unit ? " " + escapeHtml(g.unit) : "";
    return `<div class="goal-card">
      <div class="goal-top"><span class="goal-title">${escapeHtml(g.title)}</span>
        <button class="del-btn" onclick="del('goals', ${g.id})" title="حذف">🗑️</button></div>
      ${g.target
        ? `<div class="goal-bar"><span style="width:${pct}%"></span></div>
           <div class="goal-meta"><span>${fmtNum(g.current)} / ${fmtNum(g.target)}${unit}</span><span class="goal-pct">${pct}%</span></div>
           <div class="goal-meta muted">باقي ${fmtNum(Math.max(0, g.target - g.current))}${unit}</div>`
        : `<div class="goal-meta"><span>الحالي: ${fmtNum(g.current)}${unit}</span></div>`}
      <div class="goal-update"><input type="number" placeholder="حدّث الحالي" id="gc-${g.id}" class="select gf-sm" />
        <button class="ghost-btn sm" onclick="updateGoal(${g.id})">تحديث</button></div>
    </div>`;
  }).join("");
}
async function updateGoal(id) {
  const v = $(`gc-${id}`).value;
  if (v === "") return;
  await api(`/api/goals/${id}/current`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: Number(v) }) });
  loadAll();
}
window.updateGoal = updateGoal;
$("goalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("goalTitle").value.trim();
  const target = $("goalTarget").value;
  const unit = $("goalUnit").value.trim();
  if (!title) return;
  await api("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, target, unit }) });
  e.target.reset(); loadAll();
});

/* ===================== Habits ===================== */
function renderHabits() {
  const el = $("habits");
  const data = state.habits;
  if (!data.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🔁</div><p class="muted">ضيف عادة فوق، أو قول للبوت "بلعب رياضة كل يوم".</p></div>`;
    return;
  }
  const days = last7();
  el.innerHTML = data.map((h) => {
    const logset = new Set(h.logs || []);
    const dots = days.map((d) => `<span class="hb-dot ${logset.has(d) ? "on" : ""}" title="${fmtShort(d)}"></span>`).join("");
    const isQuit = h.kind === "quit";
    return `<div class="habit-card ${h.doneToday ? "done" : ""}">
      <div class="habit-top">
        <span class="habit-emoji">${h.emoji || (isQuit ? "🚭" : "🔁")}</span>
        <div class="habit-info">
          <span class="habit-title">${escapeHtml(h.title)}</span>
          <span class="habit-kind">${isQuit ? "ببطّلها" : "بعملها"}</span>
        </div>
        <button class="del-btn" onclick="del('habits', ${h.id})" title="حذف">🗑️</button>
      </div>
      <div class="habit-streak"><span class="hs-fire">🔥</span><b>${h.streak}</b> يوم متتالي · ${h.total} إجمالي</div>
      <div class="hb-week">${dots}</div>
      <button class="habit-check ${h.doneToday ? "checked" : ""}" onclick="toggleHabit(${h.id}, ${h.doneToday})">
        ${h.doneToday ? "✓ اتعملت النهاردة" : "علّمها للنهاردة"}
      </button>
    </div>`;
  }).join("");
}
async function toggleHabit(id, doneToday) {
  if (doneToday) {
    await api(`/api/habits/${id}/log?date=${TODAY()}`, { method: "DELETE" });
  } else {
    await api(`/api/habits/${id}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: TODAY() }) });
  }
  loadAll();
}
window.toggleHabit = toggleHabit;
$("habitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("habitTitle").value.trim();
  const kind = $("habitKind").value;
  if (!title) return;
  await api("/api/habits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, kind }) });
  e.target.reset(); loadAll();
});

/* ===================== Finance ===================== */
function renderFinance() {
  const data = state.finance;
  const income = data.filter((f) => f.direction === "income").reduce((a, f) => a + f.amount, 0);
  const expense = data.filter((f) => f.direction === "expense").reduce((a, f) => a + f.amount, 0);
  const balance = income - expense;
  $("finSummary").innerHTML = `
    <div class="fin-card pos"><span class="fc-label">الدخل</span><span class="fc-num">${fmtNum(income)}</span><span class="fc-cur">جنيه</span></div>
    <div class="fin-card neg"><span class="fc-label">الصرف</span><span class="fc-num">${fmtNum(expense)}</span><span class="fc-cur">جنيه</span></div>
    <div class="fin-card ${balance >= 0 ? "pos" : "neg"}"><span class="fc-label">الصافي</span><span class="fc-num">${fmtNum(balance)}</span><span class="fc-cur">جنيه</span></div>`;

  // chart last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({
      date: d,
      income: data.filter((f) => f.entry_date === d && f.direction === "income").reduce((a, f) => a + f.amount, 0),
      expense: data.filter((f) => f.entry_date === d && f.direction === "expense").reduce((a, f) => a + f.amount, 0),
    });
  }
  drawFinChart($("finChart"), days);

  // list
  const el = $("finList");
  if (!data.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">💰</div><p class="muted">قول للبوت "صرفت ٢٠٠ على أكل" أو ضيف عملية فوق.</p></div>`;
    return;
  }
  el.innerHTML = data.map((f) => `
    <div class="list-row ${f.direction === "income" ? "pos" : "neg"}">
      <div class="lr-main">
        <span class="hcat">${f.direction === "income" ? "➕ دخل" : "➖ صرف"} · ${fmtShort(f.entry_date)}</span>
        <span class="lr-note">${escapeHtml(f.note || "—")}</span>
      </div>
      <div class="row-actions">
        <span class="lr-amount">${fmtNum(f.amount)} ${escapeHtml(f.currency || "جنيه")}</span>
        <button class="del-btn" onclick="del('finance', ${f.id})" title="حذف">🗑️</button>
      </div>
    </div>`).join("");
}
$("finForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const direction = $("finDir").value;
  const amount = $("finAmount").value;
  const note = $("finNote").value.trim();
  if (amount === "") return;
  await api("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction, amount, note }) });
  e.target.reset(); loadAll();
});

/* ===================== تكلفة الـAI ===================== */
const USAGE_KINDS = {
  transcribe: { label: "تفريغ الصوت", emoji: "🎙️" },
  classify: { label: "تصنيف الكلام", emoji: "🧠" },
  reflect: { label: "رد البوت", emoji: "💬" },
  analyze: { label: "تحليل اليوميات", emoji: "📈" },
  doctor: { label: "تقرير الدكتور", emoji: "🩺" },
  other: { label: "غير ذلك", emoji: "⚙️" },
};
const usd = (n) => "$" + (Number(n || 0)).toFixed(Number(n) >= 1 ? 2 : 4);
const egp = (n) => fmtNum(Math.round(Number(n || 0) * USD_TO_EGP)) + " ج";

function renderUsage() {
  const u = state.usage;
  if (!u) {
    $("usageSummary").innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-emoji">🤖</div><p class="muted">بحمّل بيانات التكلفة...</p></div>`;
    $("usageBreakdown").innerHTML = ""; $("usageNote").textContent = "";
    return;
  }
  const t = u.totals || {};
  const total = t.cost_usd || 0;
  const monthCost = u.month?.cost_usd || 0;
  const tokens = (t.input_tokens || 0) + (t.output_tokens || 0);
  const minutes = (t.audio_seconds || 0) / 60;

  $("usageSummary").innerHTML = `
    <div class="fin-card neg"><span class="fc-label">إجمالي التكلفة</span><span class="fc-num">${usd(total)}</span><span class="fc-cur">≈ ${egp(total)}</span></div>
    <div class="fin-card"><span class="fc-label">الشهر ده</span><span class="fc-num">${usd(monthCost)}</span><span class="fc-cur">≈ ${egp(monthCost)}</span></div>
    <div class="fin-card pos"><span class="fc-label">عدد النداءات</span><span class="fc-num">${fmtNum(t.calls || 0)}</span><span class="fc-cur">${fmtNum(tokens)} توكن · ${minutes.toFixed(1)} دقيقة صوت</span></div>`;

  // daily cost chart
  drawCostChart($("usageChart"), u.daily || []);

  // breakdown by operation
  const byKind = {};
  (u.byKind || []).forEach((r) => {
    const k = USAGE_KINDS[r.kind] ? r.kind : "other";
    if (!byKind[k]) byKind[k] = { calls: 0, cost: 0 };
    byKind[k].calls += r.calls; byKind[k].cost += r.cost_usd;
  });
  const rows = Object.entries(byKind).sort((a, b) => b[1].cost - a[1].cost);
  const el = $("usageBreakdown");
  if (!rows.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🧮</div><p class="muted">لسه مفيش استهلاك متسجّل. التتبّع بيشتغل من أول ما اتفعّل.</p></div>`;
  } else {
    el.innerHTML = rows.map(([k, v]) => {
      const meta = USAGE_KINDS[k];
      const pct = total ? Math.round((v.cost / total) * 100) : 0;
      return `<div class="list-row">
        <div class="lr-main">
          <span class="hcat">${meta.emoji} ${meta.label}</span>
          <span class="lr-note">${fmtNum(v.calls)} نداء · ${pct}% من التكلفة</span>
        </div>
        <span class="lr-amount">${usd(v.cost)}</span>
      </div>`;
    }).join("");
  }

  const since = t.since ? `بيتتبّع من ${fmtShort(t.since)} · ` : "";
  $("usageNote").textContent = `${since}الأرقام تقديرية حسب أسعار OpenAI، والتحويل للجنيه على سعر ${USD_TO_EGP}.`;
}

function drawCostChart(canvas, daily) {
  if (!canvas) return;
  const { ctx, w, h } = prep(canvas);
  // املا الأيام الناقصة بصفر لآخر ٣٠ يوم
  const map = {}; daily.forEach((d) => (map[d.usage_date] = d.cost_usd));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, cost: map[d] || 0 });
  }
  const max = Math.max(0.0001, ...days.map((d) => d.cost));
  if (max <= 0.0001 && !daily.length) {
    ctx.fillStyle = "rgba(52,48,42,.4)"; ctx.font = "13px Tajawal"; ctx.textAlign = "center";
    ctx.fillText("مفيش استهلاك لسه", w / 2, h / 2); return;
  }
  const slot = w / days.length;
  days.forEach((d, i) => {
    const bh = (d.cost / max) * (h - 32);
    const x = i * slot, y = h - 20 - bh;
    const grad = ctx.createLinearGradient(0, y, 0, h);
    grad.addColorStop(0, cssVar("--violet")); grad.addColorStop(1, "rgba(255,252,245,0.04)");
    ctx.fillStyle = grad;
    roundRect(ctx, x + slot * 0.18, y, slot * 0.64, Math.max(1, bh), 4); ctx.fill();
    if (i % 5 === 0) {
      ctx.fillStyle = "rgba(52,48,42,.6)"; ctx.font = "10px Tajawal"; ctx.textAlign = "center";
      ctx.fillText(fmtShort(d.date), x + slot / 2, h - 5);
    }
  });
}

/* ===================== الصحة — body map ===================== */
const REGION_CENTERS = { "راس": [100, 32], "صدر": [100, 90], "معدة": [100, 137], "بطن": [100, 178], "ذراعين": [153, 120], "ساقين": [116, 270] };
const REGION_ICON = { "تمرين": "🏃", "دواء": "💊", "أكل": "🍽️", "عرض": "🤒", "نوم": "😴", "ملاحظة": "📝" };
const SVGNS = "http://www.w3.org/2000/svg";
let pageFilter = null;
function healthDates() { return [...new Set(state.health.map((h) => h.entry_date))].sort(); }
function shiftPageDate(delta) {
  if (!state.pageDate) return;
  const d = new Date(state.pageDate + "T00:00:00"); d.setDate(d.getDate() + delta);
  state.pageDate = d.toISOString().slice(0, 10); pageFilter = null; renderPage();
}
function renderPage() {
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
    const g = document.createElementNS(SVGNS, "g"); g.setAttribute("class", "badge");
    const circle = document.createElementNS(SVGNS, "circle");
    circle.setAttribute("cx", cx); circle.setAttribute("cy", cy); circle.setAttribute("r", "11");
    const txt = document.createElementNS(SVGNS, "text");
    txt.setAttribute("x", cx); txt.setAttribute("y", cy + 4); txt.setAttribute("text-anchor", "middle");
    txt.textContent = list.length;
    g.appendChild(circle); g.appendChild(txt); badges.appendChild(g);
  }
  const general = byRegion["عام"] || [];
  $("generalChips").innerHTML = general.map((h) => `<span class="gen-chip">${REGION_ICON[h.category] || "🩺"} ${escapeHtml(h.detail)}</span>`).join("");
  const listEl = $("healthList");
  const shown = pageFilter ? items.filter((h) => (h.body_region || "عام") === pageFilter) : items;
  if (!items.length) {
    listEl.innerHTML = `<div class="empty"><div class="empty-emoji">🧘</div><p class="muted">مفيش حاجات صحية في اليوم ده.</p><p class="muted">قول للبوت "جريت ١٠ دقايق" أو "أخدت العلاج".</p></div>`;
    return;
  }
  listEl.innerHTML =
    (pageFilter ? `<button class="ghost-btn sm" onclick="clearPageFilter()">↺ كل المناطق</button>` : "") +
    shown.map((h) => `
      <div class="list-row">
        <div class="lr-main">
          <span class="hcat">${REGION_ICON[h.category] || "🩺"} ${escapeHtml(h.category || "ملاحظة")}${h.body_region ? " · " + escapeHtml(h.body_region) : ""}</span>
          <span class="lr-note">${escapeHtml(h.detail)}</span>
        </div>
        <div class="row-actions"><button class="del-btn" onclick="del('health', ${h.id})" title="حذف">🗑️</button></div>
      </div>`).join("");
}
function clearPageFilter() { pageFilter = null; renderPage(); }
window.clearPageFilter = clearPageFilter;
$("bodySvg")?.addEventListener("click", (e) => {
  const part = e.target.closest(".bodypart");
  if (!part || !part.classList.contains("hot")) return;
  const region = part.dataset.region;
  pageFilter = pageFilter === region ? null : region; renderPage();
});
$("dayPrev")?.addEventListener("click", () => shiftPageDate(-1));
$("dayNext")?.addEventListener("click", () => shiftPageDate(1));

/* ===================== الصحة — conditions ===================== */
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
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🩹</div><p class="muted">مفيش متابعات لسه.</p></div>`;
    return;
  }
  el.innerHTML = data.map((c) => {
    const closed = c.status === "closed";
    const left = daysLeft(c.end_date);
    const status = closed ? `<span class="cond-status closed">مقفولة</span>`
      : left >= 0 ? `<span class="cond-status active">باقي ${left} يوم</span>`
      : `<span class="cond-status done">خلصت المدة</span>`;
    return `<div class="cond-card">
      <div class="cond-head"><span class="cond-title">🩹 ${escapeHtml(c.title)}</span>${status}</div>
      <div class="cond-meta muted">من ${fmtDate(c.start_date)} لـ ${fmtDate(c.end_date)}</div>
      <div class="cond-actions">
        <button class="primary-btn sm" onclick="doctorReport(${c.id})">📄 تقرير للدكتور</button>
        ${!closed ? `<button class="ghost-btn sm" onclick="closeCondition(${c.id})">إقفال المتابعة</button>` : ""}
        <button class="del-btn" onclick="del('conditions', ${c.id})" title="حذف">🗑️</button>
      </div>
      <div class="cond-report hidden" id="report-${c.id}"></div>
    </div>`;
  }).join("");
}
async function doctorReport(id) {
  const box = $(`report-${id}`); if (!box) return;
  box.classList.remove("hidden");
  box.innerHTML = `<div class="loading"><span class="spinner"></span> بحضّر التقرير...</div>`;
  try {
    const res = await api(`/api/conditions/${id}/report`);
    const data = await res.json();
    if (data.error) { box.innerHTML = `<p class="muted">${escapeHtml(data.error)}</p>`; return; }
    const timeline = (data.timeline || []).map((h) =>
      `<div class="tl-row"><span class="tl-date">${fmtDate(h.entry_date)}</span><span class="tl-text">${REGION_ICON[h.category] || "🩺"} ${escapeHtml(h.detail)}</span></div>`).join("");
    box.innerHTML = `<div class="report-summary">${escapeHtml(data.summary || "").replace(/\n/g, "<br>")}</div>
      <h4 class="report-h">الخط الزمني للأعراض</h4>
      <div class="timeline">${timeline || `<p class="muted">مفيش أعراض في الفترة.</p>`}</div>`;
  } catch { box.innerHTML = `<p class="muted">حصل خطأ في توليد التقرير.</p>`; }
}
window.doctorReport = doctorReport;
async function closeCondition(id) { await api(`/api/conditions/${id}/close`, { method: "PUT" }); loadAll(); }
window.closeCondition = closeCondition;

/* ===================== الأكل ===================== */
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
  if (!items.length) { el.innerHTML = `<div class="empty"><div class="empty-emoji">🍽️</div><p class="muted">مفيش أكل مسجّل في اليوم ده.</p></div>`; return; }
  el.innerHTML = items.map((m) => `
    <div class="list-row">
      <div class="lr-main"><span class="hcat">🍽️ ${m.at_time ? escapeHtml(m.at_time) : "أكل"}</span>
        <span class="lr-note">${escapeHtml(m.items)}${m.note ? " · " + escapeHtml(m.note) : ""}</span></div>
      <div class="row-actions"><button class="del-btn" onclick="del('meals', ${m.id})" title="حذف">🗑️</button></div>
    </div>`).join("");
}
$("mealPrev")?.addEventListener("click", () => shiftMealDate(-1));
$("mealNext")?.addEventListener("click", () => shiftMealDate(1));

/* ===================== المحادثات ===================== */
const KIND_ICON = { voice: "🎙️", text: "⌨️", command: "⚙️" };
function renderChats() {
  const el = $("chats");
  const data = state.conversations;
  if (!data.length) { el.innerHTML = `<div class="empty"><div class="empty-emoji">💬</div><p class="muted">لسه مفيش محادثات.</p></div>`; return; }
  el.innerHTML = data.map((c) => `
    <div class="chat-card">
      <div class="chat-head">
        <span class="kind-chip">${KIND_ICON[c.kind] || "💬"} ${escapeHtml(c.kind || "")}</span>
        <div class="row-actions"><span class="lr-date">${fmtDateTime(c.created_at)}</span>
          <button class="del-btn" onclick="del('conversations', ${c.id})" title="حذف">🗑️</button></div>
      </div>
      <div class="bubble user"><span class="who">أنت</span>${escapeHtml(c.user_text || "")}</div>
      <div class="bubble ai"><span class="who">دوّنلي</span>${escapeHtml(c.ai_reply || "")}</div>
    </div>`).join("");
}

/* ===================== Analyze ===================== */
async function analyze() {
  const days = $("days").value;
  const analysisEl = $("analysis");
  analysisEl.classList.remove("hidden");
  analysisEl.innerHTML = `<div class="loading"><span class="spinner"></span> بحلّل أيامك...</div>`;
  $("analyzeBtn").disabled = true;
  try {
    const res = await api(`/api/analyze?days=${days}`);
    const data = await res.json();
    analysisEl.innerHTML = `<div class="analysis-text">${escapeHtml(data.analysis || data.error || "").replace(/\n/g, "<br>")}</div>`;
  } catch { analysisEl.innerHTML = `<p class="muted">حصل خطأ في التحليل.</p>`; }
  finally { $("analyzeBtn").disabled = false; }
}
$("analyzeBtn").addEventListener("click", analyze);

async function logout() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
}
$("logoutBtn").addEventListener("click", logout);
$("refreshBtn").addEventListener("click", loadAll);

/* ===================== Load ===================== */
async function loadAll() {
  try {
    const [j, g, h, c, cond, m, hab, fin, usg] = await Promise.all([
      api("/api/entries").then((r) => r.json()),
      api("/api/goals").then((r) => r.json()),
      api("/api/health").then((r) => r.json()),
      api("/api/conversations").then((r) => r.json()),
      api("/api/conditions").then((r) => r.json()),
      api("/api/meals").then((r) => r.json()),
      api("/api/habits").then((r) => r.json()),
      api("/api/finance").then((r) => r.json()),
      api("/api/usage").then((r) => r.json()),
    ]);
    state.journal = j; state.goals = g; state.health = h; state.conversations = c;
    state.conditions = cond; state.meals = m; state.habits = hab; state.finance = fin; state.usage = usg;
  } catch { return; }
  $("pageDateLabel").textContent = fmtDate(TODAY());
  renderJournal();
  renderGoals();
  renderHabits();
  renderPage();
  renderConditions();
  renderMeals();
  renderChats();
  const active = document.querySelector(".nav-item.active")?.dataset.tab;
  if (active === "finance") renderFinance();
  if (active === "usage") renderUsage();
  renderOverview();
}

/* ===================== Ambient background ===================== */
(function bg() {
  const canvas = $("bgCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, orbs;
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  function init() {
    orbs = Array.from({ length: 5 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 120 + Math.random() * 180,
      dx: (Math.random() - 0.5) * 0.25, dy: (Math.random() - 0.5) * 0.25,
      c: ["#6366f1", "#8b5cf6", "#a855f7", "#ec4899"][Math.floor(Math.random() * 4)],
    }));
  }
  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const o of orbs) {
      o.x += o.dx; o.y += o.dy;
      if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
      if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, o.c + "22"); g.addColorStop(1, o.c + "00");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  resize(); init(); tick();
  window.addEventListener("resize", () => { resize(); init(); });
})();

loadAll();
