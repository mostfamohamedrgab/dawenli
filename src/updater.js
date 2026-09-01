/* ===================== تحديث التطبيق من الجيت =====================
   المشروع مربوط بريبو عام على GitHub. الأدمن بيشوف لو فيه تحديث جديد،
   ويدوس زرار واحد فيسحب الكود ويعمل نسخة احتياطية للداتا ويعيد التشغيل.

   تغييرات الداتا بيز: مفيش migrations منفصلة — db.js بيطبّق بنية الجداول عند كل تشغيل
   (CREATE TABLE IF NOT EXISTS + addColumnIfMissing)، فأي جداول/أعمدة جديدة
   بتتظبط لوحدها بعد إعادة التشغيل، والبيانات القديمة زي ما هي.

   أمان: كل الأوامر بـ execFile بمصفوفة (مفيش shell = مفيش injection)،
   والفرع والريموت ثابتين في الكود — المستخدم مابيبعتش أي حاجة تدخل في أمر. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { config } from "./config.js";

const execFileP = promisify(execFile);
const REPO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REMOTE = "origin";
const BRANCH = "main";

async function git(args, timeout = 60000) {
  const { stdout } = await execFileP("git", ["-C", REPO_DIR, ...args], { timeout, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export function isGitRepo() {
  return existsSync(join(REPO_DIR, ".git"));
}

/* حالة النسخة: الحالية + فيه تحديث ولا لأ + قايمة الجديد */
export async function versionStatus({ checkRemote = true } = {}) {
  if (!isGitRepo()) {
    return { ok: false, error: "المشروع مش متسطّب من جيت — التحديث التلقائي مش متاح هنا" };
  }
  try {
    const [sha, subject, date, branch] = (
      await git(["log", "-1", "--format=%h%n%s%n%cI%n"])
    ).split("\n");
    const currentBranch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])) || BRANCH;
    const dirty = (await git(["status", "--porcelain"])).length > 0;

    let behind = 0, commits = [], remoteError = null;
    if (checkRemote) {
      try {
        await git(["fetch", REMOTE, BRANCH, "--quiet"], 45000);
        const countOut = await git(["rev-list", "--count", `HEAD..${REMOTE}/${BRANCH}`]);
        behind = Number(countOut) || 0;
        if (behind > 0) {
          const log = await git(["log", `HEAD..${REMOTE}/${BRANCH}`, "--format=%h%x1f%s%x1f%cI", "-30"]);
          commits = log
            .split("\n")
            .filter(Boolean)
            .map((l) => {
              const [c, s, d] = l.split("\x1f");
              return { sha: c, subject: s, date: d };
            });
        }
      } catch (e) {
        remoteError = "مقدرتش أوصل للريبو (نت أو صلاحيات) — " + String(e?.message || e).slice(0, 120);
      }
    }
    return {
      ok: true,
      current: { sha, subject, date, branch: currentBranch },
      behind,
      commits,
      dirty, // فيه تعديلات محلية مش متسجّلة — التحديث هيمسحها
      remoteError,
      updateAvailable: behind > 0,
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

/* نسخة احتياطية للداتا بيز قبل أي تحديث */
function backupDb() {
  try {
    const dbPath = config.dbPath?.startsWith("/") ? config.dbPath : join(REPO_DIR, config.dbPath || "./data/dawenli.db");
    if (!existsSync(dbPath)) return null;
    const dir = join(REPO_DIR, "data", "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dest = join(dir, `pre-update-${stamp}.db`);
    copyFileSync(dbPath, dest); // نسخ ملف الـ SQLite (WAL موجود جنبه — كفاية كـ safety net)
    return dest;
  } catch {
    return null;
  }
}

/* اسحب التحديث: باك أب → fetch → reset على الريموت → تسطيب مكتبات لو اتغيّرت */
export async function pullUpdate() {
  if (!isGitRepo()) return { ok: false, error: "المشروع مش متسطّب من جيت" };
  const steps = [];
  try {
    const before = await git(["rev-parse", "HEAD"]);

    const backup = backupDb();
    steps.push(backup ? `📦 نسخة احتياطية للداتا: ${backup.split("/").pop()}` : "⚠️ مقدرتش آخد نسخة احتياطية (كمّلنا)");

    await git(["fetch", REMOTE, BRANCH, "--quiet"], 90000);
    steps.push("⬇️ اتسحب الجديد من الريبو");

    // reset --hard: الملفات المتتبّعة بترجع زي الريموت بالظبط (بيانات data/ مستثناة في .gitignore)
    await git(["reset", "--hard", `${REMOTE}/${BRANCH}`, "--quiet"], 60000);
    const after = await git(["rev-parse", "HEAD"]);
    steps.push(`✅ الكود بقى على ${after.slice(0, 7)}`);

    if (before === after) {
      return { ok: true, changed: false, steps, message: "إنت أصلاً على آخر نسخة — مفيش جديد" };
    }

    // مكتبات جديدة؟ نسطّبها (لو الملف اتغيّر بس — عشان مانضيّعش وقت)
    let depsChanged = false;
    try {
      const diff = await git(["diff", "--name-only", before, after]);
      depsChanged = /(^|\n)(package\.json|package-lock\.json)/.test(diff);
    } catch {}
    if (depsChanged) {
      steps.push("📚 فيه مكتبات جديدة — بنسطّبها…");
      try {
        await execFileP("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
          cwd: REPO_DIR,
          timeout: 240000,
          maxBuffer: 4 * 1024 * 1024,
        });
        steps.push("📚 المكتبات اتسطّبت");
      } catch (e) {
        steps.push("⚠️ تسطيب المكتبات فشل — راجع اللوج: " + String(e?.message || e).slice(0, 120));
      }
    }

    steps.push("🗄️ تغييرات الداتا بيز بتتطبّق تلقائيًا مع إعادة التشغيل");
    const status = await versionStatus({ checkRemote: false });
    return { ok: true, changed: true, steps, from: before.slice(0, 7), to: after.slice(0, 7), current: status.current };
  } catch (e) {
    steps.push("❌ وقف عند: " + String(e?.message || e).slice(0, 200));
    return { ok: false, error: String(e?.message || e).slice(0, 200), steps };
  }
}

/* إعادة التشغيل بعد ما الرد يوصل للمتصفح (pm2 بيقوم بالعملية تاني) */
export function scheduleRestart(delayMs = 1200) {
  setTimeout(() => {
    const name = process.env.PM2_APP_NAME || "dawenli";
    const child = execFile("pm2", ["restart", name], { timeout: 30000 }, (err) => {
      // مفيش pm2؟ نخرج والمشرف (systemd/docker) هيقوّمنا تاني
      if (err) { console.error("pm2 restart فشل، هنخرج والمشرف يقوّمنا:", err.message); process.exit(0); }
    });
    child.unref?.();
  }, delayMs).unref?.();
}
