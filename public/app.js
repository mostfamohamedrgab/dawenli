const analysisEl = document.getElementById("analysis");
const analyzeBtn = document.getElementById("analyzeBtn");
const daysSel = document.getElementById("days");
const logoutBtn = document.getElementById("logoutBtn");

const state = { journal: [], goals: [] };

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
    return new Date(d).toLocaleDateString("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return d;
  }
}
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauth");
  }
  return res;
}

async function del(kind, id) {
  if (!confirm("متأكد إنك عايز تمسحها؟")) return;
  await api(`/api/${kind}/${id}`, { method: "DELETE" });
  loadAll();
}
window.del = del;

/* ===================== Tabs ===================== */
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  document.querySelectorAll(".tab-panel").forEach((p) =>
    p.classList.toggle("hidden", p.dataset.panel !== tab)
  );
});

/* ===================== Stats ===================== */
function computeStreak(entries) {
  const days = new Set(entries.map((e) => e.entry_date));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (days.has(iso)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (streak === 0 && iso === new Date().toISOString().slice(0, 10)) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function dominantMood(entries) {
  const counts = {};
  for (const e of entries) {
    if (!e.mood) continue;
    counts[e.mood] = (counts[e.mood] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? moodEmoji(top[0]) : "—";
}

function renderStats() {
  document.getElementById("statJournal").textContent = state.journal.length;
  document.getElementById("statStreak").textContent = computeStreak(state.journal);
  document.getElementById("statMood").textContent = dominantMood(state.journal);
  document.getElementById("statGoals").textContent = state.goals.length;
}

/* ===================== Journal ===================== */
function renderJournal() {
  const el = document.getElementById("entries");
  const data = state.journal;
  if (!data.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🎙️</div>
      <p>لسه مفيش يوميات.</p>
      <p class="muted">ابعت voice أو اكتب نص للبوت على تليجرام وهيظهر هنا.</p></div>`;
    return;
  }
  el.innerHTML = data
    .map((e) => {
      const tags = (e.tags || [])
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join("");
      return `
      <article class="entry-card">
        <div class="entry-head">
          <div class="entry-date">${fmtDate(e.entry_date)}</div>
          <div class="row-actions">
            <span class="mood-chip">${moodEmoji(e.mood)} ${escapeHtml(e.mood || "")}</span>
            <button class="del-btn" onclick="del('entries', ${e.id})" title="حذف">🗑️</button>
          </div>
        </div>
        <p class="entry-summary">${escapeHtml(e.summary || "")}</p>
        ${tags ? `<div class="tags">${tags}</div>` : ""}
        <details class="entry-full">
          <summary>النص الكامل</summary>
          <p>${escapeHtml(e.transcript || "")}</p>
        </details>
      </article>`;
    })
    .join("");
}

/* ===================== Goals ===================== */
function renderGoals() {
  const el = document.getElementById("goals");
  const data = state.goals;
  if (!data.length) {
    el.innerHTML = `<div class="empty"><div class="empty-emoji">🎯</div>
      <p class="muted">ضيف هدف فوق، أو قول للبوت "هدفي أوصل ٥٠٠ ألف".</p></div>`;
    return;
  }
  el.innerHTML = data
    .map((g) => {
      const pct = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0;
      const unit = g.unit ? " " + escapeHtml(g.unit) : "";
      return `
      <div class="goal-card">
        <div class="goal-top">
          <span class="goal-title">${escapeHtml(g.title)}</span>
          <button class="del-btn" onclick="del('goals', ${g.id})" title="حذف">🗑️</button>
        </div>
        ${
          g.target
            ? `<div class="goal-bar"><span style="width:${pct}%"></span></div>
               <div class="goal-meta">
                 <span>${fmtNum(g.current)} / ${fmtNum(g.target)}${unit}</span>
                 <span class="goal-pct">${pct}%</span>
               </div>
               <div class="goal-meta muted">باقي ${fmtNum(Math.max(0, g.target - g.current))}${unit}</div>`
            : `<div class="goal-meta"><span>الحالي: ${fmtNum(g.current)}${unit}</span></div>`
        }
        <div class="goal-update">
          <input type="number" placeholder="حدّث الحالي" id="gc-${g.id}" class="select gf-sm" />
          <button class="ghost-btn sm" onclick="updateGoal(${g.id})">تحديث</button>
        </div>
      </div>`;
    })
    .join("");
}

async function updateGoal(id) {
  const v = document.getElementById(`gc-${id}`).value;
  if (v === "") return;
  await api(`/api/goals/${id}/current`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current: Number(v) }),
  });
  loadAll();
}
window.updateGoal = updateGoal;

document.getElementById("goalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("goalTitle").value.trim();
  const target = document.getElementById("goalTarget").value;
  const unit = document.getElementById("goalUnit").value.trim();
  if (!title) return;
  await api("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, target, unit }),
  });
  e.target.reset();
  loadAll();
});

/* ===================== Analyze ===================== */
async function analyze() {
  const days = daysSel.value;
  analysisEl.classList.remove("hidden");
  analysisEl.innerHTML = `<div class="loading"><span class="spinner"></span> بحلّل أيامك...</div>`;
  analyzeBtn.disabled = true;
  try {
    const res = await api(`/api/analyze?days=${days}`);
    const data = await res.json();
    analysisEl.innerHTML = `<div class="analysis-text">${escapeHtml(
      data.analysis || data.error || ""
    ).replace(/\n/g, "<br>")}</div>`;
  } catch {
    analysisEl.innerHTML = `<p class="muted">حصل خطأ في التحليل.</p>`;
  } finally {
    analyzeBtn.disabled = false;
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login";
}

/* ===================== Load ===================== */
async function loadAll() {
  try {
    const [j, g] = await Promise.all([
      api("/api/entries").then((r) => r.json()),
      api("/api/goals").then((r) => r.json()),
    ]);
    state.journal = j;
    state.goals = g;
  } catch {
    return;
  }
  renderStats();
  renderJournal();
  renderGoals();
}

analyzeBtn.addEventListener("click", analyze);
logoutBtn.addEventListener("click", logout);
loadAll();
