const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("page contains the core one-page UI", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /Good morning, Rodrigo/);
  assert.match(html, /data-tab="checkin"/);
  assert.match(html, /data-tab="dashboard"/);
  assert.match(html, /New habit/);
  assert.match(html, /password-screen/);
});

test("Google Apps Script keeps the password in Settings!B2", () => {
  const script = fs.readFileSync(path.join(root, "google-apps-script", "Code.gs"), "utf8");
  assert.match(script, /Settings/);
  assert.match(script, /verifyPassword/);
  assert.match(script, /getRange\("B2"\)/);
});

test("server serves index and reports unconfigured integrations", async (t) => {
  const { createServer } = require("../server");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();

  const page = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Habit Tracker/);

  const config = await fetch(`http://127.0.0.1:${address.port}/api/config`).then((res) => res.json());
  assert.equal(config.storageConfigured, false);
  assert.equal(config.passwordConfigured, false);
  const calendar = await fetch(`http://127.0.0.1:${address.port}/calendar.js`);
  assert.equal(calendar.status, 200);
  assert.match(calendar.headers.get("content-type"), /javascript/);
  assert.match(await calendar.text(), /function calendarDays/);
});

async function start(t, options) {
  const { createServer } = require("../server");
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test("private API requires a signed session and does not expose source files", async (t) => {
  const base = await start(t, { store: {}, password: "private-test-password", secureCookies: true });
  for (const method of ["GET", "POST"]) {
    assert.equal((await fetch(`${base}/api/state`, { method })).status, 401);
  }
  for (const file of ["/server.js", "/store.js", "/package.json", "/.env", "/.git/config"]) {
    assert.equal((await fetch(base + file)).status, 404);
  }
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "wrong" })
  });
  assert.equal(login.status, 401);
  assert.equal(login.headers.get("set-cookie"), null);
  const validLogin = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "private-test-password" })
  });
  assert.equal(validLogin.status, 200);
  const cookie = validLogin.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict; Path=\/; Max-Age=31536000; Secure/);
  assert.equal((await fetch(`${base}/api/state`, { headers: { cookie: "habit-session=9999999999.forged" } })).status, 401);
});

test("device sessions survive server restarts, expire after a year, and reject password changes", async (t) => {
  const issuedAt = Date.UTC(2026, 10, 19);
  let now = issuedAt;
  t.mock.method(Date, "now", () => now);
  const store = { getState: async () => ({ habits: [], checkins: [] }) };
  const options = { store, password: "original-password" };
  const base = await start(t, options);
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: options.password })
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^habit-session=v2\./);
  const expiry = Number(cookie.split(".")[1]);
  assert.equal(expiry, issuedAt / 1000 + 365 * 24 * 60 * 60);
  const restarted = await start(t, options);
  now = issuedAt + 364 * 24 * 60 * 60 * 1000;
  const remembered = await fetch(`${restarted}/api/state`, { headers: { cookie } });
  assert.equal(remembered.status, 200);
  assert.equal(remembered.headers.get("set-cookie"), null);
  const reset = await start(t, { store, password: "new-password" });
  assert.equal((await fetch(`${reset}/api/state`, { headers: { cookie } })).status, 401);
  now = expiry * 1000;
  assert.equal((await fetch(`${restarted}/api/state`, { headers: { cookie } })).status, 401);
});

test("existing valid logins upgrade once without entering the password again", async (t) => {
  const { createHmac } = require("node:crypto");
  const password = "existing-password";
  const base = await start(t, { store: { getState: async () => ({ habits: [], checkins: [] }) }, password });
  const expiry = String(Math.floor(Date.now() / 1000) + 86400);
  const signature = createHmac("sha256", password).update(expiry).digest("base64url");
  const legacyCookie = `habit-session=${expiry}.${signature}`;
  const upgraded = await fetch(`${base}/api/state`, { headers: { cookie: legacyCookie } });
  assert.equal(upgraded.status, 200);
  const cookie = upgraded.headers.get("set-cookie");
  assert.match(cookie, /^habit-session=v2\./);
  assert.match(cookie, /Max-Age=31536000/);
  const remembered = await fetch(`${base}/api/state`, { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(remembered.status, 200);
  assert.equal(remembered.headers.get("set-cookie"), null);
  const strippedVersion = cookie.split(";")[0].replace("v2.", "");
  assert.equal((await fetch(`${base}/api/state`, { headers: { cookie: strippedVersion } })).status, 401);
});

test("authenticated state persists habits and check-ins, and rejects invalid writes", async (t) => {
  const habits = new Map();
  const checkins = new Map();
  const store = {
    getState: async () => ({ habits: [...habits.values()], checkins: [...checkins.values()] }),
    saveHabit: async (habit) => habits.set(habit.id, habit),
    saveCheckin: async (checkin) => {
      if (!habits.has(checkin.habitId)) throw Object.assign(new Error("Habit not found"), { status: 404 });
      const key = `${checkin.habitId}_${checkin.date}`;
      if (checkin.value) checkins.set(key, checkin);
      else checkins.delete(key);
    }
  };
  const base = await start(t, { store, password: "test-password" });
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"password":"test-password"}' });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "content-type": "application/json" };
  const post = (action, body) => fetch(`${base}/api/state?action=${action}`, { method: "POST", headers, body: JSON.stringify(body) });
  const habit = { id: "read", name: "Read", emoji: "📖", type: "positive", target: 5, period: "week" };
  assert.equal((await post("saveHabit", habit)).status, 200);
  assert.equal((await post("saveHabit", habit)).status, 200);
  const checkin = { habitId: "read", date: "2026-11-19", value: true };
  assert.equal((await post("checkin", checkin)).status, 200);
  assert.equal((await post("checkin", checkin)).status, 200);
  assert.deepEqual(await fetch(`${base}/api/state`, { headers }).then((res) => res.json()), { habits: [habit], checkins: [checkin] });
  assert.equal((await post("checkin", { ...checkin, value: false })).status, 200);
  assert.equal(checkins.size, 0);
  for (const invalid of [{ ...habit, id: "../bad" }, { ...habit, target: 8 }, { ...habit, name: " " }, { ...habit, type: "other" }]) {
    assert.equal((await post("saveHabit", invalid)).status, 400);
  }
  for (const invalid of [{ ...checkin, date: "2026-02-30" }, { ...checkin, value: "false" }]) {
    assert.equal((await post("checkin", invalid)).status, 400);
  }
  assert.equal((await post("checkin", { ...checkin, habitId: "missing" })).status, 404);
  assert.equal((await post("unknown", {})).status, 400);
  assert.equal((await fetch(`${base}/api/state`, { method: "POST", headers, body: "{" })).status, 400);
  assert.equal((await fetch(`${base}/api/state`, { method: "POST", headers, body: JSON.stringify({ name: "x".repeat(17000) }) })).status, 413);
  assert.equal((await fetch(`${base}/api/state`, { method: "POST", headers: { cookie }, body: "{}" })).status, 415);
  assert.equal((await fetch(`${base}/api/state`, { method: "DELETE", headers })).status, 405);
});
