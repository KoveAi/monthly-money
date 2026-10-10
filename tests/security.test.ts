import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { sealData } from "iron-session";
import { NextRequest } from "next/server";
import { authConfig, COOKIE_NAME, createSessionCookie, hasValidSession, SESSION_TTL, verifyAccessCode } from "../lib/auth";
import { readJsonObject, requireHousehold } from "../lib/api-security";
import { validateExpense } from "../lib/expense-validation";
import { prisma } from "../lib/prisma";
import { GET, POST } from "../app/api/expenses/route";
import { PUT, DELETE } from "../app/api/expenses/[id]/route";
import { POST as generateMonth } from "../app/api/expenses/generate-month/route";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { middleware } from "../middleware";

const origin = "https://ledger.example";
let code = "";
let databaseCalls = 0;
const record = { id: "test-expense", description: "Example bill", amount: 25 };

beforeEach(() => {
  code = randomBytes(24).toString("base64url");
  process.env.MONTHLY_MONEY_ACCESS_CODE_HASH = createHash("sha256").update(code).digest("hex");
  process.env.MONTHLY_MONEY_SESSION_SECRET = randomBytes(32).toString("hex");
  process.env.MONTHLY_MONEY_ORIGIN = origin;
  databaseCalls = 0;
  // Never connect to a real database, even on an authenticated test request.
  for (const method of ["findMany", "create", "update", "delete", "count", "findFirst"] as const) {
    (prisma.expense as unknown as Record<string, unknown>)[method] = async () => {
      databaseCalls++;
      return method === "findMany" ? [record] : record;
    };
  }
});

function request(path: string, method = "GET", cookie?: string, body?: unknown, source = origin) {
  const headers: Record<string, string> = { Origin: source, "Sec-Fetch-Site": "same-origin" };
  if (cookie) headers.Cookie = `${COOKIE_NAME}=${cookie}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new NextRequest(origin + path, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("all expense handlers reject anonymous access before touching the database", async () => {
  const context = { params: Promise.resolve({ id: "test-expense" }) };
  const responses = await Promise.all([
    GET(request("/api/expenses")), POST(request("/api/expenses", "POST", undefined, {})),
    PUT(request("/api/expenses/test-expense", "PUT", undefined, {}), context),
    DELETE(request("/api/expenses/test-expense", "DELETE"), context),
    generateMonth(request("/api/expenses/generate-month", "POST", undefined, { targetMonthKey: "2026-10" })),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.deepEqual(await response.json(), { error: "Sign in to continue." });
  }
  assert.equal(databaseCalls, 0);
});

test("missing or malformed configuration fails closed", async () => {
  delete process.env.MONTHLY_MONEY_SESSION_SECRET;
  assert.equal(authConfig(), null);
  assert.equal((await GET(request("/api/expenses"))).status, 503);
  assert.equal((await login(request("/api/auth/login", "POST", undefined, { accessCode: code }))).status, 503);
  assert.equal(databaseCalls, 0);
  process.env.MONTHLY_MONEY_SESSION_SECRET = "weak-secret";
  assert.equal(authConfig(), null);
});

test("valid random code works; malformed and incorrect codes do not", () => {
  assert.equal(verifyAccessCode(code), true);
  for (const value of ["", null, {}, "x".repeat(32), "password", "a".repeat(10000)]) {
    assert.equal(verifyAccessCode(value), false);
  }
});

test("forged, tampered, expired and rotated sessions are rejected", async () => {
  const cookie = await createSessionCookie();
  assert.equal(await hasValidSession(cookie), true);
  assert.equal(await hasValidSession(undefined), false);
  assert.equal(await hasValidSession("forged-cookie"), false);
  assert.equal(await hasValidSession(cookie.replace(/^./, "x")), false);
  const expired = await sealData({ household: true, credentialVersion: authConfig()!.codeHash, expiresAt: Date.now() - 1 }, {
    password: authConfig()!.secret, ttl: SESSION_TTL,
  });
  assert.equal(await hasValidSession(expired), false);
  process.env.MONTHLY_MONEY_ACCESS_CODE_HASH = createHash("sha256").update(randomBytes(24)).digest("hex");
  assert.equal(await hasValidSession(cookie), false);
});

test("each authenticated write rejects foreign or absent Origin before any database call", async () => {
  const cookie = await createSessionCookie();
  const context = { params: Promise.resolve({ id: "test-expense" }) };
  for (const source of ["https://other.example", "null", ""]) {
    assert.equal((await POST(request("/api/expenses", "POST", cookie, {}, source))).status, 403);
    assert.equal((await PUT(request("/api/expenses/test-expense", "PUT", cookie, {}, source), context)).status, 403);
    assert.equal((await DELETE(request("/api/expenses/test-expense", "DELETE", cookie, undefined, source), context)).status, 403);
    assert.equal((await generateMonth(request("/api/expenses/generate-month", "POST", cookie, {}, source))).status, 403);
  }
  assert.equal(databaseCalls, 0);
});

test("Fetch Metadata also rejects cross-site requests even with the configured Origin", async () => {
  const cookie = await createSessionCookie();
  const req = request("/api/expenses", "POST", cookie, {});
  req.headers.set("sec-fetch-site", "cross-site");
  assert.equal((await requireHousehold(req))?.status, 403);
});

test("authenticated read and CRUD reach only the stub database", async () => {
  const cookie = await createSessionCookie();
  const context = { params: Promise.resolve({ id: "test-expense" }) };
  assert.deepEqual(await (await GET(request("/api/expenses", "GET", cookie))).json(), [record]);
  const create = await POST(request("/api/expenses", "POST", cookie, {
    description: "Example bill", amount: "25.00", category: "Example", dueDate: "2026-10-10", monthKey: "2026-10",
  }));
  assert.equal(create.status, 201);
  assert.equal((await PUT(request("/api/expenses/test-expense", "PUT", cookie, { amountPaid: "10.00" }), context)).status, 200);
  assert.equal((await DELETE(request("/api/expenses/test-expense", "DELETE", cookie), context)).status, 200);
  assert.equal(databaseCalls, 4);
});

test("invalid amounts, dates, months and booleans cannot reach the database", async () => {
  for (const value of [-1, "10oops", "Infinity", {}, null, "", "-5"]) assert.throws(() => validateExpense({ amount: value }));
  assert.throws(() => validateExpense({ dueDate: "invalid" }));
  assert.throws(() => validateExpense({ dueDate: "2026-02-30" }));
  assert.throws(() => validateExpense({ isRecurring: "false" }));
  const cookie = await createSessionCookie();
  assert.equal((await POST(request("/api/expenses", "POST", cookie, { amount: "Infinity" }))).status, 400);
  assert.equal((await generateMonth(request("/api/expenses/generate-month", "POST", cookie, { targetMonthKey: "2026-13" }))).status, 400);
  assert.equal((await GET(request("/api/expenses?monthKey=2026-00", "GET", cookie))).status, 400);
  assert.equal(databaseCalls, 0);
});

test("JSON parser limits bytes and rejects arrays or non-JSON payloads", async () => {
  await assert.rejects(() => readJsonObject(request("/api/expenses", "POST", undefined, [1, 2])));
  await assert.rejects(() => readJsonObject(request("/api/expenses", "POST", undefined, { notes: "x".repeat(20000) })));
  await assert.rejects(() => readJsonObject(new Request(origin, { method: "POST", body: "not json" })));
});

test("login sets HttpOnly/SameSite cookie and logout expires it", async () => {
  const response = await login(request("/api/auth/login", "POST", undefined, { accessCode: code }));
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie")!;
  if (process.env.NODE_ENV === "production") {
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /^__Host-monthly-money=/);
  }
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=strict/i);
  assert.match(setCookie, /Max-Age=28800/i);
  assert.match(setCookie, /Path=\//i);
  assert.equal((await login(request("/api/auth/login", "POST", undefined, { accessCode: code }, "https://other.example"))).status, 403);
  const cookie = setCookie.split(";")[0].split("=").slice(1).join("=");
  const signOut = await logout(request("/api/auth/logout", "POST", cookie));
  assert.equal(signOut.status, 200);
  assert.match(signOut.headers.get("set-cookie")!, /Max-Age=0/i);
});

test("middleware guards UI and new API routes, but permits login", async () => {
  const ui = await middleware(request("/dashboard"));
  assert.equal(ui.status, 307);
  assert.equal(ui.headers.get("location"), origin + "/login");
  const api = await middleware(request("/api/future-private-route"));
  assert.equal(api.status, 401);
  assert.equal((await middleware(request("/login"))).status, 200);
  assert.equal(databaseCalls, 0);
});
