import assert from "node:assert/strict";
import test from "node:test";
Object.assign(process.env, { MONGODB_URI: "mongodb://127.0.0.1:27017/test", ADMIN_API_KEY: "a".repeat(32), GATEWAY_KEY_PEPPER: "b".repeat(32), GEMINI_API_KEY: "test", RATE_LIMIT_REQUESTS_PER_MINUTE: "10" });
const { enforceRateLimit } = await import("../dist/services/rate-limit.js");

test("disconnected Redis leaves durable budget enforcement available", async () => {
  assert.deepEqual(await enforceRateLimit("hash", { isReady: false, eval: () => { throw new Error("must not execute"); } }), { allowed: true });
});
test("Redis command failures allow the MongoDB budget check to proceed", async () => {
  assert.deepEqual(await enforceRateLimit("hash", { isReady: true, eval: async () => { throw new Error("offline"); } }), { allowed: true });
});
test("stalled Redis commands have a bounded wait", async () => {
  const start = Date.now();
  assert.deepEqual(await enforceRateLimit("hash", { isReady: true, eval: () => new Promise(() => {}) }), { allowed: true });
  assert.ok(Date.now() - start < 3_000);
});
test("allows ten requests and rejects the eleventh until the next minute boundary", async () => {
  const originalNow = Date.now;
  Date.now = () => 119_500;
  let count = 0;
  const redis = { isReady: true, eval: async () => ++count };
  try {
    for (let i = 0; i < 10; i++) assert.equal((await enforceRateLimit("hash", redis)).allowed, true);
    const rejected = await enforceRateLimit("hash", redis);
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.retryAfterSeconds, 1);
  } finally { Date.now = originalNow; }
});
