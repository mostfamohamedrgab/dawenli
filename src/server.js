import express from "express";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import {
  listEntries,
  entriesSince,
  deleteEntry,
  listFinance,
  deleteFinance,
  listHealth,
  deleteHealth,
  listGoals,
  applyGoal,
  deleteGoal,
  setGoalCurrent,
  listConversations,
  deleteConversation,
  listConditions,
  getCondition,
  closeCondition,
  deleteCondition,
  healthBetween,
  listMeals,
  deleteMeal,
  addFinance,
  listHabits,
  addHabit,
  logHabit,
  unlogHabit,
  deleteHabit,
  aiUsageSummary,
} from "./db.js";
import { analyzeEntries, doctorReport } from "./openai.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const SESSION_TTL = 30 * 86400 * 1000;
const sessions = new Map(); // token -> expiresAt

function newSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function validSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function parseCookies(req) {
  const h = req.headers.cookie || "";
  return Object.fromEntries(
    h
      .split(";")
      .map((c) => c.trim().split("="))
      .filter((p) => p[0])
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))])
  );
}

const authed = (req) => validSession(parseCookies(req).dawenli_session);

export function startServer() {
  const app = express();
  app.use(express.json());

  app.post("/api/login", (req, res) => {
    const { password, remember } = req.body || {};
    if (password && password === config.dashboardPassword) {
      const token = newSession();
      // remember me: كوكي دائم 30 يوم، غير كده كوكي جلسة بيخلص بقفل المتصفح
      const maxAge = remember === false ? "" : `; Max-Age=${30 * 86400}`;
      res.setHeader(
        "Set-Cookie",
        `dawenli_session=${token}; HttpOnly; SameSite=Strict; Path=/${maxAge}`
      );
      return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false, error: "كلمة السر غلط" });
  });

  app.post("/api/logout", (req, res) => {
    sessions.delete(parseCookies(req).dawenli_session);
    res.setHeader("Set-Cookie", "dawenli_session=; HttpOnly; Path=/; Max-Age=0");
    res.json({ ok: true });
  });

  // أصول عامة (مفيهاش بيانات حسّاسة)
  app.get("/style.css", (_req, res) =>
    res.sendFile(join(publicDir, "style.css"))
  );
  app.get("/login.js", (_req, res) =>
    res.sendFile(join(publicDir, "login.js"))
  );

  app.get(["/login", "/login.html"], (req, res) => {
    if (authed(req)) return res.redirect("/");
    res.sendFile(join(publicDir, "login.html"));
  });

  // صفحة هبوط ترويجية عامة (مفيهاش بيانات)
  app.get(["/landing", "/landing.html", "/welcome"], (_req, res) =>
    res.sendFile(join(publicDir, "landing.html"))
  );

  // محمي: السكربت والصفحة والبيانات
  app.get("/app.js", (req, res) =>
    authed(req) ? res.sendFile(join(publicDir, "app.js")) : res.status(401).end()
  );

  app.get("/", (req, res) => {
    if (!authed(req)) return res.redirect("/login");
    res.sendFile(join(publicDir, "index.html"));
  });

  app.get("/api/entries", (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: "غير مصرّح" });
    res.json(listEntries(500));
  });

  app.get("/api/analyze", async (req, res) => {
    if (!authed(req)) return res.status(401).json({ error: "غير مصرّح" });
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
    const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);
    const entries = entriesSince(since);
    if (!entries.length)
      return res.json({ analysis: "مفيش تدوينات في الفترة دي." });
    try {
      const analysis = await analyzeEntries(entries);
      res.json({ analysis });
    } catch (err) {
      console.error("analyze error:", err);
      res.status(500).json({ error: "فشل التحليل" });
    }
  });

  const gate = (req, res) => {
    if (!authed(req)) {
      res.status(401).json({ error: "غير مصرّح" });
      return false;
    }
    return true;
  };

  // ===== الأقسام =====
  app.get("/api/finance", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listFinance(500));
  });
  app.get("/api/health", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listHealth(500));
  });
  app.get("/api/goals", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listGoals());
  });
  app.get("/api/conversations", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listConversations(500));
  });
  app.get("/api/conditions", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listConditions());
  });
  app.get("/api/meals", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listMeals(500));
  });
  app.get("/api/habits", (req, res) => {
    if (!gate(req, res)) return;
    res.json(listHabits());
  });
  app.get("/api/usage", (req, res) => {
    if (!gate(req, res)) return;
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : 30;
    res.json(aiUsageSummary(days));
  });

  // تقرير للدكتور: تلخيص AI + خط زمني للأعراض في فترة المتابعة
  app.get("/api/conditions/:id/report", async (req, res) => {
    if (!gate(req, res)) return;
    const condition = getCondition(Number(req.params.id));
    if (!condition) return res.status(404).json({ error: "المتابعة مش موجودة" });
    const items = healthBetween(condition.start_date, condition.end_date);
    try {
      const summary = await doctorReport(condition, items);
      res.json({ condition, summary, timeline: items });
    } catch (err) {
      console.error("doctor report error:", err);
      res.status(500).json({ error: "فشل توليد التقرير" });
    }
  });

  // ===== الحذف =====
  app.delete("/api/entries/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteEntry(Number(req.params.id)) });
  });
  app.delete("/api/finance/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteFinance(Number(req.params.id)) });
  });
  app.delete("/api/health/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteHealth(Number(req.params.id)) });
  });
  app.delete("/api/goals/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteGoal(Number(req.params.id)) });
  });
  app.delete("/api/conversations/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteConversation(Number(req.params.id)) });
  });
  app.delete("/api/conditions/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteCondition(Number(req.params.id)) });
  });
  app.delete("/api/meals/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteMeal(Number(req.params.id)) });
  });
  app.delete("/api/habits/:id", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: deleteHabit(Number(req.params.id)) });
  });

  // إقفال متابعة (خلصت/مش محتاجها)
  app.put("/api/conditions/:id/close", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ ok: closeCondition(Number(req.params.id)) });
  });

  // ===== ماليات: إضافة يدوية من الداشبورد =====
  app.post("/api/finance", (req, res) => {
    if (!gate(req, res)) return;
    const { entryDate, direction, amount, currency, note } = req.body || {};
    if (amount == null || amount === "" || isNaN(Number(amount)))
      return res.status(400).json({ error: "المبلغ مطلوب" });
    const id = addFinance({
      entryDate: entryDate || new Date().toISOString().slice(0, 10),
      direction,
      amount,
      currency,
      note,
    });
    res.json({ ok: true, id });
  });

  // ===== عادات: إنشاء/تسجيل/إلغاء تسجيل من الداشبورد =====
  app.post("/api/habits", (req, res) => {
    if (!gate(req, res)) return;
    const { title, kind, emoji, note } = req.body || {};
    if (!title) return res.status(400).json({ error: "اسم العادة مطلوب" });
    const habit = addHabit({ title, kind, emoji, note });
    res.json({ ok: true, habit });
  });
  app.post("/api/habits/:id/log", (req, res) => {
    if (!gate(req, res)) return;
    const { date } = req.body || {};
    res.json({ ok: true, ...logHabit(Number(req.params.id), date) });
  });
  app.delete("/api/habits/:id/log", (req, res) => {
    if (!gate(req, res)) return;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    res.json({ ok: unlogHabit(Number(req.params.id), date) });
  });

  // ===== أهداف: إنشاء/تعديل يدوي من الداشبورد =====
  app.post("/api/goals", (req, res) => {
    if (!gate(req, res)) return;
    const { title, target, unit, note } = req.body || {};
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const g = applyGoal({
      title,
      target: target != null && target !== "" ? Number(target) : null,
      unit: unit || null,
      note: note || null,
    });
    res.json({ ok: true, goal: g });
  });
  app.put("/api/goals/:id/current", (req, res) => {
    if (!gate(req, res)) return;
    const { current } = req.body || {};
    res.json({ ok: setGoalCurrent(Number(req.params.id), Number(current) || 0) });
  });

  app.listen(config.port, () =>
    console.log(`📊 الداشبورد شغّال على http://localhost:${config.port}`)
  );
}
