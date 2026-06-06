const analysisEl = document.getElementById("analysis");
const analyzeBtn = document.getElementById("analyzeBtn");
const daysSel = document.getElementById("days");
const logoutBtn = document.getElementById("logoutBtn");

const state = { journal: [] };

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
      // النهاردة لسه مفيش تدوينة — نبدأ نعدّ من امبارح
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
    state.journal = await api("/api/entries").then((r) => r.json());
  } catch {
    return;
  }
  renderStats();
  renderJournal();
}

analyzeBtn.addEventListener("click", analyze);
logoutBtn.addEventListener("click", logout);
loadAll();
