import assert from "node:assert/strict";
import test from "node:test";

process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
process.env.ADMIN_API_KEY = "a".repeat(32);
process.env.GATEWAY_KEY_PEPPER = "b".repeat(32);
process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_BASE_URL = "https://example.test/v1";
process.env.PRIMARY_MODEL = "primary-model";
process.env.FALLBACK_MODEL = "fallback-model";
process.env.FALLBACK_INPUT_COST_PER_1M_USD = "3";
process.env.FALLBACK_OUTPUT_COST_PER_1M_USD = "4";
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

for (const [name, payload] of [
  ["empty object", "{}"],
  ["error-only body", JSON.stringify({ error: { message: "not a completion" } })],
  ["invalid JSON", "not JSON"],
  ["missing usage", JSON.stringify({ choices: [{ message: { content: "hello" } }] })]
]) {
  test(`rejects HTTP 200 with ${name}`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(payload);
    try {
      await assert.rejects(() => createChatCompletion(messages), error => error instanceof ProviderError);
    } finally { globalThis.fetch = originalFetch; }
  });
}

test("uses fallback after primary retries and applies fallback pricing", async () => {
  const originalFetch = globalThis.fetch;
  const models = [];
  globalThis.fetch = async (_url, options) => {
    models.push(JSON.parse(options.body).model);
    if (models.length < 3) return new Response("{}", { status: 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "fallback" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  };
  try {
    const result = await createChatCompletion(messages);
    assert.deepEqual(models, ["primary-model", "primary-model", "fallback-model"]);
    assert.equal(result.usedFallback, true);
    assert.equal(result.estimatedCostUsd, 0.00005);
  } finally { globalThis.fetch = originalFetch; }
});

test("does not expose provider error text or follow redirects", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, "error");
    return new Response(JSON.stringify({ error: { message: "secret-provider-credential" } }), { status: 401 });
  };
  try {
    await assert.rejects(() => createChatCompletion(messages), error => error instanceof ProviderError && !error.message.includes("secret-provider"));
  } finally { globalThis.fetch = originalFetch; }
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
