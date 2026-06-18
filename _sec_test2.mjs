import express from "express";
import http from "node:http";

const app = express();
app.use(express.json({ limit: "64kb" }));
app.post("/api/files", express.raw({ type: ["image/*", "application/pdf"], limit: "12mb" }), (req, res) => {
  const buf = req.body;
  const isBuf = Buffer.isBuffer(buf);
  res.json({ typeofBody: typeof buf, isBuffer: isBuf, len: isBuf ? buf.length : (buf && buf.length), keys: !isBuf && buf ? Object.keys(buf) : null });
});

const server = app.listen(0, async () => {
  const port = server.address().port;
  function req(ct, body) {
    return new Promise((resolve) => {
      const r = http.request({ port, method: "POST", path: "/api/files", headers: { "Content-Type": ct } }, (resp) => {
        let d = ""; resp.on("data", (c) => (d += c)); resp.on("end", () => resolve({ status: resp.statusCode, body: d.slice(0, 200) }));
      });
      r.on("error", (e) => resolve({ err: e.message }));
      r.end(body);
    });
  }
  console.log("1) text/plain (wrong CT):", JSON.stringify(await req("text/plain", "hello")));
  console.log("2) image/png small:     ", JSON.stringify(await req("image/png", Buffer.from([1,2,3,4]))));
  console.log("3) image/png >12mb:      ", JSON.stringify(await req("image/png", Buffer.alloc(13 * 1024 * 1024))));
  console.log("4) application/json huge:", JSON.stringify(await req("application/json", "x".repeat(70 * 1024))));
  console.log("5) no content-type:      ", JSON.stringify(await req("", "hi")));
  server.close();
});
