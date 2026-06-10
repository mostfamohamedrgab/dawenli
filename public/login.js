const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const tabCode = document.getElementById("tabCode");
const tabPassword = document.getElementById("tabPassword");
const codeField = document.getElementById("codeField");
const passwordField = document.getElementById("passwordField");

let mode = "code";
function setMode(m) {
  mode = m;
  tabCode.classList.toggle("active", m === "code");
  tabPassword.classList.toggle("active", m === "password");
  codeField.hidden = m !== "code";
  passwordField.hidden = m !== "password";
  errorEl.hidden = true;
}
tabCode.addEventListener("click", () => setMode("code"));
tabPassword.addEventListener("click", () => setMode("password"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "بيدخل...";
  try {
    const remember = document.getElementById("remember").checked;
    const body = { remember };
    if (mode === "code") body.code = document.getElementById("code").value.trim();
    else body.password = document.getElementById("password").value;
    const res = await fetch("/api/login", {
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
      data.error || (mode === "code" ? "الكود غلط أو خلصت صلاحيته — ابعت /code تاني للبوت" : "كلمة السر غلط");
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "حصل خطأ، جرّب تاني";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "دخول";
  }
});
