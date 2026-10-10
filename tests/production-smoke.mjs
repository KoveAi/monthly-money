import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";

// Exercise the built server with production cookies, fake credentials, and an
// unreachable dummy database. This must never use a production DATABASE_URL.
const base = "http://127.0.0.1:3100";
const accessCode = randomBytes(24).toString("base64url");
const fixture = {
  MONTHLY_MONEY_ACCESS_CODE_HASH: createHash("sha256").update(accessCode).digest("hex"),
  MONTHLY_MONEY_SESSION_SECRET: randomBytes(32).toString("hex"),
  MONTHLY_MONEY_ORIGIN: "https://ledger.example",
};
async function withServer(configured, run) {
  const env = { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test" };
  for (const key of Object.keys(fixture)) delete env[key];
  if (configured) Object.assign(env, fixture);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100", "-H", "127.0.0.1"], {
    env, stdio: "ignore",
  });
  const exited = once(server, "exit");
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) throw new Error("The production test server exited early.");
      try { await fetch(base + "/login"); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.equal(ready, true, "Production server did not become ready");
    await run();
  } finally { server.kill("SIGTERM"); await exited; }
}
function call(path, method = "GET", headers = {}, body) {
  return fetch(base + path, {
    method, redirect: "manual", headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

await withServer(true, async () => {
  for (const [path, method] of [
    ["/dashboard", "GET"], ["/monthly/2026-10", "GET"],
    ["/api/expenses", "GET"], ["/api/expenses", "POST"],
    ["/api/expenses/test-expense", "PUT"], ["/api/expenses/test-expense", "DELETE"],
    ["/api/expenses/generate-month", "POST"], ["/api/future-private-route", "GET"],
  ]) {
    const response = await call(path, method);
    assert.equal(response.status, path.startsWith("/api/") ? 401 : 307, `${method} ${path}`);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  const loginPage = await (await call("/login")).text();
  assert.match(loginPage, /Household access code/);
  const signedIn = await call("/api/auth/login", "POST", {
    "Content-Type": "application/json", Origin: fixture.MONTHLY_MONEY_ORIGIN,
  }, { accessCode });
  assert.equal(signedIn.status, 200);
  const setCookie = signedIn.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-monthly-money=/);
  for (const attribute of [/HttpOnly/i, /Secure/i, /SameSite=strict/i, /Max-Age=28800/i]) assert.match(setCookie, attribute);
  const cookie = setCookie.split(";")[0];
  const blocked = await call("/api/expenses", "POST", {
    Cookie: cookie, Origin: "https://other.example", "Content-Type": "application/json",
  }, {});
  assert.equal(blocked.status, 403);
  const bypass = await call("/api/expenses", "GET", {
    "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware",
  });
  assert.equal(bypass.status, 401);
  const signedOut = await call("/api/auth/logout", "POST", { Cookie: cookie, Origin: fixture.MONTHLY_MONEY_ORIGIN });
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.get("set-cookie"), /Max-Age=0/i);
});
console.log("Production HTTP checks passed: UI/API authorization, login, cookie flags, CSRF rejection, bypass header, logout.");

await withServer(false, async () => {
  assert.equal((await call("/api/expenses")).status, 503);
  assert.equal((await call("/api/auth/login", "POST")).status, 503);
  assert.equal((await call("/dashboard")).status, 307);
  const page = await (await call("/login")).text();
  assert.match(page, /Your financial records are locked/);
  assert.doesNotMatch(page, /id="access-code"/);
});
console.log("Missing-configuration HTTP checks passed: financial records remain locked.");
