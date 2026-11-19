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
  delete process.env.GOOGLE_SHEETS_WEB_APP_URL;
  delete process.env.APP_PASSWORD;
  const { server } = require("../server");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();

  const page = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Habit Tracker/);

  const config = await fetch(`http://127.0.0.1:${address.port}/api/config`).then((res) => res.json());
  assert.equal(config.sheetsConfigured, false);
  assert.equal(config.passwordConfigured, false);
});
