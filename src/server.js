import express from "express";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
} from "./db.js";
import { pushEnabled, vapidPublicKey, sendPushToUser, notifyUser } from "./push.js";
import { analyzeEntries, doctorReport, unifiedReport, transcribe, PRICING } from "./openai.js";
import { buildReportData } from "./report.js";
import { runAgent } from "./agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

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

/* ===================== أكواد الدخول من البوت ===================== */

const CODE_TTL = 10 * 60 * 1000;
const loginCodes = new Map(); // code -> { userId, expiresAt }

export function issueLoginCode(userId) {
  const code = String(crypto.randomInt(100000, 999999));
  loginCodes.set(code, { userId, expiresAt: Date.now() + CODE_TTL });
  return code;
}

function redeemLoginCode(code) {
  const entry = loginCodes.get(String(code).trim());
  if (!entry) return null;
  loginCodes.delete(String(code).trim());
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
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

/* ===================== توكنات ربط تيليجرام =====================
   المستخدم بيدوس "اربط تيليجرام" في الداشبورد → بنطلّع توكن →
   لينك t.me/البوت?start=التوكن → البوت بيستقبل /start بالتوكن ويربط الشات. */

const LINK_TTL = 15 * 60 * 1000;
const linkTokens = new Map(); // token -> { userId, expiresAt }

function issueLinkToken(userId) {
  const token = "lk" + crypto.randomBytes(8).toString("hex");
  linkTokens.set(token, { userId, expiresAt: Date.now() + LINK_TTL });
  return token;
}
export function redeemLinkToken(token) {
  const entry = linkTokens.get(String(token).trim());
  if (!entry) return null;
  linkTokens.delete(String(token).trim());
  if (Date.now() > entry.expiresAt) return null;
  return entry.userId;
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

  // دخول المستخدمين الموحّد: إيميل+باسورد أو كود من البوت (مفيش أدمن هنا)
  app.post("/api/login", loginLimiter, (req, res) => {
    const { email, password, code, remember } = req.body || {};
    let userId = null;
    if (email && password) {
      const user = getUserByEmail(email);
      if (user?.password_hash && verifyPassword(password, user.password_hash)) userId = user.id;
    } else if (code) {
      userId = redeemLoginCode(code);
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

  // حساب جديد بالإيميل — وبعد الدخول يقدر يربط تيليجرام بزرار
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

  app.get(["/landing", "/landing.html", "/welcome"], (_req, res) =>
    res.sendFile(join(publicDir, "landing.html"))
  );

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
      user: { id: u.id, name: u.name, email: u.email, chat_id: u.chat_id, last_seen: u.last_seen, created_at: u.created_at, is_owner: !!u.is_owner },
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
      hasTelegram: !!user.chat_id,
      today: localToday(),
    });
  });

  // زرار "اربط تيليجرام": بيرجّع لينك يفتح البوت ومعاه توكن الربط
  app.post("/api/link-telegram", (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    if (user.chat_id) return res.json({ ok: true, linked: true });
    const token = issueLinkToken(user.id);
    res.json({ ok: true, linked: false, url: `https://t.me/${config.botUsername}?start=${token}` });
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

  // الكومبوزر في الداشبورد: "رتّبهالي" — نفس الـ agent بتاع البوت
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

  app.listen(config.port, () =>
    console.log(`📊 الداشبورد شغّال على http://localhost:${config.port}`)
  );
}
