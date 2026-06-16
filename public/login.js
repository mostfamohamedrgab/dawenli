const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const nameField = document.getElementById("nameField");
const authSub = document.getElementById("authSub");
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");

let signup = false; // دخول ولا حساب جديد

function refresh() {
  tabLogin.classList.toggle("active", !signup);
  tabSignup.classList.toggle("active", signup);
  nameField.classList.toggle("show", signup); // collapse ناعم
  submitBtn.textContent = signup ? "إنشاء حساب جديد" : "دخول";
  authSub.textContent = signup
    ? "اعمل حسابك في ثانية وابدأ تدوّن يومك"
    : "أهلاً بيك تاني — سجّل دخولك تكمّل دفترك";
  errorEl.hidden = true;
}
tabLogin.addEventListener("click", () => { signup = false; refresh(); });
tabSignup.addEventListener("click", () => { signup = true; refresh(); });
refresh();

// إظهار/إخفاء كلمة السر
const togglePw = document.getElementById("togglePw");
const pwInput = document.getElementById("emailPassword");
togglePw?.addEventListener("click", () => {
  const show = pwInput.type === "password";
  pwInput.type = show ? "text" : "password";
  togglePw.textContent = show ? "🙈" : "👁️";
  togglePw.setAttribute("aria-pressed", String(show));
  togglePw.setAttribute("aria-label", show ? "إخفاء كلمة السر" : "إظهار كلمة السر");
  pwInput.focus();
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  const original = submitBtn.textContent;
  submitBtn.textContent = "ثواني…";
  try {
    const remember = document.getElementById("remember").checked;
    const body = {
      remember,
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("emailPassword").value,
    };
    let url = "/api/login";
    if (signup) {
      url = "/api/signup";
      body.name = document.getElementById("name").value.trim();
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json().catch(() => ({}));
    errorEl.textContent = data.error || "بيانات الدخول غلط";
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "حصل خطأ، جرّب تاني";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
});
