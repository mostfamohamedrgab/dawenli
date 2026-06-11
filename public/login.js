const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const nameField = document.getElementById("nameField");
const modeToggle = document.getElementById("modeToggle");

let signup = false; // دخول ولا حساب جديد

function refresh() {
  nameField.hidden = !signup;
  modeToggle.textContent = signup ? "عندك حساب؟ ادخل عادي" : "مفيش حساب؟ اعمل واحد جديد";
  submitBtn.textContent = signup ? "إنشاء حساب" : "دخول";
  errorEl.hidden = true;
}
modeToggle.addEventListener("click", (e) => { e.preventDefault(); signup = !signup; refresh(); });
refresh();

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
