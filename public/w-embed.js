/* صفحات الشغل جوّه دوّنلي (iframe): الطول بيتبعت للصفحة الأم عشان الـ iframe ياخد طول المحتوى كله
   ومايبقاش فيه سكرول جوّه سكرول، والمودال لما يتفتح الأم بتطلع لأول الإطار عشان يبان. */
(function () {
  if (window.parent === window) return;
  document.documentElement.classList.add("embed");
  const send = (msg) => { try { window.parent.postMessage(msg, location.origin); } catch (e) {} };
  let last = 0;
  const report = () => {
    const h = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(h - last) > 2) { last = h; send({ type: "w-height", h }); }
  };
  new ResizeObserver(report).observe(document.body);
  window.addEventListener("load", report);
  setInterval(report, 1000);
  // المودالات (openMd / closeMd في صفحة المشاريع)
  const wrap = (name, open) => {
    const fn = window[name];
    if (typeof fn !== "function") return;
    window[name] = function () { const r = fn.apply(this, arguments); send({ type: "w-modal", open }); return r; };
  };
  wrap("openMd", true);
  wrap("closeMd", false);
  // الأم بتطلب تحديث البيانات (مثلًا بعد ما اتسجّلت دفعة من الشات)
  window.addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data?.type === "w-reload" && typeof window.load === "function") window.load();
  });
})();
