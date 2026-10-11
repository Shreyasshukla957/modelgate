import assert from "node:assert/strict";
import test, { before, after, beforeEach } from "node:test";
import { once } from "node:events";

Object.assign(process.env, {
  MONGODB_URI: "mongodb://127.0.0.1:27017/test",
  ADMIN_API_KEY: "a".repeat(32), GATEWAY_KEY_PEPPER: "b".repeat(32),
  GEMINI_API_KEY: "test-provider-key", GEMINI_BASE_URL: "https://example.test/v1",
  PRIMARY_MODEL: "test-model", FALLBACK_MODEL: "", REQUEST_TIMEOUT_MS: "1000"
});
const { app } = await import("../dist/app.js");
const { ApiKey } = await import("../dist/models/api-key.js");
const { UsageLog } = await import("../dist/models/usage-log.js");
const realFetch = globalThis.fetch;
const originals = { find: ApiKey.findOne, reserve: ApiKey.findOneAndUpdate, create: UsageLog.create, update: UsageLog.updateOne };
let server, base, providerCalls, writes;
const body = { messages: [{ role: "user", content: "hello" }] };
const headers = { "content-type": "application/json", "x-api-key": "rk_test" };

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  providerCalls = 0; writes = [];
  ApiKey.findOne = () => ({ lean: async () => ({ _id: "test-key-id", active: true }) });
  ApiKey.findOneAndUpdate = async () => ({ _id: "test-key-id" });
  UsageLog.create = async input => { writes.push(input); return { _id: "test-log-id" }; };
  UsageLog.updateOne = async (_filter, update) => { writes.push(update.$set); return { acknowledged: true, matchedCount: 1 }; };
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return realFetch(url, options);
    providerCalls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  ApiKey.findOne = originals.find; ApiKey.findOneAndUpdate = originals.reserve;
  UsageLog.create = originals.create; UsageLog.updateOne = originals.update;
  await new Promise(resolve => server.close(resolve));
});
const complete = () => fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });

test("malformed JSON is a 400 with request ID and no reflected input", async () => {
  const response = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body: '{"secret":"sensitive-input"' });
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error.code, "invalid_json");
  assert.equal(data.error.requestId, response.headers.get("x-request-id"));
  assert.ok(!JSON.stringify(data).includes("sensitive-input"));
  assert.equal(providerCalls, 0);
});
test("oversized JSON is a 413 with request ID", async () => {
  const response = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body: JSON.stringify({ content: "x".repeat(110_000) }) });
  assert.equal(response.status, 413);
  assert.ok((await response.json()).error.requestId);
});
test("admin usage requires admin authentication and a key header", async () => {
  assert.equal((await fetch(`${base}/v1/admin/usage`)).status, 401);
  const response = await fetch(`${base}/v1/admin/usage`, { headers: { "x-admin-key": process.env.ADMIN_API_KEY } });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${base}/v1/admin/usage/rk_test`, { headers: { "x-admin-key": process.env.ADMIN_API_KEY } })).status, 404);
});
test("missing, invalid and inactive keys do not reach provider", async () => {
  const missing = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(missing.status, 401);
  ApiKey.findOne = () => ({ lean: async () => null });
  assert.equal((await complete()).status, 401);
  ApiKey.findOne = () => ({ lean: async () => ({ active: false }) });
  assert.equal((await complete()).status, 403);
  assert.equal(providerCalls, 0);
});
test("exhausted budget is rejected before inference or logging", async () => {
  ApiKey.findOneAndUpdate = async () => null;
  const response = await complete();
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.code, "budget_exhausted");
  assert.equal(providerCalls, 0); assert.equal(writes.length, 0);
});
test("usage failure before inference blocks the provider", async () => {
  UsageLog.create = async () => { throw new Error("storage unavailable"); };
  assert.equal((await complete()).status, 503);
  assert.equal(providerCalls, 0);
});
test("successful inference retries the same usage update without another provider call", async () => {
  let updates = 0;
  UsageLog.updateOne = async (filter, update) => {
    assert.equal(filter._id, "test-log-id");
    writes.push(update.$set);
    if (++updates === 1) throw new Error("temporary storage failure");
    return { acknowledged: true, matchedCount: 1 };
  };
  assert.equal((await complete()).status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(updates, 2);
  assert.equal(writes[0].status, "pending");
  assert.deepEqual(writes[1], writes[2]);
  assert.equal(writes[2].inputTokens, 10);
});
test("persistent logging failure never overwrites a billable success as zero-cost failure", async () => {
  UsageLog.updateOne = async (_filter, update) => { writes.push(update.$set); throw new Error("storage unavailable"); };
  const response = await complete();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "usage_persistence_unavailable");
  assert.equal(providerCalls, 1);
  assert.deepEqual(writes.map(value => value.status), ["pending", "success", "success"]);
});
test("provider errors are sanitized and failed outcomes recorded", async () => {
  globalThis.fetch = async (url, options) => String(url).startsWith(base)
    ? realFetch(url, options)
    : new Response(JSON.stringify({ error: { message: "credential-secret" } }), { status: 401 });
  const response = await complete();
  const data = await response.json();
  assert.equal(response.status, 502);
  assert.ok(!JSON.stringify(data).includes("credential-secret"));
  assert.equal(writes.at(-1).status, "failed");
});
