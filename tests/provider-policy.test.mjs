import assert from "node:assert/strict";
import test from "node:test";
import { estimateCostUsd, isRetryableProviderStatus } from "../dist/services/provider-policy.js";

test("estimates input and output token cost independently", () => {
  const estimatedCost = estimateCostUsd(1_000_000, 500_000, { inputPer1M: 0.15, outputPer1M: 0.6 });
  assert.equal(estimatedCost, 0.45);
});

test("retries only statuses that can reasonably recover", () => {
  assert.equal(isRetryableProviderStatus(429), true);
  assert.equal(isRetryableProviderStatus(500), true);
  assert.equal(isRetryableProviderStatus(400), false);
  assert.equal(isRetryableProviderStatus(401), false);
});
