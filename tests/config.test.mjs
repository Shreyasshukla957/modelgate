import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("a configured fallback requires explicit prices instead of recording unknown spend as free", () => {
  const env = { ...process.env, MONGODB_URI: "mongodb://127.0.0.1:27017/test", ADMIN_API_KEY: "a".repeat(32), GATEWAY_KEY_PEPPER: "b".repeat(32), GEMINI_API_KEY: "test", FALLBACK_MODEL: "fallback", FALLBACK_INPUT_COST_PER_1M_USD: "", FALLBACK_OUTPUT_COST_PER_1M_USD: "", REDIS_URL: "", REDIS_HOST: "", REDIS_PORT: "", REDIS_PASSWORD: "" };
  const script = "try { await import('./dist/config/index.js'); process.exit(0); } catch { process.exit(2); }";
  assert.equal(spawnSync(process.execPath, ["--input-type=module", "-e", script], { env }).status, 2);
  assert.equal(spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...env, FALLBACK_INPUT_COST_PER_1M_USD: "0", FALLBACK_OUTPUT_COST_PER_1M_USD: "0" } }).status, 0);
});
