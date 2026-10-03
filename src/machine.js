/* ===================== الربط بالماكينة (content-os) =====================
   دوّنلي هو المكان الوحيد اللي المستخدم بيسجّل فيه فلوسه. لو الحركة تبع مشروع برمجي موجود
   في تاب «الشغل» في الماكينة، بتتقيّد هناك كمان على المشروع لوحدها — من غير ما يكرر الكلام.

   - الماكينة شغّالة على نفس السيرفر؛ الطلبات من 127.0.0.1 مباشرة بتعدّي من غير تسجيل دخول.
   - الحركة هناك الـ id بتاعها fdw<id دوّنلي> — نفس نظام النقل القديم، فإعادة الإرسال مابتكرّرش.
   - لو نفس الدفعة اتقيّدت هناك بالإيد قبل كده (من الويب/تليجرام) بنربط بيها بدل ما نكرّر.
   - لو الماكينة مقفولة، القيد بيفضل مستني (machine_sync = null) وبيتبعت في المحاولة الجاية. */

import { config } from "./config.js";
import { getFinance, markFinanceSynced, financePendingMachine, normCurKey } from "./db.js";

export const machineOn = (userId) => !!config.machineUrl && Number(userId) === config.machineUserId;

async function call(method, path, body) {
  const res = await fetch(config.machineUrl + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(6000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(`${method} ${path} → ${res.status} ${data.error || ""}`.trim());
  return data;
}

/* ===== المشاريع ===== */

let cache = { at: 0, list: [] };
// مشاريع الشغل (من غير الخسرانة) — كاش دقيقة، ولو الماكينة مقفولة بنرجّع آخر نسخة نعرفها
export async function machineProjects(userId) {
  if (!machineOn(userId)) return [];
  if (Date.now() - cache.at < 60_000) return cache.list;
  try {
    const w = await call("GET", "/api/work");
    cache = {
      at: Date.now(),
      list: (w.deals || [])
        .filter((d) => d.stage !== "lost")
        .map((d) => ({
          id: d.id,
          title: d.title || "",
          client: d.client_name || "",
          stage: d.stage,
          currency: d.currency || "EGP",
          value: Number(d.value) || 0,
          collected: Number(d.collected) || 0,
          note: String(d.note || "").slice(0, 80),
        })),
    };
  } catch (e) {
    console.error("⚠️ الماكينة مش متاحة (المشاريع):", e.message);
  }
  return cache.list;
}

/* ===== التحويل لعملة المشروع ===== */

const CUR = { USD: "$", EGP: "ج" };
function toDealCurrency(amount, currency, dealCurrency) {
  const from = normCurKey(currency || "جنيه");
  const to = normCurKey(dealCurrency || "EGP");
  const rate = config.machineUsdRate;
  const shown = `${Number(amount).toLocaleString("en-US")}${CUR[from] || " " + (currency || from)}`;
  if (from === to) return { amount, conv: "" };
  if (from === "USD" && to === "EGP") return { amount: Math.round(amount * rate * 100) / 100, conv: ` (${shown} بسعر ${rate})` };
  if (from === "EGP" && to === "USD") return { amount: Math.round((amount / rate) * 100) / 100, conv: ` (${shown} بسعر ${rate})` };
  return { amount, conv: ` (${shown} — من غير تحويل)` }; // عملة ملهاش سعر عندنا: نقيّدها زي ما هي ونوضّح
}

const dayDiff = (a, b) => Math.abs(new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000;

/* ===== المزامنة ===== */

// بيبعت قيد واحد للماكينة حسب حالته: مربوط بمشروع → يتقيّد/يتحدّث هناك، اتفك ربطه → يتشال من المشروع.
// بيرجّع { ok, existing?, machineId?, error? } — مابيرميش أخطاء.
export async function syncFinance(userId, financeId) {
  if (!machineOn(userId)) return { ok: false, error: "off" };
  const f = getFinance(userId, financeId);
  if (!f) return { ok: false, error: "missing" };
  if (!f.project_id && !f.machine_id) return { ok: true }; // مالوش علاقة بالماكينة أصلًا
  try {
    if (!f.project_id) {
      // اتفك الربط: اللي احنا عملناه يتمسح، واللي هو كاتبه بإيده يفضل بس من غير مشروع
      if (f.machine_id?.startsWith("fdw")) await call("DELETE", `/api/finance?id=${encodeURIComponent(f.machine_id)}`);
      else if (f.machine_id) await call("POST", "/api/finance", { ...(await machineRow(f.machine_id)), deal_id: "" });
      markFinanceSynced(userId, f.id, null);
      return { ok: true };
    }

    const deal = (await machineProjects(userId)).find((d) => d.id === f.project_id);
    const { amount, conv } = toDealCurrency(Number(f.amount), f.currency, deal?.currency);

    // أول مرة: لو نفس الدفعة متقيّدة هناك بالإيد (نفس المشروع والاتجاه والمبلغ في حدود ٣ أيام) → نربط بيها بس
    if (!f.machine_id) {
      const fin = await call("GET", "/api/finance");
      const same = (fin.rows || []).find(
        (r) => r.deal_id === f.project_id && r.kind === f.direction && !String(r.id).startsWith("fdw")
          && Math.abs(Number(r.amount) - amount) < 1 && dayDiff(r.dt, f.entry_date) <= 3
      );
      if (same) {
        markFinanceSynced(userId, f.id, same.id);
        return { ok: true, existing: true, machineId: same.id };
      }
    }

    const machineId = f.machine_id || `fdw${f.id}`;
    const category = f.direction === "income" ? "دفعة" : f.category && f.category !== "أخرى" ? f.category : "مصروف";
    await call("POST", "/api/finance", {
      id: machineId,
      dt: f.entry_date,
      kind: f.direction,
      amount,
      category,
      note: `${f.note || ""}${conv} · من دوّنلي`.trim(),
      deal_id: f.project_id,
    });
    markFinanceSynced(userId, f.id, machineId);
    return { ok: true, machineId };
  } catch (e) {
    console.error(`⚠️ مزامنة القيد #${financeId} مع الماكينة فشلت:`, e.message);
    return { ok: false, error: e.message };
  }
}

async function machineRow(id) {
  const fin = await call("GET", "/api/finance");
  const r = (fin.rows || []).find((x) => x.id === id);
  if (!r) throw new Error(`الحركة ${id} مش موجودة في الماكينة`);
  return r;
}

// القيد اتمسح من دوّنلي → اللي احنا عملناه في الماكينة يتمسح معاه (اللي متكتب بالإيد هناك مانلمسوش)
export async function forgetFinance(userId, row) {
  if (!machineOn(userId) || !row?.machine_id?.startsWith("fdw")) return;
  try {
    await call("DELETE", `/api/finance?id=${encodeURIComponent(row.machine_id)}`);
  } catch (e) {
    console.error(`⚠️ مسح ${row.machine_id} من الماكينة فشل:`, e.message);
  }
}

// يبعت أي قيود مستنية (الماكينة كانت مقفولة، أو اتعدّلت من الواجهة)
let syncing = false;
export async function syncPending(userId = config.machineUserId) {
  if (!machineOn(userId) || syncing) return;
  syncing = true;
  try {
    for (const id of financePendingMachine(userId)) await syncFinance(userId, id);
  } finally {
    syncing = false;
  }
}

export function startMachineSync() {
  if (!config.machineUrl || !config.machineUserId) return;
  console.log(`🔗 الربط بالماكينة شغّال (${config.machineUrl}) للمستخدم #${config.machineUserId}`);
  setTimeout(() => syncPending().catch(() => {}), 15_000);
  setInterval(() => syncPending().catch(() => {}), 10 * 60_000);
}
