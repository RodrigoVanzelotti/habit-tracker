const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const sheetsUrl = process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
const appPassword = process.env.APP_PASSWORD || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(value));
}

async function proxySheets(req, res, requestUrl) {
  if (!sheetsUrl) {
    sendJson(res, 503, { error: "GOOGLE_SHEETS_WEB_APP_URL is not configured" });
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  const target = new URL(sheetsUrl);
  if (requestUrl.search) {
    const incoming = new URL(requestUrl, "http://local");
    incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  }

  let response;
  try {
    response = await fetch(target, {
      method: req.method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: req.method === "POST" && body ? body : undefined
    });
  } catch (error) {
    sendJson(res, 502, { error: "Google Sheets connection failed" });
    return;
  }

  const text = await response.text();
  res.writeHead(response.status, {
    "content-type": response.headers.get("content-type") || "application/json",
    "cache-control": "no-store"
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");

  if (requestUrl.pathname === "/api/config") {
    sendJson(res, 200, {
      sheetsConfigured: Boolean(sheetsUrl),
      passwordConfigured: Boolean(appPassword)
    });
    return;
  }

  if (requestUrl.pathname === "/api/login" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    let supplied;
    try {
      supplied = JSON.parse(body).password;
    } catch {
      supplied = "";
    }
    if (appPassword && supplied === appPassword) {
      sendJson(res, 200, { ok: true });
    } else if (!appPassword) {
      sendJson(res, 503, { ok: false, error: "APP_PASSWORD is not configured" });
    } else {
      sendJson(res, 401, { ok: false });
    }
    return;
  }

  if (requestUrl.pathname === "/api/sheets") {
    await proxySheets(req, res, requestUrl);
    return;
  }

  let relativePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(port, "0.0.0.0", () => {
    console.log(`Habit Tracker listening on port ${port}`);
  });
}

module.exports = { server };
