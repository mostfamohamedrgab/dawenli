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

  const noteEl = $("usageNote");
  if (noteEl) noteEl.innerHTML = "";
}

function renderStats(s, usage) {
  const totalCost = usage?.totals?.cost_usd || 0;
  const cards = [
    { ico: "👥", label: "المستخدمين", value: arNum(s.users), sub: `${arNum(s.active_14d)} نشط آخر ١٤ يوم` },
    { ico: "🔔", label: "مفعّلين الإشعارات", value: arNum(s.with_push), sub: `${arNum(s.with_email)} عندهم إيميل` },
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
      <td>${u.push ? `<span class="pill-tg">مفعّل</span>` : `<span class="pill-no">لأ</span>`}</td>
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
        ${escapeHtml(u.email || "بدون إيميل")}
      </p>
      <p class="muted" style="font-size:var(--text-xs)">اتسجّل ${fmtDate(u.created_at)} · آخر ظهور ${fmtAgo(u.last_seen)}</p>
      <div style="margin:12px 0;padding:10px 12px;border:1px solid var(--hairline);border-radius:10px">
        <div style="font-size:var(--text-sm);font-weight:700;margin-bottom:4px">👑 صاحب التطبيق</div>
        <p class="muted" style="font-size:var(--text-xs);margin:0 0 8px">صاحب التطبيق بيقدر يظبّط مزود الذكاء ويسحب التحديثات من جوّه التطبيق.</p>
        <button class="btn ${u.is_owner ? "secondary" : ""} sm" id="ownerToggle" data-id="${u.id}" data-on="${u.is_owner ? 1 : 0}">
          ${u.is_owner ? "اسحب الملكية" : "اجعله صاحب التطبيق"}
        </button>
        <span id="ownerMsg" style="font-size:var(--text-sm);margin-inline-start:8px"></span>
      </div>
      ${d.profile.length ? sec("🧠 دوّنلي يعرف عنه", facts) : ""}
      ${sec("📝 آخر اليوميات", entries)}
      ${sec("💰 آخر العمليات", fin)}
      ${sec("🩺 آخر السجلات الصحية", health)}
      ${d.goals.length ? sec("🎯 الأهداف", goals) : ""}
      ${d.habits.length ? sec("🔁 العادات", habits) : ""}`;
    $("drawerClose").addEventListener("click", closeDrawer);
    $("ownerToggle")?.addEventListener("click", async (e) => {
      const b = e.currentTarget, msg = $("ownerMsg");
      const makeOwner = b.dataset.on !== "1";
      b.disabled = true; msg.style.color = "var(--ink-muted)"; msg.textContent = "⏳…";
      try {
        const r = await api(`/api/admin/users/${b.dataset.id}/owner`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_owner: makeOwner }),
        }).then((r) => r.json());
        if (r.ok) { msg.style.color = "var(--brand-deep)"; msg.textContent = "✅ اتحفظ"; openUser(Number(b.dataset.id)); load(); }
        else { msg.style.color = "var(--danger-deep, #b52b27)"; msg.textContent = r.error || "حصل خطأ"; b.disabled = false; }
      } catch { msg.style.color = "var(--danger-deep, #b52b27)"; msg.textContent = "حصل خطأ"; b.disabled = false; }
    });
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

// إنشاء حساب مستخدم جديد (الأدمن بس)
$("newUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = $("nuResult");
  const body = {
    name: $("nuName").value.trim(),
    email: $("nuEmail").value.trim(),
    password: $("nuPass").value,
  };
  out.style.color = "var(--ink-muted)"; out.textContent = "ثواني…";
  try {
    const res = await api("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      out.style.color = "var(--brand-deep)";
      out.textContent = `✅ اتعمل حساب: ${data.user.email}`;
      $("nuName").value = ""; $("nuEmail").value = ""; $("nuPass").value = "";
      load();
    } else {
      out.style.color = "var(--danger-deep, #b52b27)";
      out.textContent = data.error || "حصل خطأ";
    }
  } catch {
    out.style.color = "var(--danger-deep, #b52b27)";
    out.textContent = "حصل خطأ، جرّب تاني";
  }
});

/* ===== تحديثات التطبيق (من الجيت) ===== */
function renderVersion(v) {
  const st = $("verStatus"), cur = $("verCurrent"), ch = $("verChangelog"), btn = $("verUpdateBtn");
  if (!v || !v.ok) {
    st.style.color = "var(--ink-muted)";
    st.textContent = "غير متاح";
    cur.textContent = v?.error || "مقدرتش أقرا حالة النسخة";
    btn.style.display = "none";
    return;
  }
  cur.innerHTML =
    `النسخة الحالية: <b>${escapeHtml(v.current.sha)}</b> — ${escapeHtml(v.current.subject)}<br>` +
    `<span style="opacity:.75">${fmtDate(v.current.date)} · فرع ${escapeHtml(v.current.branch)}</span>` +
    (v.dirty ? `<br><span style="color:var(--warning-deep,#a86a12)">⚠️ فيه تعديلات محلية على السيرفر — التحديث هيمسحها</span>` : "");
  if (v.remoteError) {
    st.style.color = "var(--warning-deep, #a86a12)";
    st.textContent = "⚠️ مقدرتش أتشيّك";
    ch.innerHTML = `<span class="muted" style="font-size:var(--text-sm)">${escapeHtml(v.remoteError)}</span>`;
    btn.style.display = "none";
    return;
  }
  if (v.updateAvailable) {
    st.style.color = "var(--brand-deep)";
    st.textContent = `🎉 فيه ${v.behind} تحديث جديد`;
    ch.innerHTML =
      `<div style="font-size:var(--text-sm);font-weight:700;margin-bottom:6px">الجديد:</div>` +
      `<ul style="margin:0;padding-inline-start:18px;font-size:var(--text-sm);line-height:1.9">` +
      v.commits.map((c) => `<li><code>${escapeHtml(c.sha)}</code> ${escapeHtml(c.subject)}</li>`).join("") +
      `</ul>`;
    btn.style.display = "";
  } else {
    st.style.color = "var(--brand-deep)";
    st.textContent = "✅ إنت على آخر نسخة";
    ch.innerHTML = "";
    btn.style.display = "none";
  }
}
async function loadVersion(check = true) {
  const st = $("verStatus");
  if (check) { st.style.color = "var(--ink-muted)"; st.textContent = "⏳ بنتشيّك…"; }
  try {
    renderVersion(await api(`/api/admin/version${check ? "" : "?check=0"}`).then((r) => r.json()));
  } catch {
    st.textContent = "حصل خطأ";
  }
}
$("verCheckBtn").addEventListener("click", () => loadVersion(true));
$("verUpdateBtn").addEventListener("click", async () => {
  if (!confirm("هنسحب آخر نسخة من الجيت ونعيد تشغيل التطبيق. الداتا بتتاخد نسخة احتياطية الأول. نكمّل؟")) return;
  const out = $("verResult"), btn = $("verUpdateBtn");
  btn.disabled = true;
  out.style.color = "var(--ink-muted)";
  out.textContent = "⏳ بننزّل التحديث… متقفلش الصفحة";
  try {
    const data = await api("/api/admin/update", { method: "POST" }).then((r) => r.json());
    const steps = (data.steps || []).map((s) => escapeHtml(s)).join("<br>");
    if (data.ok) {
      out.style.color = "var(--brand-deep)";
      out.innerHTML = steps + (data.changed ? `<br><b>${escapeHtml(data.message || "")}</b>` : `<br><b>${escapeHtml(data.message || "مفيش جديد")}</b>`);
      if (data.restarting) {
        // نستنى السيرفر يقوم تاني وبعدين نحدّث الحالة
        setTimeout(async () => {
          out.innerHTML += "<br>🔄 بنتأكد إن التطبيق رجع…";
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const r = await fetch("/api/admin/version?check=0");
              if (r.ok) { out.innerHTML += "<br>✅ التطبيق رجع شغّال بالنسخة الجديدة"; loadVersion(false); load(); return; }
            } catch {}
          }
          out.innerHTML += "<br>⚠️ التطبيق أخد وقت — اعمل ريفريش للصفحة وشوف";
        }, 2500);
      } else {
        loadVersion(false);
      }
    } else {
      out.style.color = "var(--danger-deep, #b52b27)";
      out.innerHTML = (steps ? steps + "<br>" : "") + escapeHtml(data.error || "حصل خطأ");
    }
  } catch {
    out.style.color = "var(--danger-deep, #b52b27)";
    out.textContent = "حصل خطأ في التحديث — راجع اللوج على السيرفر";
  } finally {
    btn.disabled = false;
  }
});
loadVersion(true);

/* ===== إعدادات مزود الذكاء ===== */
let AI_PROVIDERS = {};
function aiSyncFields() {
  const p = $("aiProvider").value;
  $("aiBaseUrlWrap").style.display = p === "custom" ? "flex" : "none";
  $("aiVoiceWrap").style.display = p === "openai" ? "none" : "flex";
  const def = AI_PROVIDERS[p]?.defaultModel || "";
  $("aiModel").placeholder = def || "اسم الموديل";
  // بدّل الموديل الافتراضي مع تغيير المزود — من غير ما نلمس موديل كتبه المستخدم بإيده
  if (!$("aiModel").value || Object.values(AI_PROVIDERS).some((x) => x.defaultModel === $("aiModel").value)) {
    $("aiModel").value = def;
  }
}
async function loadAiSettings() {
  try {
    const s = await api("/api/admin/ai-settings").then((r) => r.json());
    AI_PROVIDERS = s.providers || {};
    const st = $("aiStatus");
    if (s.configured) {
      st.style.color = "var(--brand-deep)";
      st.textContent = `✅ شغّال: ${AI_PROVIDERS[s.provider]?.label || s.provider} · ${s.model}` + (s.source === "env" ? " (من ملف .env)" : "");
    } else {
      st.style.color = "var(--danger-deep, #b52b27)";
      st.textContent = "⚠️ محتاج إعداد — اختار مزود وحط المفتاح عشان التطبيق يشتغل";
    }
    if (s.provider) $("aiProvider").value = s.provider;
    if (s.model) $("aiModel").value = s.model;
    if (s.baseUrl) $("aiBaseUrl").value = s.baseUrl;
    $("aiKeyHint").textContent = s.keyHint ? `(المحفوظ: ${s.keyHint} — سيبه فاضي للإبقاء عليه)` : "";
    aiSyncFields();
  } catch {}
}
$("aiProvider").addEventListener("change", aiSyncFields);
function aiBody() {
  return {
    provider: $("aiProvider").value,
    api_key: $("aiKey").value.trim(),
    model: $("aiModel").value.trim(),
    base_url: $("aiBaseUrl").value.trim(),
    voice_key: $("aiVoiceKey").value.trim() || undefined,
  };
}
$("aiTestBtn").addEventListener("click", async () => {
  const out = $("aiResult");
  out.style.color = "var(--ink-muted)"; out.textContent = "⏳ بنكلم المزود…";
  try {
    const data = await api("/api/admin/ai-settings/test", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aiBody()),
    }).then((r) => r.json());
    if (data.ok) {
      out.style.color = "var(--brand-deep)";
      out.textContent = `✅ الاتصال شغّال (${data.model}) — رد الموديل: «${data.reply}»`;
    } else {
      out.style.color = "var(--danger-deep, #b52b27)";
      out.textContent = `❌ فشل (${data.model}): ${data.error}`;
    }
  } catch {
    out.style.color = "var(--danger-deep, #b52b27)";
    out.textContent = "حصل خطأ في الاختبار، جرّب تاني";
  }
});
$("aiForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = $("aiResult");
  out.style.color = "var(--ink-muted)"; out.textContent = "⏳ بنحفظ…";
  try {
    const res = await api("/api/admin/ai-settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aiBody()),
    });
    const data = await res.json();
    if (data.ok) {
      out.style.color = "var(--brand-deep)";
      out.textContent = "✅ اتحفظ واتفعّل فورًا — دوس «اختبار الاتصال» للتأكيد";
      $("aiKey").value = ""; $("aiVoiceKey").value = "";
      loadAiSettings();
    } else {
      out.style.color = "var(--danger-deep, #b52b27)";
      out.textContent = data.error || "حصل خطأ";
    }
  } catch {
    out.style.color = "var(--danger-deep, #b52b27)";
    out.textContent = "حصل خطأ، جرّب تاني";
  }
});
loadAiSettings();

load();
