/* ===================== لوحة الأدمن ===================== */
const $ = (id) => document.getElementById(id);
const arNum = (n) => Number(n || 0).toLocaleString("ar-EG");
const usd = (n) => "$" + Number(n || 0).toFixed(Number(n) >= 1 ? 2 : 4);
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
function fmtAgo(d) {
  if (!d) return "مجلوش بعد";
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (days <= 0) return "النهاردة";
  if (days === 1) return "امبارح";
  if (days < 30) return `من ${arNum(days)} يوم`;
  return fmtDate(d);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) { window.location.href = "/admin/login"; throw new Error("unauth"); }
  return res;
}

let DATA = null;

async function load() {
  try {
    const [me, ov] = await Promise.all([
      api("/api/admin/me").then((r) => r.json()),
      api("/api/admin/overview").then((r) => r.json()),
    ]);
    $("adminName").textContent = `👤 ${me.username}`;
    DATA = ov;
    renderStats(ov.stats, ov.usage);
    renderUsage(ov.usage, ov.pricing);
    renderUsers(ov.users);
  } catch {}
}

/* ===== استهلاك الـAI التفصيلي ===== */
const USAGE_KINDS = {
  transcribe: "🎙️ تفريغ الصوت",
  agent: "🧠 الـ Agent (فهم + تسجيل + رد)",
  analyze: "📈 تحليل اليوميات",
  report: "📋 التقرير الشامل",
  doctor: "🩺 تقرير الدكتور",
  classify: "🗂️ تصنيف (قديم)",
  reflect: "💬 رد (قديم)",
  other: "⚙️ غير ذلك",
};

function renderUsage(usage, pricing) {
  const t = usage?.totals || {};
  const rows = usage?.byKind || [];
  const min = (sec) => arNum((Number(sec || 0) / 60).toFixed(1));
  const totalTokens = (t.input_tokens || 0) + (t.output_tokens || 0);

  $("usageTotals").textContent =
    `${arNum(t.calls || 0)} نداء · ${arNum(totalTokens)} توكن · ${min(t.audio_seconds)} دقيقة صوت · إجمالي ${usd(t.cost_usd)}`;

  $("usageBody").innerHTML = rows.length
    ? rows.map((r) => `
      <tr>
        <td>${USAGE_KINDS[r.kind] || USAGE_KINDS.other}</td>
        <td class="muted" style="font-size:var(--text-xs)">${escapeHtml(r.model || "—")}</td>
        <td>${arNum(r.calls)}</td>
        <td>${arNum(r.input_tokens)}</td>
        <td>${arNum(r.output_tokens)}</td>
        <td>${r.audio_seconds ? min(r.audio_seconds) : "—"}</td>
        <td><b>${usd(r.cost_usd)}</b></td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="muted" style="font-size:var(--text-sm)">لسه مفيش استهلاك متسجّل.</td></tr>`;

  // بطاقة الأسعار — عشان يبان إزاي اتحسبت التكلفة بالظبط
  const rateCard = Object.entries(pricing || {})
    .map(([model, p]) => {
      const parts = [];
      if (p.in != null) parts.push(`$${p.in}/مليون توكن إدخال`);
      if (p.out != null) parts.push(`$${p.out}/مليون توكن إخراج`);
      if (p.perMin != null) parts.push(`$${p.perMin}/دقيقة صوت`);
      return `<b>${escapeHtml(model)}</b>: ${parts.join(" · ")}`;
    })
    .join("<br>");

  const since = t.since ? `بنتتبّع من ${fmtDate(t.since)}. ` : "";
  $("usageNote").innerHTML =
    `${since}عدد التوكنز والدقايق دي <b>حقيقية</b> جايّة من الـ response بتاع OpenAI API. ` +
    `التكلفة محسوبة = التوكنز × سعر الموديل من القايمة دي:<br>${rateCard}`;
}

function renderStats(s, usage) {
  const totalCost = usage?.totals?.cost_usd || 0;
  const cards = [
    { ico: "👥", label: "المستخدمين", value: arNum(s.users), sub: `${arNum(s.active_14d)} نشط آخر ١٤ يوم` },
    { ico: "✈", label: "مربوطين بتيليجرام", value: arNum(s.with_telegram), sub: `${arNum(s.with_email)} عندهم إيميل` },
    { ico: "📝", label: "إجمالي التدوينات", value: arNum(s.entries), sub: `${arNum(s.health)} سجل صحي · ${arNum(s.finance)} عملية` },
    { ico: "💬", label: "المحادثات", value: arNum(s.conversations), sub: `${arNum(s.tasks)} مهمة` },
    { ico: "🤖", label: "تكلفة الـAI كلها", value: usd(totalCost), sub: `الشهر ده ${usd(s.ai_cost_month)}` },
  ];
  $("statCards").innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="sc-top"><span class="sc-ico">${c.ico}</span><span class="sc-label">${c.label}</span></div>
      <div class="sc-value"><b style="font-size:var(--text-h3)">${c.value}</b></div>
      <div class="sc-delta">${c.sub}</div>
    </div>`).join("");
}

function renderUsers(users) {
  $("usersCount").textContent = `${arNum(users.length)} مستخدم`;
  $("usersBody").innerHTML = users.map((u) => `
    <tr data-id="${u.id}">
      <td>
        <div class="u-name">${escapeHtml(u.name || "—")}${u.is_owner ? " 👑" : ""}</div>
        <div class="muted" style="font-size:var(--text-xs)">${escapeHtml(u.email || "بدون إيميل")}</div>
      </td>
      <td>${u.chat_id ? `<span class="pill-tg">مربوط</span>` : `<span class="pill-no">لأ</span>`}</td>
      <td>${fmtAgo(u.last_seen)}</td>
      <td>${arNum(u.entries)}</td>
      <td>${arNum(u.finance)}</td>
      <td>${arNum(u.health)}</td>
      <td>${arNum(u.tasks)}</td>
      <td>${arNum(u.conversations)}</td>
      <td>${usd(u.ai_cost)}</td>
    </tr>`).join("");
  $("usersBody").querySelectorAll("tr").forEach((tr) =>
    tr.addEventListener("click", () => openUser(Number(tr.dataset.id)))
  );
}

/* ===== درج تفاصيل المستخدم ===== */
const MOOD = { "تمرين": "🏃", "دواء": "💊", "أكل": "🍽️", "عرض": "🤒", "نوم": "😴", "نفسية": "🧠", "ملاحظة": "📝" };
async function openUser(id) {
  $("drawerOverlay").classList.add("show");
  $("drawer").innerHTML = `<div class="loading"><span class="spinner"></span> بحمّل…</div>`;
  try {
    const d = await api(`/api/admin/users/${id}`).then((r) => r.json());
    const u = d.user;
    const sec = (title, rows) => `
      <h3 style="font:var(--type-h3);font-size:var(--text-h4);margin:18px 0 10px">${title}</h3>
      ${rows || `<p class="muted" style="font-size:var(--text-sm)">مفيش حاجة.</p>`}`;
    const facts = d.profile.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${d.profile.map((f) => `<span class="chip">${escapeHtml(f.fact_key)}: ${escapeHtml(f.value)}</span>`).join("")}</div>`
      : "";
    const goals = d.goals.length
      ? d.goals.map((g) => `<div class="list-row"><div class="lm"><span class="l2">🎯 ${escapeHtml(g.title)}</span><span class="l1">${arNum(g.current)}${g.target ? " / " + arNum(g.target) : ""} ${escapeHtml(g.unit || "")}</span></div></div>`).join("")
      : "";
    const habits = d.habits.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${d.habits.map((h) => `<span class="chip habits">${h.emoji || "🔁"} ${escapeHtml(h.title)} · ${arNum(h.streak)}🔥</span>`).join("")}</div>`
      : "";
    const fin = d.finance.slice(0, 12).map((f) => `
      <div class="list-row"><div class="lm"><span class="l1">${f.direction === "income" ? "➕" : "➖"} ${fmtDate(f.entry_date)} · ${escapeHtml(f.category || "")}</span><span class="l2">${escapeHtml(f.note || "—")}</span></div><span class="l-amount ${f.direction === "income" ? "pos" : "neg"}">${arNum(f.amount)} ${escapeHtml(f.currency || "ج")}</span></div>`).join("");
    const health = d.health.slice(0, 12).map((h) => `
      <div class="list-row"><div class="lm"><span class="l1">${MOOD[h.category] || "🩺"} ${escapeHtml(h.category || "")} · ${fmtDate(h.entry_date)}</span><span class="l2">${escapeHtml(h.detail)}</span></div></div>`).join("");
    const entries = d.entries.slice(0, 10).map((e) => `
      <div class="list-row"><div class="lm"><span class="l1">${fmtDate(e.entry_date)} · ${escapeHtml(e.mood || "")}</span><span class="l2">${escapeHtml(e.summary || "")}</span></div></div>`).join("");

    $("drawer").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px">
        <h2 style="font:var(--type-h2);font-size:var(--text-h3)">${escapeHtml(u.name || "مستخدم")}${u.is_owner ? " 👑" : ""}</h2>
        <button class="icon-btn" id="drawerClose" title="إغلاق" style="font-size:18px">✕</button>
      </div>
      <p class="muted" style="font-size:var(--text-sm);margin:0 0 4px">
        ${escapeHtml(u.email || "بدون إيميل")} · ${u.chat_id ? "تيليجرام مربوط ✈" : "مش مربوط بتيليجرام"}
      </p>
      <p class="muted" style="font-size:var(--text-xs)">اتسجّل ${fmtDate(u.created_at)} · آخر ظهور ${fmtAgo(u.last_seen)}</p>
      ${d.profile.length ? sec("🧠 دوّنلي يعرف عنه", facts) : ""}
      ${sec("📝 آخر اليوميات", entries)}
      ${sec("💰 آخر العمليات", fin)}
      ${sec("🩺 آخر السجلات الصحية", health)}
      ${d.goals.length ? sec("🎯 الأهداف", goals) : ""}
      ${d.habits.length ? sec("🔁 العادات", habits) : ""}`;
    $("drawerClose").addEventListener("click", closeDrawer);
  } catch {
    $("drawer").innerHTML = `<p class="muted">حصل خطأ في التحميل.</p>`;
  }
}
function closeDrawer() { $("drawerOverlay").classList.remove("show"); }
$("drawerOverlay").addEventListener("click", (e) => { if (e.target === $("drawerOverlay")) closeDrawer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

$("refreshBtn").addEventListener("click", load);
$("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/admin/login";
});

load();
