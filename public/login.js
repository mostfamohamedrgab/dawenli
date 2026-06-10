const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const tabs = {
  email: document.getElementById("tabEmail"),
  code: document.getElementById("tabCode"),
};
const fields = {
  email: document.getElementById("emailFields"),
  code: document.getElementById("codeField"),
};
const nameField = document.getElementById("nameField");
const modeToggle = document.getElementById("modeToggle");

let mode = "email";
let signup = false; // جوه تاب الإيميل: دخول ولا حساب جديد

function refresh() {
  for (const k of Object.keys(tabs)) {
    tabs[k].classList.toggle("active", k === mode);
    fields[k].hidden = k !== mode;
  }
  nameField.hidden = !(mode === "email" && signup);
  modeToggle.textContent = signup ? "عندك حساب؟ ادخل عادي" : "مفيش حساب؟ اعمل واحد جديد";
  submitBtn.textContent = mode === "email" && signup ? "إنشاء حساب" : "دخول";
  errorEl.hidden = true;
}
for (const k of Object.keys(tabs)) tabs[k].addEventListener("click", () => { mode = k; refresh(); });
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
    let url = "/api/login";
    const body = { remember };
    if (mode === "email") {
      body.email = document.getElementById("email").value.trim();
      body.password = document.getElementById("emailPassword").value;
      if (signup) {
        url = "/api/signup";
        body.name = document.getElementById("name").value.trim();
      }
    } else {
      body.code = document.getElementById("code").value.trim();
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
    errorEl.textContent =
      data.error ||
      (mode === "code" ? "الكود غلط أو خلصت صلاحيته — ابعت /code تاني للبوت" : "بيانات الدخول غلط");
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "حصل خطأ، جرّب تاني";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
});
