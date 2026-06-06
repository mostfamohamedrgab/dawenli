const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "بيدخل...";
  try {
    const password = document.getElementById("password").value;
    const remember = document.getElementById("remember").checked;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, remember }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json().catch(() => ({}));
    errorEl.textContent = data.error || "كلمة السر غلط";
    errorEl.hidden = false;
  } catch {
    errorEl.textContent = "حصل خطأ، جرّب تاني";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "دخول";
  }
});
