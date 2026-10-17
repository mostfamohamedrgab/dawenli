/* ===================== 💼 الشغل — مشاريع · رعايات · محتوى · فريق =====================
   لصاحب الشغل بس (state.me.work). البيانات كلها من /api/work، والدفعات نفسها قيود «الفلوس»
   المربوطة بمشروع/رعاية/بند — فمفيش رقم بيتكتب مرتين. بيستخدم دوال app.js ($ / api / escapeHtml / askConfirm). */

const W = { data: null, sub: "projects", filter: "active", year: "all" };
try { W.sub = localStorage.getItem("dw_work_sub") || "projects"; } catch {}

const wEsc = (s) => escapeHtml(s == null ? "" : String(s));
const wAttr = (s) => wEsc(s).replace(/"/g, "&quot;");
const CUR_SIGN = { USD: "$", EGP: "ج", EUR: "€", SAR: "ر.س", AED: "د.إ", GBP: "£" };
const curKey = (c) => {
  const x = String(c || "").trim().toLowerCase();
  if (["دولار", "usd", "$"].includes(x)) return "USD";
  if (["جنيه", "egp", "ج", "ج.م"].includes(x) || !x) return "EGP";
  if (["يورو", "eur"].includes(x)) return "EUR";
  if (["ريال", "sar"].includes(x)) return "SAR";
  if (["درهم", "aed"].includes(x)) return "AED";
  return x.toUpperCase();
};
function money(n, cur = "EGP") {
  const k = curKey(cur);
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const s = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return k === "USD" ? `$${s}` : `${s} ${CUR_SIGN[k] || k}`;
}
const toEgp = (n, cur) => (Number(n) || 0) * ((W.data?.fx || {})[curKey(cur)] || 1);
const fmtD = (d) => {
  if (!d) return "";
  try { return new Date(d + "T00:00:00").toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
};

async function loadWork() {
  try {
    const r = await api("/api/work");
    if (!r.ok) throw new Error(String(r.status));
    W.data = await r.json();
  } catch (e) {
    $("workMount").innerHTML = `<div class="card"><p class="muted">${e.message === "offline" ? "مفيش اتصال بالسيرفر" : "معرفتش أجيب بيانات الشغل"}</p></div>`;
    return false;
  }
  return true;
}

async function renderWorkPage() {
  if (!state.me?.work) return;
  if (W.data) drawWork(); // آخر نسخة على طول، وبعدين الجديد
  if (await loadWork()) drawWork();
}
window.renderWorkPage = renderWorkPage;

async function refreshWork() {
  if (await loadWork()) drawWork();
}

function drawWork() {
  const d = W.data;
  const t = d.totals, st = d.sponsorTotals;
  $("workStats").innerHTML = [
    ["💰", "اتحصّل من المشاريع", money(t.collected), "finances"],
    ["⏳", "باقي عند العملاء", money(t.due), "goals"],
    ["🤝", "رعايات اتدفعت (كل الوقت)", money(st.paid), "habits"],
    ["🧾", "مصاريف على المشاريع", money(t.spent), "health"],
  ].map(([ico, label, val, cls]) => `<div class="stat-card ${cls}"><div class="sc-top"><span class="sc-ico">${ico}</span><span class="sc-label">${label}</span></div><div class="sc-value"><b style="font-size:var(--text-h3)">${val}</b></div></div>`).join("");
  const counts = { unlinked: d.unlinked.length };
  document.querySelectorAll("#workSeg .seg-btn").forEach((b) => {
    b.dataset.active = String(b.dataset.sub === W.sub);
    const c = b.querySelector(".ws-count");
    if (c) c.textContent = counts[b.dataset.sub] ? ` (${counts[b.dataset.sub]})` : "";
  });
  const m = $("workMount");
  if (W.sub === "projects") m.innerHTML = projectsView();
  else if (W.sub === "sponsors") m.innerHTML = sponsorsView();
  else if (W.sub === "content") m.innerHTML = contentView();
  else if (W.sub === "team") m.innerHTML = teamView();
  else m.innerHTML = unlinkedView();
}

/* ===== المشاريع ===== */
const STAGE_CLS = { lead: "", meeting: "", proposal: "goals", won: "finances", delivering: "habits", delivered: "finances", lost: "health" };
function projectsView() {
  const d = W.data;
  const list = d.projects.filter((p) =>
    W.filter === "all" ? true : W.filter === "archived" ? p.archived || p.stage === "lost" : !p.archived && p.stage !== "lost");
  const general = d.general;
  const gTotal = general.filter((f) => f.direction === "expense").reduce((a, f) => a + toEgp(f.amount, f.currency), 0);
  return `
    <div class="wk-bar">
      <div class="wk-filters">
        ${[["active", "الشغّالة"], ["all", "الكل"], ["archived", "مؤرشفة/خسرناها"]].map(([k, l]) => `<button class="chip ${W.filter === k ? "finances" : ""}" data-wf="${k}">${l}</button>`).join("")}
      </div>
      <button class="btn finances sm" data-wact="newProject">＋ مشروع</button>
    </div>
    <div class="wk-list">
      ${list.map(projectCard).join("") || `<div class="card"><p class="muted">مفيش مشاريع هنا</p></div>`}
    </div>
    <div class="card" style="margin-top:18px">
      <div class="card-head"><h3>🧰 مصاريف الشغل العامة</h3><span class="muted" style="font-size:var(--text-sm)">${money(gTotal)} · أدوات واشتراكات وإعلانات مش تبع مشروع واحد</span></div>
      ${payList(general, "EGP", true)}
      <div class="wk-actions"><button class="btn secondary sm" data-wact="addPay" data-id="general">＋ مصروف عام</button></div>
    </div>`;
}
function projectCard(p) {
  const cur = p.currency;
  const pct = p.total > 0 ? Math.min(100, Math.round((p.collected / p.total) * 100)) : 0;
  const over = p.billing !== "monthly" && p.collected > (Number(p.value) || 0) && Number(p.value) > 0;
  const extras = (p.extras || []).filter((x) => x.title);
  return `
  <details class="card wk-card" ${W.open === p.id ? "open" : ""} data-pid="${wAttr(p.id)}">
    <summary>
      <div class="wk-head">
        <div class="wk-title">
          <b>${wEsc(p.title)}</b>
          <span class="muted">${p.client_name ? wEsc(p.client_name) + " · " : ""}${p.billing === "monthly" ? `🔁 شهري ${money(p.monthly, cur)}` : `القيمة ${money(p.total, cur)}`}</span>
        </div>
        <span class="chip ${STAGE_CLS[p.stage] || ""}">${wEsc(p.stage_label)}${p.archived ? " · مؤرشف" : ""}</span>
      </div>
      ${p.billing === "monthly" ? "" : `<div class="wk-prog"><span style="width:${pct}%"></span></div>`}
      <div class="wk-nums">
        <span>اتحصّل <b>${money(p.collected, cur)}</b></span>
        ${p.billing === "monthly" ? "" : `<span>باقي <b class="${p.due > 0 ? "wk-due" : ""}">${money(p.due, cur)}</b></span>`}
        ${p.spent ? `<span>مصاريف <b>${money(p.spent, cur)}</b></span><span>صافي <b>${money(p.profit, cur)}</b></span>` : ""}
      </div>
    </summary>
    <div class="wk-body">
      ${over ? `<p class="wk-note">⚠️ المتحصّل أكتر من قيمة المشروع (${money(p.value, cur)}) — يا إما شغل زيادة، يا إما فيه دفعة متسجّلة مرتين. راجع الدفعات تحت.</p>` : ""}
      ${extras.length ? `<div class="wk-sub">➕ إضافات: ${extras.map((x) => `${wEsc(x.title)} (${money(x.amount, cur)})`).join(" · ")}</div>` : ""}
      ${p.team ? `<div class="wk-sub">👥 الفريق: ${wEsc(p.team)}</div>` : ""}
      ${p.note ? `<div class="wk-sub">📝 ${wEsc(p.note)}</div>` : ""}
      ${p.deadline ? `<div class="wk-sub">📅 التسليم: ${fmtD(p.deadline)}</div>` : ""}
      <div class="wk-sub muted">${p.machine ? "🔗 متنقل من الماكينة — الدفعات الجديدة بتتقيّد هناك كمان" : "اتعمل في دوّنلي"}</div>
      <h4 class="wk-h4">الدفعات والمصاريف</h4>
      ${payList(p.payments, cur, true)}
      <div class="wk-actions">
        <button class="btn finances sm" data-wact="addPay" data-id="${wAttr(p.id)}">＋ دفعة / مصروف</button>
        <button class="btn secondary sm" data-wact="editProject" data-id="${wAttr(p.id)}">✏️ تعديل</button>
        <button class="btn ghost sm" data-wact="archiveProject" data-id="${wAttr(p.id)}">${p.archived ? "↩️ رجّعه" : "🗄️ أرشفة"}</button>
        ${p.payments.length ? "" : `<button class="btn ghost sm" data-wact="delProject" data-id="${wAttr(p.id)}">🗑️ مسح</button>`}
      </div>
    </div>
  </details>`;
}
function payList(rows, cur, unlink) {
  if (!rows.length) return `<p class="muted" style="margin:6px 0">لسه مفيش</p>`;
  return `<div class="wk-pays">${rows.map((f) => `
    <div class="wk-pay">
      <span class="wk-dir ${f.direction}">${f.direction === "income" ? "➕" : "➖"}</span>
      <span class="wk-pay-main">${wEsc(f.note || "—")}${f.split_from !== undefined ? ` <span class="muted">(🔀 ${f.pct}% من المرتب${f.split_from ? ` · متقيّد على ${wEsc(f.split_from)}` : ""})</span>` : ""}</span>
      <span class="muted">${fmtD(f.entry_date)}</span>
      <b>${money(f.amount, f.currency)}${cur && curKey(cur) !== curKey(f.currency) ? ` <span class="muted" style="font-weight:500">≈ ${money(toEgp(f.amount, f.currency) / ((W.data.fx || {})[curKey(cur)] || 1), cur)}</span>` : ""}</b>
      ${unlink && !f.split_from ? `<button class="wk-x" title="فك ربطها من هنا (القيد بيفضل في الفلوس)" data-wact="unlinkPay" data-fid="${f.id}">✕</button>` : ""}
    </div>`).join("")}</div>`;
}

/* ===== الرعايات ===== */
const SP_CLS = { talking: "", agreed: "goals", filming: "habits", published: "ideas", paid: "finances", cancelled: "health" };
function sponsorsView() {
  const d = W.data;
  const years = [...new Set(d.sponsors.map((s) => (s.agreed_at || s.created_at || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const list = d.sponsors.filter((s) => W.year === "all" || (s.agreed_at || s.created_at || "").startsWith(W.year));
  const open = list.filter((s) => !["paid", "cancelled"].includes(s.status));
  const done = list.filter((s) => ["paid", "cancelled"].includes(s.status));
  const sum = list.reduce((a, s) => a + toEgp(s.paid, s.currency), 0);
  const usd = list.filter((s) => curKey(s.currency) === "USD").reduce((a, s) => a + s.paid, 0);
  return `
    <div class="wk-bar">
      <div class="wk-filters">
        ${["all", ...years].map((y) => `<button class="chip ${W.year === y ? "finances" : ""}" data-wy="${y}">${y === "all" ? "كل السنين" : y}</button>`).join("")}
      </div>
      <button class="btn finances sm" data-wact="newSponsor">＋ رعاية</button>
    </div>
    <p class="muted" style="margin:0 0 12px">${list.length} رعاية · اتدفع <b>${money(usd, "USD")}</b> (≈ ${money(sum)})</p>
    ${open.length ? `<h4 class="wk-h4">🟡 مفتوحة (${open.length})</h4><div class="wk-list">${open.map(sponsorCard).join("")}</div>` : ""}
    <h4 class="wk-h4">✅ اتدفعت (${done.length})</h4>
    <div class="wk-grid">${done.map(sponsorCard).join("") || `<p class="muted">مفيش</p>`}</div>`;
}
function sponsorCard(s) {
  return `
  <div class="card wk-sp">
    <div class="wk-head">
      <div class="wk-title"><b>${wEsc(s.brand)}</b><span class="muted">${s.agreed_at ? fmtD(s.agreed_at) : ""}${s.video_title ? " · 🎬 " + wEsc(s.video_title) : ""}</span></div>
      <span class="chip ${SP_CLS[s.status] || ""}">${wEsc(s.status_label)}</span>
    </div>
    <div class="wk-nums">
      <span>المتفق <b>${money(s.amount, s.currency)}</b></span>
      <span>اتدفع <b>${money(s.paid, s.currency)}</b></span>
      ${s.remaining > 0 && s.status !== "cancelled" ? `<span>باقي <b class="wk-due">${money(s.remaining, s.currency)}</b></span>` : ""}
    </div>
    ${s.video_url ? `<a class="wk-link" href="${wAttr(s.video_url)}" target="_blank" rel="noopener">▶️ الفيديو</a>` : ""}
    ${s.note ? `<div class="wk-sub muted">${wEsc(s.note)}</div>` : ""}
    <div class="wk-actions">
      <button class="btn secondary sm" data-wact="editSponsor" data-id="${s.id}">✏️ تعديل</button>
      <button class="btn ghost sm" data-wact="delSponsor" data-id="${s.id}">🗑️</button>
    </div>
  </div>`;
}

/* ===== المحتوى (تقرير بالبنود) ===== */
function contentView() {
  const d = W.data;
  const years = [...new Set(d.report.map((r) => r.year))].sort().reverse();
  const rows = d.report.filter((r) => W.year === "all" || r.year === W.year);
  const byCat = {};
  for (const r of rows) {
    const o = (byCat[r.cat] ||= { cat: r.cat, income: 0, expense: 0, count: 0 });
    o.income += r.income; o.expense += r.expense; o.count += r.count;
  }
  const cats = Object.values(byCat).sort((a, b) => b.income + b.expense - (a.income + a.expense));
  const inc = cats.reduce((a, c) => a + c.income, 0), exp = cats.reduce((a, c) => a + c.expense, 0);
  const max = Math.max(1, ...cats.map((c) => Math.max(c.income, c.expense)));
  const tx = d.content.filter((r) => W.year === "all" || String(r.entry_date).startsWith(W.year)).slice(0, 120);
  return `
    <div class="wk-bar">
      <div class="wk-filters">
        ${["all", ...years].map((y) => `<button class="chip ${W.year === y ? "finances" : ""}" data-wy="${y}">${y === "all" ? "كل السنين" : y}</button>`).join("")}
      </div>
    </div>
    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat-card finances"><div class="sc-top"><span class="sc-ico">➕</span><span class="sc-label">دخل الشغل والمحتوى</span></div><div class="sc-value"><b style="font-size:var(--text-h3)">${money(inc)}</b></div></div>
      <div class="stat-card health"><div class="sc-top"><span class="sc-ico">➖</span><span class="sc-label">مصاريف الشغل والمحتوى</span></div><div class="sc-value"><b style="font-size:var(--text-h3)">${money(exp)}</b></div></div>
      <div class="stat-card goals"><div class="sc-top"><span class="sc-ico">🟰</span><span class="sc-label">الصافي</span></div><div class="sc-value"><b style="font-size:var(--text-h3)">${money(inc - exp)}</b></div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3>📒 حسب البند</h3><span class="muted" style="font-size:var(--text-sm)">كله محوّل للجنيه (الدولار بـ ${W.data.fx.USD})</span></div>
      <div class="wk-cats">
        ${cats.map((c) => `
          <div class="wk-cat">
            <div class="wk-cat-top"><b>${wEsc(c.cat)}</b><span class="muted">${c.count} حركة</span></div>
            ${c.income ? `<div class="wk-barrow"><span class="wk-bar-in" style="width:${(c.income / max) * 100}%"></span><b>${money(c.income)}</b></div>` : ""}
            ${c.expense ? `<div class="wk-barrow"><span class="wk-bar-out" style="width:${(c.expense / max) * 100}%"></span><b>−${money(c.expense)}</b></div>` : ""}
          </div>`).join("") || `<p class="muted">مفيش</p>`}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>🧾 الحركات</h3><span class="muted" style="font-size:var(--text-sm)">«📜 قديم» = سجل ٢٠٢٤–٢٠٢٥ من Notion (مش داخل رصيد الفلوس)</span></div>
      <div class="wk-pays">${tx.map((f) => `
        <div class="wk-pay">
          <span class="wk-dir ${f.direction}">${f.direction === "income" ? "➕" : "➖"}</span>
          <span class="wk-pay-main">${wEsc(f.note || "—")} <span class="chip" style="padding:2px 8px;font-size:11px">${wEsc(f.cat)}</span>${f.src === "history" ? ' <span class="muted">📜 قديم</span>' : ""}</span>
          <span class="muted">${fmtD(f.entry_date)}</span>
          <b>${money(f.amount, f.currency)}</b>
        </div>`).join("")}</div>
    </div>`;
}

/* ===== الفريق والعملاء ===== */
function teamView() {
  const d = W.data;
  const ptitle = Object.fromEntries(d.projects.map((p) => [p.id, p.title]));
  return `
    <div class="wk-bar"><h3 style="margin:0">👥 الفريق</h3><button class="btn finances sm" data-wact="newStaff">＋ حد في الفريق</button></div>
    <div class="wk-grid">
      ${d.staff.map((s) => {
        const rule = (s.rules || []).slice().sort((a, b) => (a.from < b.from ? 1 : -1))[0];
        return `<div class="card wk-sp">
          <div class="wk-head"><div class="wk-title"><b>${wEsc(s.name)}</b><span class="muted">${wEsc(s.role || "")}</span></div><span class="chip">${money(s.salary, s.currency)} / شهر</span></div>
          ${rule ? `<div class="wk-sub">🔀 مرتبه بيتوزّع من ${fmtD(rule.from)}: ${Object.entries(rule.split || {}).map(([pid, pct]) => `${wEsc(ptitle[pid] || pid)} ${pct}%`).join(" · ")}</div>` : `<div class="wk-sub muted">من غير توزيع — مرتبه بيتحسب على المشروع اللي يتقيّد عليه</div>`}
          <div class="wk-actions"><button class="btn secondary sm" data-wact="editStaff" data-id="${wAttr(s.id)}">✏️ تعديل</button><button class="btn ghost sm" data-wact="delStaff" data-id="${wAttr(s.id)}">🗑️</button></div>
        </div>`;
      }).join("") || `<p class="muted">مفيش حد لسه</p>`}
    </div>
    <div class="wk-bar" style="margin-top:22px"><h3 style="margin:0">🤝 العملاء</h3><button class="btn finances sm" data-wact="newClient">＋ عميل</button></div>
    <div class="wk-grid">
      ${d.clients.map((c) => {
        const ps = d.projects.filter((p) => p.client_id === c.id);
        return `<div class="card wk-sp">
          <div class="wk-head"><div class="wk-title"><b>${wEsc(c.name)}</b><span class="muted">${[c.phone, c.country, c.source].filter(Boolean).map(wEsc).join(" · ")}</span></div><span class="chip">${ps.length} مشروع</span></div>
          ${ps.length ? `<div class="wk-sub">${ps.map((p) => wEsc(p.title)).join(" · ")}</div>` : ""}
          <div class="wk-actions"><button class="btn secondary sm" data-wact="editClient" data-id="${wAttr(c.id)}">✏️ تعديل</button>${ps.length ? "" : `<button class="btn ghost sm" data-wact="delClient" data-id="${wAttr(c.id)}">🗑️</button>`}</div>
        </div>`;
      }).join("")}
    </div>`;
}

/* ===== مش متصنّفة ===== */
function unlinkedView() {
  const d = W.data;
  const opts = [
    `<option value="">— اختار —</option>`,
    `<optgroup label="💼 مشروع">${d.projects.filter((p) => p.stage !== "lost").map((p) => `<option value="p:${wAttr(p.id)}">${wEsc(p.title)}</option>`).join("")}<option value="p:general">🧰 مصاريف الشغل العامة</option></optgroup>`,
    `<optgroup label="🤝 رعاية">${d.sponsors.slice(0, 80).map((s) => `<option value="s:${s.id}">${wEsc(s.brand)} · ${money(s.amount, s.currency)}${s.agreed_at ? " · " + s.agreed_at.slice(0, 7) : ""}</option>`).join("")}<option value="s:new">＋ رعاية جديدة من الحركة دي</option></optgroup>`,
    `<optgroup label="📒 بند">${d.workCats.map((c) => `<option value="c:${wAttr(c)}">${wEsc(c)}</option>`).join("")}</optgroup>`,
  ].join("");
  return `
    <p class="muted" style="margin:0 0 12px">دي حركات في «الفلوس» متسجّلة «شغل» بس مش متربطة بمشروع ولا رعاية ولا بند. اربط كل واحدة عشان تتحسب صح في الشغل.</p>
    <div class="wk-pays">
      ${d.unlinked.map((f) => `
        <div class="wk-pay wk-un">
          <span class="wk-dir ${f.direction}">${f.direction === "income" ? "➕" : "➖"}</span>
          <span class="wk-pay-main">${wEsc(f.note || "—")} <span class="muted">· ${fmtD(f.entry_date)}</span></span>
          <b>${money(f.amount, f.currency)}</b>
          <select class="field wk-sel" data-fid="${f.id}">${opts}</select>
        </div>`).join("") || `<div class="card"><p class="muted">كله متصنّف 👌</p></div>`}
    </div>`;
}

/* ===== مودال الفورم ===== */
function workForm(title, fields, onSave) {
  const ov = $("workOverlay");
  $("workFormTitle").textContent = title;
  const f = $("workForm");
  f.innerHTML = fields.map((x) => {
    const v = x.value == null ? "" : x.value;
    let input;
    if (x.type === "select") input = `<select class="field" name="${x.name}">${x.options.map(([k, l]) => `<option value="${wAttr(k)}" ${String(k) === String(v) ? "selected" : ""}>${wEsc(l)}</option>`).join("")}</select>`;
    else if (x.type === "textarea") input = `<textarea class="field" name="${x.name}" rows="3">${wEsc(v)}</textarea>`;
    else input = `<input class="field" name="${x.name}" type="${x.type || "text"}" value="${wAttr(v)}" ${x.type === "number" ? 'step="any" inputmode="decimal"' : ""} ${x.placeholder ? `placeholder="${wAttr(x.placeholder)}"` : ""}>`;
    return `<label class="ef-row"><span>${wEsc(x.label)}</span>${input}</label>`;
  }).join("") + `<p class="wk-err" id="workFormErr"></p><div class="ef-actions"><button type="submit" class="btn finances">💾 حفظ</button><button type="button" class="btn secondary" id="workFormCancel">إلغاء</button></div>`;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f).entries());
    try {
      await onSave(body);
      ov.classList.add("hidden");
      await refreshWork();
    } catch (err) {
      $("workFormErr").textContent = err.message || "حصل خطأ";
    }
  };
  $("workFormCancel").onclick = () => ov.classList.add("hidden");
  ov.classList.remove("hidden");
}
async function wPost(path, body) {
  const r = await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || "حصل خطأ");
  return j;
}
async function wDel(path) {
  if (!(await askConfirm({ title: "متأكد إنك عايز تمسحها؟" }))) return;
  const r = await api(path, { method: "DELETE" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) alert(j.error || "معرفتش أمسح");
  await refreshWork();
}

const CURS = [["EGP", "جنيه"], ["USD", "دولار"], ["EUR", "يورو"], ["SAR", "ريال"], ["AED", "درهم"]];
function projectForm(p = {}) {
  const d = W.data;
  workForm(p.id ? "تعديل مشروع" : "مشروع جديد", [
    { name: "title", label: "اسم المشروع", value: p.title },
    { name: "client_id", label: "العميل", type: "select", value: p.client_id || "", options: [["", "— من غير عميل —"], ...d.clients.map((c) => [c.id, c.name])] },
    { name: "stage", label: "المرحلة", type: "select", value: p.stage || "lead", options: Object.entries(d.stages) },
    { name: "value", label: "القيمة المتفق عليها", type: "number", value: p.value },
    { name: "currency", label: "العملة", type: "select", value: curKey(p.currency || "EGP"), options: CURS },
    { name: "billing", label: "طريقة الدفع", type: "select", value: p.billing || "", options: [["", "مرة واحدة / على دفعات"], ["monthly", "🔁 اشتراك شهري"]] },
    { name: "monthly", label: "قيمة الشهر (لو شهري)", type: "number", value: p.monthly || "" },
    { name: "team", label: "الفريق (أسماء بفاصلة)", value: p.team },
    { name: "started_at", label: "بدأ", type: "date", value: p.started_at },
    { name: "deadline", label: "ميعاد التسليم", type: "date", value: p.deadline },
    { name: "source", label: "جه منين", value: p.source, placeholder: "إعلان فيسبوك، ترشيح…" },
    { name: "note", label: "ملاحظة", type: "textarea", value: p.note },
  ], (b) => wPost("/api/work/projects", { ...b, id: p.id }));
}
function sponsorForm(s = {}, fromFinance) {
  const d = W.data;
  workForm(s.id ? "تعديل رعاية" : "رعاية جديدة", [
    { name: "brand", label: "البراند", value: s.brand },
    { name: "amount", label: "المبلغ المتفق عليه", type: "number", value: s.amount },
    { name: "currency", label: "العملة", type: "select", value: curKey(s.currency || "USD"), options: CURS },
    { name: "status", label: "الحالة", type: "select", value: s.status || "agreed", options: Object.entries(d.sponsorStatus) },
    { name: "agreed_at", label: "تاريخ الاتفاق", type: "date", value: s.agreed_at },
    { name: "publish_at", label: "تاريخ النشر", type: "date", value: s.publish_at },
    { name: "video_title", label: "الفيديو", value: s.video_title },
    { name: "video_url", label: "لينك الفيديو", value: s.video_url, placeholder: "https://youtu.be/…" },
    { name: "note", label: "ملاحظة", type: "textarea", value: s.note },
  ], async (b) => {
    const j = await wPost("/api/work/sponsors", { ...b, id: s.id });
    if (fromFinance) await wPost("/api/work/link", { financeId: fromFinance, sponsorId: j.id });
  });
}
function staffForm(s = {}) {
  const d = W.data;
  const rule = (s.rules || []).slice().sort((a, b) => (a.from < b.from ? 1 : -1))[0] || { from: "", split: {} };
  const splitTxt = Object.entries(rule.split || {}).map(([pid, pct]) => `${pid}=${pct}`).join(", ");
  workForm(s.id ? "تعديل" : "حد جديد في الفريق", [
    { name: "name", label: "الاسم", value: s.name },
    { name: "role", label: "الدور", value: s.role },
    { name: "salary", label: "المرتب الشهري", type: "number", value: s.salary },
    { name: "currency", label: "العملة", type: "select", value: curKey(s.currency || "EGP"), options: CURS },
    { name: "rule_from", label: "توزيع المرتب من تاريخ", type: "date", value: rule.from },
    { name: "rule_project", label: "مرتبه كله على مشروع (اختياري)", type: "select", value: Object.keys(rule.split || {}).length === 1 ? Object.keys(rule.split)[0] : "",
      options: [["", splitTxt && Object.keys(rule.split).length > 1 ? `زي ما هو (${splitTxt})` : "— من غير توزيع —"], ...d.projects.filter((p) => p.stage !== "lost").map((p) => [p.id, p.title])] },
    { name: "phone", label: "تليفون", value: s.phone },
    { name: "note", label: "ملاحظة", type: "textarea", value: s.note },
  ], (b) => {
    let rules = s.rules || [];
    if (b.rule_project) rules = [...rules.filter((r) => r.from !== (b.rule_from || "")), { from: b.rule_from || new Date().toISOString().slice(0, 10), split: { [b.rule_project]: 100 } }];
    const { rule_from, rule_project, ...rest } = b;
    return wPost("/api/work/staff", { ...rest, id: s.id, rules });
  });
}
// دفعة/مصروف جديد على مشروع: بيتسجّل في «الفلوس» عادي (category شغل) وبيتربط بالمشروع
function payForm(pid) {
  const p = pid === "general" ? { id: "general", title: "🧰 مصاريف الشغل العامة", currency: "EGP" } : W.data.projects.find((x) => x.id === pid);
  if (!p) return;
  W.open = pid;
  workForm(`➕ ${p.title}`, [
    { name: "direction", label: "النوع", type: "select", value: pid === "general" ? "expense" : "income", options: [["income", "➕ دفعة من العميل"], ["expense", "➖ مصروف على المشروع"]] },
    { name: "amount", label: "المبلغ", type: "number", value: "" },
    { name: "currency", label: "العملة", type: "select", value: curKey(p.currency), options: [["EGP", "جنيه"], ["USD", "دولار"], ["EUR", "يورو"], ["SAR", "ريال"], ["AED", "درهم"]] },
    { name: "entryDate", label: "التاريخ", type: "date", value: state.me?.today || new Date().toISOString().slice(0, 10) },
    { name: "note", label: "الوصف", value: "", placeholder: pid === "general" ? "اشتراك كلود، دومين…" : "دفعة تانية، مرتب…" },
  ], async (b) => {
    if (!(Number(b.amount) > 0)) throw new Error("اكتب المبلغ");
    const CUR_AR = { EGP: "جنيه", USD: "دولار", EUR: "يورو", SAR: "ريال", AED: "درهم" };
    const r = await api("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...b, currency: CUR_AR[b.currency] || b.currency, category: "شغل", note: b.note || (b.direction === "income" ? `دفعة — ${p.title}` : `مصروف — ${p.title}`) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(j.error || "معرفتش أسجّلها");
    await wPost("/api/work/link", { financeId: j.id, projectId: pid });
    if (typeof loadAll === "function") loadAll(false); // «الفلوس» تتحدّث كمان
  });
}

function clientForm(c = {}) {
  workForm(c.id ? "تعديل عميل" : "عميل جديد", [
    { name: "name", label: "الاسم", value: c.name },
    { name: "phone", label: "تليفون", value: c.phone },
    { name: "country", label: "البلد", value: c.country },
    { name: "source", label: "جه منين", value: c.source },
    { name: "note", label: "ملاحظة", type: "textarea", value: c.note },
  ], (b) => wPost("/api/work/clients", { ...b, id: c.id }));
}

/* ===== الأحداث ===== */
document.addEventListener("click", async (e) => {
  const seg = e.target.closest("#workSeg .seg-btn");
  if (seg) {
    W.sub = seg.dataset.sub; W.year = "all";
    try { localStorage.setItem("dw_work_sub", W.sub); } catch {}
    drawWork();
    return;
  }
  if (!e.target.closest('[data-panel="work"]')) return;
  const wf = e.target.closest("[data-wf]");
  if (wf) { W.filter = wf.dataset.wf; drawWork(); return; }
  const wy = e.target.closest("[data-wy]");
  if (wy) { W.year = wy.dataset.wy; drawWork(); return; }
  const b = e.target.closest("[data-wact]");
  if (!b) return;
  e.preventDefault();
  const id = b.dataset.id;
  const d = W.data;
  const P = () => d.projects.find((p) => p.id === id);
  const S = () => d.sponsors.find((s) => String(s.id) === String(id));
  switch (b.dataset.wact) {
    case "newProject": return projectForm();
    case "editProject": W.open = id; return projectForm(P());
    case "archiveProject": W.open = id; await wPost("/api/work/projects", { id, archived: P()?.archived ? 0 : 1 }).catch((er) => alert(er.message)); return refreshWork();
    case "delProject": return wDel(`/api/work/projects/${encodeURIComponent(id)}`);
    case "addPay": return payForm(id);
    case "unlinkPay": {
      if (!(await askConfirm({ icon: "🔗", title: "تفك ربط القيد ده؟", text: "القيد بيفضل في «الفلوس» زي ما هو — بس مش هيتحسب على المشروع ده (وهيتشال من الماكينة لو كان متبعت هناك).", ok: "فك الربط", danger: false }))) return;
      await wPost("/api/work/link", { financeId: Number(b.dataset.fid), projectId: "" }).catch((er) => alert(er.message));
      return refreshWork();
    }
    case "newSponsor": return sponsorForm();
    case "editSponsor": return sponsorForm(S());
    case "delSponsor": return wDel(`/api/work/sponsors/${encodeURIComponent(id)}`);
    case "newStaff": return staffForm();
    case "editStaff": return staffForm(d.staff.find((s) => s.id === id));
    case "delStaff": return wDel(`/api/work/staff/${encodeURIComponent(id)}`);
    case "newClient": return clientForm();
    case "editClient": return clientForm(d.clients.find((c) => c.id === id));
    case "delClient": return wDel(`/api/work/clients/${encodeURIComponent(id)}`);
  }
});
document.addEventListener("toggle", (e) => {
  const det = e.target;
  if (det.classList?.contains("wk-card") && det.open) W.open = det.dataset.pid;
}, true);
document.addEventListener("change", async (e) => {
  const sel = e.target.closest(".wk-sel");
  if (!sel || !sel.value) return;
  const fid = Number(sel.dataset.fid);
  const [k, v] = [sel.value.slice(0, 1), sel.value.slice(2)];
  try {
    if (k === "s" && v === "new") {
      const f = W.data.unlinked.find((x) => x.id === fid);
      sel.value = "";
      return sponsorForm({ brand: "", amount: f?.amount, currency: curKey(f?.currency), status: "paid", agreed_at: f?.entry_date, note: f?.note }, fid);
    }
    await wPost("/api/work/link", k === "p" ? { financeId: fid, projectId: v } : k === "s" ? { financeId: fid, sponsorId: Number(v) } : { financeId: fid, workCat: v });
    await refreshWork();
  } catch (er) {
    alert(er.message);
  }
});
$("workOverlay")?.addEventListener("click", (e) => { if (e.target.id === "workOverlay") e.currentTarget.classList.add("hidden"); });
