# Testing ModelGate

Run commands from the project root after creating `.env` from `.env.example`.

## Automated checks

```powershell
pnpm build
pnpm test
```

The current tests cover retry behavior, non-retryable provider errors, token-cost calculation, and retry status classification.

## Local API checks

1. Start the gateway with `pnpm dev`.
2. Request `GET /health` and expect `200 { "status": "ok" }`.
3. Create a virtual key through `POST /v1/admin/keys` using `x-admin-key`.
4. Send a real request to `POST /v1/chat/completions` with that returned `x-api-key`.
5. Create a key with `requestLimit: 2`, send three valid requests, and expect the third response to be `429 budget_exhausted`.
6. Request `GET /v1/admin/usage/:key` and confirm `requestsUsed`, token totals, cost, and success/failure records.
7. Temporarily set an unreachable `GEMINI_BASE_URL`, restart the gateway, and confirm a safe `502 provider_unavailable` response with `x-request-id`.

## Latest local evidence

- TypeScript build: passed.
- Automated policy tests: 4 passed.
- Health endpoint: returned 200.
- Gemini 3.8 Flash gateway request: returned 200 and the requested response.
- Two-request budget: third valid request returned 429; MongoDB showed `requestsUsed: 2` and two usage logs.
- Provider failures: transient Gemini timeouts returned safe 502 responses and were logged.

## Deployment verification

After deploying with `render.yaml`, repeat the health and virtual-key checks against the public URL. Configure a reachable managed Redis instance if the optional burst rate limit is required in that environment.
