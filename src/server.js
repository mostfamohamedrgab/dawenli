import express from "express";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { config } from "./config.js";
import {
  getUserById,
  getUserByEmail,
  createEmailUser,
  localToday,
  listEntries,
  entriesSince,
  deleteEntry,
  listFinance,
  addFinance,
  deleteFinance,
  FINANCE_CATEGORIES,
  listHealth,
  addHealth,
  deleteHealth,
  listGoals,
  applyGoal,
  deleteGoal,
  setGoalCurrent,
  goalLog,
  deleteGoalLog,
  listConversations,
  deleteConversation,
  listConditions,
  getCondition,
  closeCondition,
  deleteCondition,
  healthBetween,
  listMeals,
  deleteMeal,
  listHabits,
  addHabit,
  logHabit,
  unlogHabit,
  deleteHabit,
  addTask,
  listTasks,
  completeTask,
  reopenTask,
  deleteTask,
  aiUsageSummary,
  listProfileFacts,
  upsertProfileFact,
  deleteProfileFact,
  getAdminByUsername,
  getAdminById,
  countAdmins,
  createAdmin,
  touchAdminLogin,
  listUsersWithStats,
  platformStats,
  savePushSubscription,
  deletePushSubscription,
  listNotifications,
  unreadNotificationCount,
  markNotificationsRead,
  addIdea,
  listIdeas,
  setIdeaStatus,
  deleteIdea,
  addThought,
  listThoughts,
  deleteThought,
  addProblem,
  listProblems,
  setProblemStatus,
  deleteProblem,
  entriesBetween,
  addFile,
  listFiles,
  getFile,
  deleteFile,
  updateFinance,
  updateHealth,
  updateEntry,
  updateTaskFields,
  updateMeal,
  updateGoalMeta,
  updateIdeaFields,
  updateProblemFields,
  updateHabitFields,
  getFinanceBudget,
  setFinanceBudget,
  addAskMessage,
  listAskMessages,
  clearAskMessages,
} from "./db.js";
import { pushEnabled, vapidPublicKey, sendPushToUser, notifyUser } from "./push.js";
import { analyzeEntries, doctorReport, unifiedReport, transcribe, PRICING, chatAboutJournal, classifyImage, textToSpeech } from "./openai.js";
import { buildReportData } from "./report.js";
import { runAgent } from "./agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const uploadsDir = join(__dirname, "..", "data", "uploads"); // ملفات المستخدمين المرفوعة

/* ===================== الجلسات ===================== */

const SESSION_TTL = 30 * 86400 * 1000;
const sessions = new Map(); // token -> { userId, expiresAt }

function newSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL });
  return token;
}

function sessionUser(req) {
  const token = parseCookies(req).dawenli_session;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return getUserById(s.userId);
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

/* ===================== جلسات الأدمن (منفصلة تمامًا عن المستخدمين) ===================== */

const adminSessions = new Map(); // token -> { adminId, expiresAt }

function newAdminSession(adminId) {
  const token = crypto.randomBytes(24).toString("hex");
  adminSessions.set(token, { adminId, expiresAt: Date.now() + SESSION_TTL });
  return token;
}
function sessionAdmin(req) {
  const token = parseCookies(req).dawenli_admin;
  if (!token) return null;
  const s = adminSessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  return getAdminById(s.adminId);
}

/* ===================== كلمات السر (scrypt — من غير مكتبات) ===================== */

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(":");
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      crypto.scryptSync(String(pw), salt, 64)
    );
  } catch {
    return false;
  }
}

/* ===================== السيرفر ===================== */

/* ===================== Rate limiting (in-memory, per-IP) ===================== */
// نافذة ثابتة بسيطة — تكفي لمنع تخمين كلمات السر من غير مكتبات.
const rlBuckets = new Map(); // key -> { count, resetAt }
function rateLimit({ bucket, max, windowMs }) {
  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "?").trim();
    const key = `${bucket}:${ip}`;
    const nowMs = Date.now();
    let entry = rlBuckets.get(key);
    if (!entry || nowMs > entry.resetAt) {
      entry = { count: 0, resetAt: nowMs + windowMs };
      rlBuckets.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      const sec = Math.ceil((entry.resetAt - nowMs) / 1000);
      res.setHeader("Retry-After", String(sec));
      return res.status(429).json({ error: `محاولات كتير — استنى ${sec} ثانية وجرّب تاني` });
    }
    next();
  };
}
// تنظيف دوري للذاكرة
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of rlBuckets) if (t > v.resetAt) rlBuckets.delete(k);
}, 10 * 60 * 1000).unref?.();

const loginLimiter = rateLimit({ bucket: "login", max: 8, windowMs: 10 * 60 * 1000 }); // 8 / 10د
const voiceLimiter = rateLimit({ bucket: "voice", max: 40, windowMs: 10 * 60 * 1000 });
const uploadLimiter = rateLimit({ bucket: "upload", max: 30, windowMs: 10 * 60 * 1000 });
// أنواع مسموح برفعها — صور نقطية + PDF بس. **مرفوض SVG** (ممكن يحمل سكربت = XSS).
const ALLOWED_UPLOAD = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf",
]);

// باني سياق "اسأل دوّنلي" حسب النطاق المختار — مستخدم في الشات النصي والصوتي.
function buildAskContext(userId, scope, date, from, to) {
  const journalCtx = (rows) =>
    rows.map((e) => `📅 ${e.entry_date}${e.mood ? ` (${e.mood})` : ""}: ${e.transcript || e.summary || ""}`).join("\n\n");
  switch (scope) {
    case "day": return journalCtx(entriesBetween(userId, date, date));
    case "range": return journalCtx(entriesBetween(userId, from, to));
    case "finance":
      return listFinance(userId, 500).map((f) => `📅 ${f.entry_date} ${f.direction === "income" ? "دخل" : "صرف"} ${f.amount} ${f.currency || "جنيه"}${f.category ? " · " + f.category : ""}${f.note ? " · " + f.note : ""}`).join("\n");
    case "health":
      return listHealth(userId, 500).map((h) => `📅 ${h.entry_date} [${h.category}] ${h.detail}${h.body_region && h.body_region !== "عام" ? " (" + h.body_region + ")" : ""}`).join("\n");
    case "mental":
      return listHealth(userId, 500).filter((h) => h.category === "نفسية").map((h) => `📅 ${h.entry_date}: ${h.detail}`).join("\n");
    case "goals":
      return listGoals(userId).map((g) => `🎯 ${g.title}: ${g.current}${g.target ? " / " + g.target : ""}${g.unit ? " " + g.unit : ""}`).join("\n");
    case "habits":
      return listHabits(userId).map((h) => `🔁 ${h.title} (${h.kind === "quit" ? "بيبطّلها" : "بيعملها"}) — ستريك ${h.streak}، اتعملت ${h.total} مرة`).join("\n");
    case "tasks":
      return listTasks(userId, "0000-01-01", "9999-12-31").map((t) => `📌 ${t.due_date}${t.due_time ? " " + t.due_time : ""} — ${t.title} [${t.status === "done" ? "اتعملت" : "لسه"}]`).join("\n");
    case "meals":
      return listMeals(userId, 500).map((m) => `🍽️ ${m.entry_date}${m.at_time ? " " + m.at_time : ""}: ${m.items}${m.note ? " · " + m.note : ""}`).join("\n");
    case "ideas":
      return listIdeas(userId).map((i) => `💡 ${i.title}${i.detail ? " — " + i.detail : ""} [${i.status}]`).join("\n");
    case "problems":
      return listProblems(userId).map((p) => `🧩 ${p.title}${p.detail ? " — " + p.detail : ""} [${p.area || "-"}/${p.status}]`).join("\n");
    default:
      return journalCtx(listEntries(userId, 500));
  }
}

export function startServer() {
  const app = express();
  app.disable("x-powered-by");

  // هيدرات أمان أساسية على كل الردود
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "microphone=(self), camera=()");
    next();
  });

  // CORS للـ API — عشان تطبيق الموبايل (Capacitor/أصول native) يقدر ينادي الـ APIs بالكوكيز.
  // أصول معروفة بس (allowlist) — آمن. الويب نفسه same-origin فمش محتاج ده.
  const APP_ORIGINS = new Set([
    "capacitor://localhost", "ionic://localhost",
    "http://localhost", "https://localhost",
    "https://dawenli.com", "https://www.dawenli.com",
  ]);
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && APP_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
  });

  // JSON صغيرة للـ API العادي؛ الصوت ليه parser منفصل (raw) في endpoint بتاعه
  app.use(express.json({ limit: "64kb" }));

  function openSession(res, userId, remember) {
    const token = newSession(userId);
    const maxAge = remember === false ? "" : `; Max-Age=${30 * 86400}`;
    res.setHeader(
      "Set-Cookie",
      `dawenli_session=${token}; HttpOnly; SameSite=Strict; Path=/${maxAge}`
    );
  }

  // bootstrap: أول أدمن من DASHBOARD_PASSWORD (يوزر: admin) لو مفيش أدمنز
  if (countAdmins() === 0 && config.dashboardPassword) {
    createAdmin({ username: "admin", passwordHash: hashPassword(config.dashboardPassword) });
    console.log("👤 اتعمل أدمن افتراضي: admin (الباسورد = DASHBOARD_PASSWORD) — غيّره بعد أول دخول");
  }

  function openAdminSession(res, adminId, remember) {
    const token = newAdminSession(adminId);
    const maxAge = remember === false ? "" : `; Max-Age=${30 * 86400}`;
    res.setHeader("Set-Cookie", `dawenli_admin=${token}; HttpOnly; SameSite=Strict; Path=/${maxAge}`);
  }

  // دخول المستخدمين: إيميل + باسورد (مفيش أدمن هنا)
  app.post("/api/login", loginLimiter, (req, res) => {
    const { email, password, remember } = req.body || {};
    let userId = null;
    if (email && password) {
      const user = getUserByEmail(email);
      if (user?.password_hash && verifyPassword(password, user.password_hash)) userId = user.id;
    }
    if (!userId) return res.status(401).json({ ok: false, error: "بيانات الدخول غلط" });
    openSession(res, userId, remember);
    return res.json({ ok: true });
  });

  /* ===== دخول الأدمن (منفصل) ===== */
  app.post("/api/admin/login", loginLimiter, (req, res) => {
    const { username, password, remember } = req.body || {};
    const admin = getAdminByUsername(username);
    if (!admin || !verifyPassword(password || "", admin.password_hash)) {
      return res.status(401).json({ ok: false, error: "اسم المستخدم أو كلمة السر غلط" });
    }
    touchAdminLogin(admin.id);
    openAdminSession(res, admin.id, remember);
    return res.json({ ok: true });
  });
  app.post("/api/admin/logout", (req, res) => {
    adminSessions.delete(parseCookies(req).dawenli_admin);
    res.setHeader("Set-Cookie", "dawenli_admin=; HttpOnly; Path=/; Max-Age=0");
    res.json({ ok: true });
  });

  // حساب جديد بالإيميل
  app.post("/api/signup", loginLimiter, (req, res) => {
    const { name, email, password } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail))
      return res.status(400).json({ ok: false, error: "اكتب إيميل صحيح" });
    if (!password || String(password).length < 6)
      return res.status(400).json({ ok: false, error: "كلمة السر لازم ٦ حروف على الأقل" });
    const user = createEmailUser({
      name: String(name || "").trim() || null,
      email: cleanEmail,
      passwordHash: hashPassword(password),
    });
    if (!user) return res.status(409).json({ ok: false, error: "الإيميل ده متسجّل قبل كده — ادخل عادي" });
    openSession(res, user.id, true);
    return res.json({ ok: true });
  });

  app.post("/api/logout", (req, res) => {
    sessions.delete(parseCookies(req).dawenli_session);
    res.setHeader("Set-Cookie", "dawenli_session=; HttpOnly; Path=/; Max-Age=0");
    res.json({ ok: true });
  });

  // أصول عامة (مفيهاش بيانات حسّاسة)
  app.get("/style.css", (_req, res) => res.sendFile(join(publicDir, "style.css")));
  app.get("/login.js", (_req, res) => res.sendFile(join(publicDir, "login.js")));
  app.use("/assets", express.static(join(publicDir, "assets")));

  // PWA — الـ manifest و الـ service worker لازم يتقدّموا من الجذر (scope = "/")
  app.get("/manifest.webmanifest", (_req, res) => {
    res.type("application/manifest+json");
    res.sendFile(join(publicDir, "manifest.webmanifest"));
  });
  app.get("/sw.js", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.type("application/javascript");
    res.sendFile(join(publicDir, "sw.js"));
  });

  app.get(["/login", "/login.html"], (req, res) => {
    if (sessionUser(req)) return res.redirect("/");
    res.sendFile(join(publicDir, "login.html"));
  });

  app.get(["/landing", "/landing.html", "/welcome"], (req, res) => {
    // اللي مسجّل دخول مايشوفش صفحة الهبوط — يروح الداشبورد على طول
    if (sessionUser(req)) return res.redirect("/");
    res.sendFile(join(publicDir, "landing.html"));
  });

  // محمي: السكربت والصفحة والبيانات
  app.get("/app.js", (req, res) =>
    sessionUser(req) ? res.sendFile(join(publicDir, "app.js")) : res.status(401).end()
  );

  app.get("/", (req, res) => {
    // الزائر الجديد يشوف صفحة الهبوط (وفيها «نزّل التطبيق») أول حاجة؛ المسجّل يدخل الداشبورد.
    if (!sessionUser(req)) return res.redirect("/landing");
    res.sendFile(join(publicDir, "index.html"));
  });

  /* ===== صفحات الأدمن ===== */
  app.get(["/admin/login", "/admin-login.html"], (req, res) => {
    if (sessionAdmin(req)) return res.redirect("/admin");
    res.sendFile(join(publicDir, "admin-login.html"));
  });
  app.get("/admin.js", (req, res) =>
    sessionAdmin(req) ? res.sendFile(join(publicDir, "admin.js")) : res.status(401).end()
  );
  app.get(["/admin", "/admin.html"], (req, res) => {
    if (!sessionAdmin(req)) return res.redirect("/admin/login");
    res.sendFile(join(publicDir, "admin.html"));
  });

  // gate: بيرجّع المستخدم بتاع الجلسة أو بيقفل الطلب
  const gate = (req, res) => {
    const user = sessionUser(req);
    if (!user) {
      res.status(401).json({ error: "غير مصرّح" });
      return null;
    }
    return user;
  };

  // adminGate: للـ endpoints الخاصة بلوحة الأدمن
  const adminGate = (req, res) => {
    const admin = sessionAdmin(req);
    if (!admin) {
      res.status(401).json({ error: "غير مصرّح" });
      return null;
    }
    return admin;
  };

  /* ===== API الأدمن ===== */
  app.get("/api/admin/me", (req, res) => {
    const admin = adminGate(req, res);
    if (!admin) return;
    res.json({ username: admin.username, lastLogin: admin.last_login });
  });
  app.get("/api/admin/overview", (req, res) => {
    const admin = adminGate(req, res);
    if (!admin) return;
    res.json({
      stats: platformStats(),
      users: listUsersWithStats(),
      usage: aiUsageSummary(30),
      pricing: PRICING,
    });
  });
  // تفاصيل مستخدم واحد (قراءة فقط للمراقبة)
  app.get("/api/admin/users/:id", (req, res) => {
    const admin = adminGate(req, res);
    if (!admin) return;
    const uid = Number(req.params.id);
    const u = getUserById(uid);
    if (!u) return res.status(404).json({ error: "المستخدم مش موجود" });
    res.json({
      user: { id: u.id, name: u.name, email: u.email, last_seen: u.last_seen, created_at: u.created_at, is_owner: !!u.is_owner },
      entries: listEntries(uid, 30),
      finance: listFinance(uid, 50),
      health: listHealth(uid, 50),
      goals: listGoals(uid),
      habits: listHabits(uid),
      tasks: listTasks(uid, "0000-01-01", "9999-12-31"),
      profile: listProfileFacts(uid),
    });
  });

  app.get("/api/me", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({
      id: user.id,
      name: user.name,
      isOwner: !!user.is_owner,
      today: localToday(),
    });
  });

  /* ===== إشعارات PWA (Web Push) ===== */
  // مفتاح VAPID العام — العميل بيستخدمه عشان يعمل subscribe
  app.get("/api/push/key", (req, res) => {
    if (!gate(req, res)) return;
    res.json({ enabled: pushEnabled, key: pushEnabled ? vapidPublicKey : null });
  });
  // تسجيل اشتراك جهاز
  app.post("/api/push/subscribe", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    if (!pushEnabled) return res.status(503).json({ error: "push_disabled" });
    const ok = savePushSubscription(user.id, req.body);
    if (!ok) return res.status(400).json({ error: "bad_subscription" });
    res.json({ ok: true });
  });
  // إلغاء اشتراك جهاز
  app.post("/api/push/unsubscribe", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    deletePushSubscription(req.body?.endpoint);
    res.json({ ok: true });
  });
  // إشعار تجريبي للمستخدم الحالي (بيتخزّن في الجرس كمان)
  app.post("/api/push/test", async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const sent = await notifyUser(user.id, {
      title: "دوّنلي ✍️",
      body: "التنبيهات شغّالة! هفكّرك تدوّن يومك كل يوم.",
      url: "/",
      icon: "🔔",
    });
    res.json({ ok: true, sent });
  });

  /* ===== إشعارات داخل التطبيق (الجرس) ===== */
  app.get("/api/notifications", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({
      items: listNotifications(user.id, 30),
      unread: unreadNotificationCount(user.id),
    });
  });
  app.post("/api/notifications/read", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    markNotificationsRead(user.id, req.body?.id || null);
    res.json({ ok: true, unread: unreadNotificationCount(user.id) });
  });

  /* ===== الأقسام ===== */
  app.get("/api/entries", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listEntries(user.id, 500));
  });
  app.get("/api/finance", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listFinance(user.id, 500));
  });
  app.get("/api/health", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listHealth(user.id, 500));
  });
  app.get("/api/goals", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listGoals(user.id));
  });
  app.get("/api/conversations", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listConversations(user.id, 500));
  });
  app.get("/api/conditions", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listConditions(user.id));
  });
  app.get("/api/meals", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listMeals(user.id, 500));
  });
  app.get("/api/habits", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listHabits(user.id));
  });

  /* ===== الذاكرة الدائمة (دوّنلي يعرف عنك) ===== */
  app.get("/api/profile", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listProfileFacts(user.id));
  });
  app.post("/api/profile", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { category, key, value } = req.body || {};
    if (!key || !value) return res.status(400).json({ error: "المفتاح والقيمة مطلوبين" });
    res.json({ ok: true, fact: upsertProfileFact({ userId: user.id, category, key, value }) });
  });
  app.delete("/api/profile/:id", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: deleteProfileFact(user.id, Number(req.params.id)) });
  });

  /* ===== المهام والتقويم ===== */
  app.get("/api/tasks", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const from = String(req.query.from || "0000-01-01");
    const to = String(req.query.to || "9999-12-31");
    res.json(listTasks(user.id, from, to));
  });
  app.post("/api/tasks", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { title, dueDate, dueTime, note } = req.body || {};
    if (!title || !dueDate) return res.status(400).json({ error: "العنوان والتاريخ مطلوبين" });
    res.json({ ok: true, task: addTask({ userId: user.id, title, dueDate, dueTime, note }) });
  });
  app.put("/api/tasks/:id/done", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: !!completeTask(user.id, { id: Number(req.params.id) }) });
  });
  app.put("/api/tasks/:id/reopen", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: reopenTask(user.id, Number(req.params.id)) });
  });
  app.delete("/api/tasks/:id", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: deleteTask(user.id, Number(req.params.id)) });
  });

  /* ===== الأفكار (دماغك) ===== */
  app.get("/api/ideas", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listIdeas(user.id));
  });
  app.post("/api/ideas", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { title, detail } = req.body || {};
    if (!title) return res.status(400).json({ error: "اكتب الفكرة" });
    res.json({ ok: true, idea: addIdea({ userId: user.id, title, detail }) });
  });
  app.put("/api/ideas/:id/status", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: setIdeaStatus(user.id, Number(req.params.id), String(req.body?.status || "")) });
  });

  /* ===== المشاكل (قلبك) ===== */
  app.get("/api/problems", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listProblems(user.id));
  });
  app.post("/api/problems", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { title, detail, area } = req.body || {};
    if (!title) return res.status(400).json({ error: "اكتب المشكلة" });
    res.json({ ok: true, problem: addProblem({ userId: user.id, title, detail, area }) });
  });
  app.put("/api/problems/:id/status", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: setProblemStatus(user.id, Number(req.params.id), String(req.body?.status || ""), req.body?.note) });
  });

  /* ===== اسأل دوّنلي (شات سياقي عن اليوميات — بيحافظ على الـ context) ===== */
  app.post("/api/ask", async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { messages, scope, date, from, to } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: "اكتب رسالة" });
    // ناخد آخر ٢٠ رسالة بس (user/assistant) للحفاظ على التوكنز — الـ context مستمر
    const clean = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
    if (!clean.length) return res.status(400).json({ error: "اكتب رسالة" });
    const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
    if ((scope === "day" && !dateOk(date)) || (scope === "range" && !(dateOk(from) && dateOk(to))))
      return res.status(400).json({ error: "اختار تاريخ صحيح الأول" });
    const contextText = buildAskContext(user.id, scope, date, from, to);
    try {
      const reply = await chatAboutJournal({ messages: clean, contextText, userId: user.id });
      // نحفظ الرسالة الجديدة + الرد عشان المحادثة تفضل موجودة بعد الريلود
      const lastUser = [...clean].reverse().find((m) => m.role === "user");
      if (lastUser) addAskMessage(user.id, "user", lastUser.content);
      addAskMessage(user.id, "assistant", reply);
      res.json({ reply });
    } catch (err) {
      console.error("ask error:", err);
      res.status(500).json({ error: "حصل خطأ، جرّب تاني" });
    }
  });
  // تاريخ محادثة اسأل دوّنلي (محفوظ)
  app.get("/api/ask/history", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listAskMessages(user.id, 200));
  });
  app.delete("/api/ask/history", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    clearAskMessages(user.id);
    res.json({ ok: true });
  });

  // اسأل دوّنلي بالصوت: نفرّغ الصوت ونرد ونحفظ المحادثة
  app.post(
    "/api/ask/voice",
    voiceLimiter,
    express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
    async (req, res) => {
      const user = gate(req, res);
      if (!user) return;
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: "مفيش صوت" });
      const scope = String(req.query.scope || "all");
      const date = String(req.query.date || "");
      if (scope === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "اختار تاريخ صحيح الأول" });
      const ext = String(req.headers["content-type"] || "").includes("ogg") ? "ogg" : "webm";
      try {
        const transcript = await transcribe(buf, `ask.${ext}`, user.id);
        if (!transcript) return res.status(422).json({ error: "مقدرتش أفهم الصوت، جرّب تاني" });
        const contextText = buildAskContext(user.id, scope, date);
        const messages = [...listAskMessages(user.id, 20), { role: "user", content: transcript }];
        const reply = await chatAboutJournal({ messages, contextText, userId: user.id });
        addAskMessage(user.id, "user", transcript);
        addAskMessage(user.id, "assistant", reply);
        res.json({ transcript, reply });
      } catch (err) {
        console.error("ask voice error:", err);
        res.status(500).json({ error: "حصل خطأ في معالجة الصوت، جرّب تاني" });
      }
    }
  );

  // تحويل رد لصوت (TTS) — للرد الصوتي في الشات
  app.post("/api/tts", voiceLimiter, async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "مفيش نص" });
    try {
      const buf = await textToSpeech(text, user.id);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(buf);
    } catch (err) {
      console.error("tts error:", err);
      res.status(500).json({ error: "فشل تحويل النص لصوت" });
    }
  });

  /* ===== مركز الملفات: رفع (raw) + تصنيف بالرؤية + عرض ===== */
  app.post(
    "/api/files",
    uploadLimiter,
    express.raw({ type: ["image/*", "application/pdf"], limit: "12mb" }),
    async (req, res) => {
      const user = gate(req, res);
      if (!user) return;
      const mime = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_UPLOAD.has(mime))
        return res.status(415).json({ error: "النوع ده مش مدعوم — ارفع صورة (PNG/JPG/WEBP) أو PDF" });
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: "مفيش ملف" });
      let rawName;
      try { rawName = decodeURIComponent(String(req.query.name || "ملف")); }
      catch { rawName = "ملف"; }
      const safeName = rawName.replace(/[^\w.\-؀-ۿ ]/g, "_").slice(0, 120) || "ملف";
      const userDir = join(uploadsDir, String(user.id));
      let fullPath = null;
      try {
        mkdirSync(userDir, { recursive: true });
        fullPath = join(userDir, `${Date.now()}-${safeName}`);
        writeFileSync(fullPath, buf);
        let category = mime === "application/pdf" ? "مستند" : "أخرى";
        let description = "";
        if (mime.startsWith("image/")) {
          try {
            const c = await classifyImage({ base64: buf.toString("base64"), mime, userId: user.id });
            category = c.category;
            description = c.description;
          } catch (e) {
            console.error("classify error:", e);
          }
        }
        const file = addFile({ userId: user.id, filename: safeName, mime, size: buf.length, category, description, path: fullPath });
        res.json({ ok: true, file });
      } catch (err) {
        if (fullPath) { try { unlinkSync(fullPath); } catch {} } // منسيبش ملف يتيم من غير صف
        console.error("file upload error:", err);
        res.status(500).json({ error: "حصل خطأ في رفع الملف" });
      }
    }
  );
  app.get("/api/files", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listFiles(user.id));
  });
  app.get("/api/files/:id/raw", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const f = getFile(user.id, Number(req.params.id));
    if (!f || !f.path || !f.path.startsWith(uploadsDir)) return res.status(404).end();
    res.setHeader("Content-Type", f.mime || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // sandbox + default-src none: حتى لو اترفع ملف خبيث، مايشتغلش أي سكربت في الأصل.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.sendFile(f.path);
  });
  app.delete("/api/files/:id", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const f = getFile(user.id, Number(req.params.id));
    if (f?.path) { try { unlinkSync(f.path); } catch {} }
    res.json({ ok: deleteFile(user.id, Number(req.params.id)) });
  });

  /* ===== تعديل أي عنصر (مرونة التعديل) — PUT /api/<نوع>/:id ===== */
  const updaters = {
    finance: updateFinance,
    health: updateHealth,
    entries: updateEntry,
    tasks: updateTaskFields,
    meals: updateMeal,
    goals: updateGoalMeta,
    ideas: updateIdeaFields,
    problems: updateProblemFields,
    habits: updateHabitFields,
  };
  for (const [kind, fn] of Object.entries(updaters)) {
    app.put(`/api/${kind}/:id`, (req, res) => {
      const user = gate(req, res);
      if (!user) return;
      res.json({ ok: fn(user.id, Number(req.params.id), req.body || {}) });
    });
  }

  // الكومبوزر في الداشبورد: "رتّبهالي" — بيشغّل الـ agent على النص
  app.post("/api/log", async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "اكتب حاجة الأول" });
    try {
      const { reply, receipts } = await runAgent({ user, text, kind: "dashboard" });
      res.json({ reply, receipts });
    } catch (err) {
      console.error("dashboard log error:", err);
      res.status(500).json({ error: "حصل خطأ أثناء المعالجة، جرّب تاني" });
    }
  });

  // تسجيل صوت من الداشبورد: المتصفح بيبعت الصوت (webm/ogg) كـ raw body،
  // بنفرّغه بـ whisper وبنمرره لنفس الـ agent ونرجّع التفريغ + الرد + الإيصالات.
  app.post(
    "/api/voice",
    voiceLimiter,
    express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
    async (req, res) => {
      const user = gate(req, res);
      if (!user) return;
      const buf = req.body;
      if (!buf || !buf.length) return res.status(400).json({ error: "مفيش صوت" });
      const ext = (req.headers["content-type"] || "").includes("ogg") ? "ogg" : "webm";
      try {
        const transcript = await transcribe(buf, `voice.${ext}`, user.id);
        if (!transcript) return res.status(422).json({ error: "مقدرتش أفهم الصوت، جرّب تاني" });
        const { reply, receipts } = await runAgent({ user, text: transcript, kind: "voice" });
        res.json({ transcript, reply, receipts });
      } catch (err) {
        console.error("dashboard voice error:", err);
        res.status(500).json({ error: "حصل خطأ أثناء معالجة الصوت، جرّب تاني" });
      }
    }
  );

  /* ===== خواطر / عصف ذهني ===== */
  app.get("/api/thoughts", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(listThoughts(user.id));
  });
  app.post("/api/thoughts", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const t = addThought(user.id, (req.body || {}).text, "text");
    if (!t) return res.status(400).json({ error: "اكتب خاطرة الأول" });
    res.json({ ok: true, thought: t });
  });
  app.delete("/api/thoughts/:id", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: deleteThought(user.id, Number(req.params.id)) });
  });
  app.post(
    "/api/thoughts/voice",
    voiceLimiter,
    express.raw({ type: ["audio/*", "application/octet-stream"], limit: "25mb" }),
    async (req, res) => {
      const user = gate(req, res);
      if (!user) return;
      const buf = req.body;
      if (!buf || !buf.length) return res.status(400).json({ error: "مفيش صوت" });
      const ext = (req.headers["content-type"] || "").includes("ogg") ? "ogg" : "webm";
      try {
        const transcript = await transcribe(buf, `thought.${ext}`, user.id);
        if (!transcript) return res.status(422).json({ error: "مقدرتش أفهم الصوت، جرّب تاني" });
        const thought = addThought(user.id, transcript, "voice");
        res.json({ transcript, thought });
      } catch (err) {
        console.error("thought voice error:", err);
        res.status(500).json({ error: "حصل خطأ أثناء معالجة الصوت، جرّب تاني" });
      }
    }
  );

  /* ===== التحليل والتقارير ===== */
  app.get("/api/analyze", async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : 7;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const entries = entriesSince(user.id, since);
    if (!entries.length) return res.json({ analysis: "مفيش تدوينات في الفترة دي." });
    try {
      const analysis = await analyzeEntries(entries, user.id);
      res.json({ analysis });
    } catch (err) {
      console.error("analyze error:", err);
      res.status(500).json({ error: "فشل التحليل" });
    }
  });

  // التقرير الشامل الواحد — من كل كلام المستخدم في الفترة
  app.get("/api/report", async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : 30;
    try {
      const data = buildReportData(user.id, days);
      const report = await unifiedReport(data, user.id);
      res.json({ report, data });
    } catch (err) {
      console.error("report error:", err);
      res.status(500).json({ error: "فشل توليد التقرير" });
    }
  });

  // تقرير للدكتور: تلخيص AI + خط زمني للأعراض في فترة المتابعة
  app.get("/api/conditions/:id/report", async (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const condition = getCondition(user.id, Number(req.params.id));
    if (!condition) return res.status(404).json({ error: "المتابعة مش موجودة" });
    const items = healthBetween(user.id, condition.start_date, condition.end_date);
    try {
      const summary = await doctorReport(condition, items, user.id);
      res.json({ condition, summary, timeline: items });
    } catch (err) {
      console.error("doctor report error:", err);
      res.status(500).json({ error: "فشل توليد التقرير" });
    }
  });

  /* ===== الحذف ===== */
  const deleters = {
    entries: deleteEntry,
    finance: deleteFinance,
    health: deleteHealth,
    goals: deleteGoal,
    conversations: deleteConversation,
    conditions: deleteCondition,
    meals: deleteMeal,
    habits: deleteHabit,
    ideas: deleteIdea,
    problems: deleteProblem,
  };
  for (const [kind, fn] of Object.entries(deleters)) {
    app.delete(`/api/${kind}/:id`, (req, res) => {
      const user = gate(req, res);
      if (!user) return;
      res.json({ ok: fn(user.id, Number(req.params.id)) });
    });
  }

  // إقفال متابعة (خلصت/مش محتاجها)
  app.put("/api/conditions/:id/close", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: closeCondition(user.id, Number(req.params.id)) });
  });

  /* ===== ماليات: إضافة يدوية من الداشبورد ===== */
  app.get("/api/finance-categories", (req, res) => {
    if (!gate(req, res)) return;
    res.json(FINANCE_CATEGORIES);
  });

  /* ===== ميزانية وهدف الشهر ===== */
  app.get("/api/finance-budget", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || "")) ? req.query.month : localToday().slice(0, 7);
    res.json(getFinanceBudget(user.id, month));
  });
  app.put("/api/finance-budget", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { month, budget, goal } = req.body || {};
    const m = /^\d{4}-\d{2}$/.test(String(month || "")) ? month : localToday().slice(0, 7);
    res.json({ ok: true, budget: setFinanceBudget(user.id, m, { budget, goal }) });
  });
  app.post("/api/finance", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { entryDate, direction, amount, currency, category, note } = req.body || {};
    if (amount == null || amount === "" || isNaN(Number(amount)))
      return res.status(400).json({ error: "المبلغ مطلوب" });
    const id = addFinance({
      userId: user.id,
      entryDate: entryDate || localToday(),
      direction,
      amount,
      currency,
      category,
      note,
    });
    res.json({ ok: true, id });
  });

  /* ===== صحة: إضافة يدوية ===== */
  app.post("/api/health", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { entryDate, category, detail, bodyRegion } = req.body || {};
    if (!detail) return res.status(400).json({ error: "الوصف مطلوب" });
    const id = addHealth({ userId: user.id, entryDate, category, detail, bodyRegion });
    res.json({ ok: true, id });
  });

  /* ===== عادات: إنشاء/تسجيل/إلغاء تسجيل من الداشبورد ===== */
  app.post("/api/habits", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { title, kind, emoji, note } = req.body || {};
    if (!title) return res.status(400).json({ error: "اسم العادة مطلوب" });
    const habit = addHabit({ userId: user.id, title, kind, emoji, note });
    res.json({ ok: true, habit });
  });
  app.post("/api/habits/:id/log", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { date } = req.body || {};
    res.json({ ok: true, ...logHabit(Number(req.params.id), date) });
  });
  app.delete("/api/habits/:id/log", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const date = req.query.date || localToday();
    res.json({ ok: unlogHabit(Number(req.params.id), date) });
  });

  /* ===== أهداف: إنشاء/تعديل يدوي من الداشبورد ===== */
  app.post("/api/goals", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { title, target, unit, note } = req.body || {};
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const g = applyGoal({
      userId: user.id,
      title,
      target: target != null && target !== "" ? Number(target) : null,
      unit: unit || null,
      note: note || null,
    });
    res.json({ ok: true, goal: g });
  });
  app.put("/api/goals/:id/current", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const { current } = req.body || {};
    res.json({ ok: setGoalCurrent(user.id, Number(req.params.id), Number(current) || 0) });
  });

  // سجل تقدّم الهدف (إمتى زوّدت كام)
  app.get("/api/goals/:id/log", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json(goalLog(user.id, Number(req.params.id)));
  });
  // حذف بند من سجل الهدف (بيطرح الدلتا من رصيد الهدف)
  app.delete("/api/goals/log/:logId", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    res.json({ ok: deleteGoalLog(user.id, Number(req.params.logId)) });
  });

  // معالج أخطاء عام — يرجّع JSON نضيف بدل صفحة HTML أو سوكت معلّق (أخطاء body-parser
  // زي الملف الأكبر من الحد، أو أي throw في middleware).
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err?.status || err?.statusCode || 500;
    if (status >= 500) console.error("unhandled route error:", err?.message || err);
    res.status(status).json({ error: status === 413 ? "الملف كبير جدًا (الحد ١٢ ميجا)" : "حصل خطأ في الخادم" });
  });

  app.listen(config.port, () =>
    console.log(`📊 الداشبورد شغّال على http://localhost:${config.port}`)
  );
}
