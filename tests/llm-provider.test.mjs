import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
process.env.ADMIN_API_KEY = "a".repeat(32);
process.env.GATEWAY_KEY_PEPPER = "b".repeat(32);
process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_BASE_URL = "https://example.test/v1";
process.env.PRIMARY_MODEL = "primary-model";
process.env.REQUEST_TIMEOUT_MS = "1000";
process.env.PRIMARY_INPUT_COST_PER_1M_USD = "1";
process.env.PRIMARY_OUTPUT_COST_PER_1M_USD = "2";

const { createChatCompletion, ProviderError } = await import("../dist/services/llm-provider.js");
const messages = [{ role: "user", content: "hello" }];

test("retries a transient provider failure and returns token usage", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { message: "temporarily unavailable" } }), { status: 503 });
    return new Response(JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: "hello" } }] }), { status: 200 });
  };

  try {
    const result = await createChatCompletion(messages);
    assert.equal(calls, 2);
    assert.equal(result.inputTokens, 10);
    assert.equal(result.outputTokens, 5);
    assert.equal(result.estimatedCostUsd, 0.00002);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a non-recoverable provider failure", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "invalid request" } }), { status: 400 });
  };

  try {
    await assert.rejects(() => createChatCompletion(messages), (error) => error instanceof ProviderError && error.status === 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
