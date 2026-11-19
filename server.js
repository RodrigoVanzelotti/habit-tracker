const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createHmac, timingSafeEqual } = require("node:crypto");

const sessionLifetime = 365 * 24 * 60 * 60;
const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/calendar.js": ["calendar.js", "text/javascript; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"]
};

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    throw Object.assign(new Error("Expected JSON"), { status: 415 });
  }
  req.setEncoding("utf8");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 16384) throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function equal(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function createServer({ store = null, password = "", secureCookies = false } = {}) {
  const sign = (value) => createHmac("sha256", password).update(value).digest("base64url");
  function setSession(res) {
    const expiry = String(Math.floor(Date.now() / 1000) + sessionLifetime);
    const value = `v2.${expiry}`;
    res.setHeader("set-cookie", `habit-session=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetime}${secureCookies ? "; Secure" : ""}`);
  }

  function authenticated(req, res) {
    const token = (req.headers.cookie || "").split("; ").find((cookie) => cookie.startsWith("habit-session="))?.slice(14);
    if (!token || !password) return false;
    const parts = token.split(".");
    const legacy = parts.length === 2;
    if (!legacy && (parts.length !== 3 || parts[0] !== "v2")) return false;
    const expiry = parts[legacy ? 0 : 1];
    const signature = parts[legacy ? 1 : 2];
    const valid = Number(expiry) > Date.now() / 1000 && Boolean(signature) && equal(signature, sign(legacy ? expiry : `v2.${expiry}`));
    // Upgrade existing 30-day logins once; yearly sessions keep their original expiry.
    if (valid && legacy) setSession(res);
    return valid;
  }

  return http.createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/config" && req.method === "GET") {
        return sendJson(res, 200, { storageConfigured: Boolean(store), passwordConfigured: Boolean(password) });
      }
      if (url.pathname === "/api/login" && req.method === "POST") {
        const body = await readJson(req);
        if (!password) return sendJson(res, 503, { error: "Password is not configured" });
        if (typeof body.password !== "string" || !equal(body.password, password)) return sendJson(res, 401, { ok: false, error: "Incorrect password." });
        setSession(res);
        return sendJson(res, 200, { ok: true });
      }
      if (url.pathname === "/api/state") {
        if (!store) return sendJson(res, 503, { error: "Storage is not configured" });
        if (!authenticated(req, res)) return sendJson(res, 401, { error: "Please sign in again" });
        if (req.method === "GET") return sendJson(res, 200, await store.getState());
        if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
        const body = await readJson(req);
        if (url.searchParams.get("action") === "saveHabit") {
          if (!validId(body.id) || typeof body.name !== "string" || !body.name.trim() || body.name.length > 100 ||
              typeof body.emoji !== "string" || !body.emoji.trim() || body.emoji.length > 32 ||
              !["positive", "negative"].includes(body.type) || !["week", "month"].includes(body.period) ||
              !Number.isInteger(body.target) || body.target < 1 || body.target > (body.period === "week" ? 7 : 31)) {
            return sendJson(res, 400, { error: "Invalid habit" });
          }
          await store.saveHabit({ id: body.id, name: body.name.trim(), emoji: body.emoji.trim(), type: body.type, target: body.target, period: body.period });
        } else if (url.searchParams.get("action") === "checkin") {
          if (!validId(body.habitId) || typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
              !Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0, 10) !== body.date || typeof body.value !== "boolean") {
            return sendJson(res, 400, { error: "Invalid check-in" });
          }
          await store.saveCheckin({ habitId: body.habitId, date: body.date, value: body.value });
        } else {
          return sendJson(res, 400, { error: "Unknown action" });
        }
        return sendJson(res, 200, { ok: true });
      }
      const file = publicFiles[url.pathname];
      if (!file || !["GET", "HEAD"].includes(req.method)) return sendJson(res, 404, { error: "Not found" });
      const data = await fs.promises.readFile(path.join(__dirname, file[0]));
      res.writeHead(200, { "content-type": file[1], "cache-control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      if (!error.status) console.error("Request failed:", error.message);
      sendJson(res, error.status || 500, { error: error.status ? error.message : "Storage unavailable. Please try again." });
    }
  });
}

if (require.main === module) {
  const configured = process.env.STORAGE_BACKEND === "firestore";
  const password = (process.env.APP_PASSWORD || "").trim();
  if ((configured || process.env.K_SERVICE) && (!configured || !password)) throw new Error("Cloud deployment requires Firestore and APP_PASSWORD");
  const store = configured ? require("./store") : null;
  createServer({ store, password, secureCookies: Boolean(process.env.K_SERVICE) })
    .listen(Number(process.env.PORT || 8080), "0.0.0.0", () => console.log("Habit Tracker is listening"));
}

module.exports = { createServer };
