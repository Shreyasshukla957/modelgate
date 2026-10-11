// Opt-in: uses .env and isolated records; one gateway request can make multiple billable provider attempts.
import assert from "node:assert/strict";
import { once } from "node:events";
import { app } from "../../dist/app.js";
import { env } from "../../dist/config/index.js";
import { connectDatabase, disconnectDatabase } from "../../dist/config/db.js";
import { ApiKey } from "../../dist/models/api-key.js";
import { UsageLog } from "../../dist/models/usage-log.js";
import { createGatewayKey, hashGatewayKey } from "../../dist/services/keys.js";
import { reserveRequest } from "../../dist/services/budget.js";

const name = `review-integration-${crypto.randomUUID()}`;
let server;
const createdIds = [];
try {
  await connectDatabase();
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const concurrentKey = createGatewayKey();
  const concurrentRecord = await ApiKey.create({ name: `${name}-concurrency`, keyHash: hashGatewayKey(concurrentKey), requestLimit: 1 });
  createdIds.push(concurrentRecord._id);
  const reservations = await Promise.all(Array.from({ length: 20 }, () => reserveRequest(concurrentRecord.keyHash)));
  assert.equal(reservations.filter(Boolean).length, 1);
  const blocked = await fetch(`${base}/v1/chat/completions`, {
    method: "POST", headers: { "x-api-key": concurrentKey, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Must be blocked before inference." }] })
  });
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, "budget_exhausted");
  console.log(JSON.stringify({ check: "real MongoDB 20-way quota reservation and HTTP 429", passed: true }));
  if (process.argv.includes("--database-only")) process.exitCode = 0;
  else {
  const response = await fetch(`${base}/v1/admin/keys`, {
    method: "POST", headers: { "x-admin-key": env.ADMIN_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ name, requestLimit: 2 })
  });
  assert.equal(response.status, 201);
  const { key } = await response.json();
  const stored = await ApiKey.findOne({ keyHash: hashGatewayKey(key) }).lean();
  assert.ok(stored); createdIds.push(stored._id);
  assert.ok(!JSON.stringify(stored).includes(key));
  const headers = { "x-api-key": key, "content-type": "application/json" };
  const body = JSON.stringify({ messages: [{ role: "user", content: "Reply with exactly OK." }] });
  const completion = await fetch(`${base}/v1/chat/completions`, { method: "POST", headers, body });
  assert.equal(completion.status, 200, "Live Gemini completion did not succeed");
  const data = await completion.json();
  assert.ok(data.choices.length);
  const success = await UsageLog.findOne({ apiKeyId: stored._id, status: "success" }).lean();
  assert.ok(success);
  assert.equal(success.inputTokens, data.usage.prompt_tokens);
  assert.equal(success.outputTokens, data.usage.completion_tokens);

  const summaryResponse = await fetch(`${base}/v1/admin/usage`, { headers: { "x-admin-key": env.ADMIN_API_KEY, "x-api-key": key } });
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.requestsUsed, 1);
  assert.equal(summary.usage.successfulRequests, 1);
  assert.equal(summary.usage.pendingRequests, 0);
  console.log(JSON.stringify({ passed: true, checks: ["admin authentication", "hashed key storage", "real Gemini completion", "MongoDB usage persistence", "20-way atomic budget reservation", "429 before provider", "header-based usage summary"] }));
  }
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  // Delete only records created by this run; never touch pre-existing application data.
  await UsageLog.deleteMany({ apiKeyId: { $in: createdIds } });
  await ApiKey.deleteMany({ _id: { $in: createdIds } });
  await disconnectDatabase();
}
