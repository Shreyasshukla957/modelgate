export type ModelCost = { inputPer1M: number; outputPer1M: number };

export function estimateCostUsd(inputTokens: number, outputTokens: number, cost: ModelCost) {
  return Number(
    ((inputTokens / 1_000_000) * cost.inputPer1M + (outputTokens / 1_000_000) * cost.outputPer1M).toFixed(8)
  );
}

export function isRetryableProviderStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}