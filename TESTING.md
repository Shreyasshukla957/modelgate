# Testing ModelGate

## Automated regression tests

```powershell
npm test
pnpm audit
```

The Node test suite covers provider retry/fallback and pricing; malformed upstream responses; provider error sanitization; HTTP authentication and exhausted quotas; malformed/oversized JSON; usage-save failures before and after inference; fallback configuration; Redis disconnection, command errors, timeout and clock-window retry timing.

HTTP regression tests use real Express requests with isolated database/provider doubles. Redis tests use a command double, not a live Redis service. These tests validate control flow and error behavior; they do not replace the datastore integration checks below.

## Real datastore and provider checks

Create `.env` from `.env.example`. Never commit credentials.

```powershell
npm run test:integration
```

This opt-in test uses the configured real MongoDB and sends one gateway request, potentially triggering multiple billable provider attempts through retries and fallback. It creates uniquely named temporary records, verifies 20 concurrent reservations have exactly one winner, checks an exhausted key returns 429, verifies key hashes and successful inference usage, and reads the header-based usage endpoint. Temporary records created by the test are removed in a finally block.

To test the real quota race without calling Gemini:

```powershell
npm run build
node tests/integration/run.mjs --database-only
```

## Manual API checks

1. Start with `npm run dev` and request `GET /health`.
2. Create a key with `POST /v1/admin/keys` using `x-admin-key`.
3. Send `POST /v1/chat/completions` using `x-api-key`; inspect choices and token usage.
4. Exhaust a two-request key, then confirm 429 budget_exhausted without another provider call.
5. Read `GET /v1/admin/usage` with both `x-admin-key` and `x-api-key`. Inspect request totals, pending/failed/successful counts, tokens and estimated cost.
6. Send malformed JSON and an oversized body; expect 400 and 413 with request IDs.
7. Test an unavailable provider in a separate local process; expect sanitized 502 and a failed or unresolved pending usage record.

The older `/v1/admin/usage/:key` URL is removed because it exposes credentials to URL logs. Update existing clients to use headers.

## Review verification and limits

- TypeScript build and all 24 regression tests passed via npm test.
- Real MongoDB: 20 concurrent reservations for one remaining request yielded one winner; the exhausted key returned HTTP 429.
- The first real Gemini attempt during the review returned 502 after retries. A subsequent local integration run on 11 October 2026 passed a real Gemini completion, persisted matching token counts in MongoDB, and verified the header-based usage summary. This validates the local reviewed code, not a new Render deployment.
- An in-memory failure check confirmed that an acknowledged update matching no usage record returns 503 after two write attempts, with only one provider call. Existing HTTP test doubles were corrected to return realistic MongoDB acknowledgment and match counts; no new test files were added during this follow-up.
- Dependency audit after removing unused Vitest: no reported advisories, including development dependencies.
- Live Redis integration was not tested; the previously configured endpoint was unavailable. Redis runtime policies were tested with doubles.
- The developer authorized local commits after verification. Push and deployment remain pending. Repeat production checks after release.

## Earlier production verification

The previously deployed version at https://modelgate.onrender.com passed health, virtual-key creation, a Gemini completion and usage logging before this review. Render may sleep when idle. An endpoint being healthy does not prove provider availability.
