# ModelGate

A small, deployment-ready TypeScript gateway that sits between callers and a Gemini OpenAI-compatible LLM provider. It issues virtual keys, enforces per-key request quotas, persists usage and estimated spend, and retries transient provider failures before an optional fallback model.

## Features

- Virtual keys: clients send x-api-key; the provider credential remains server-side.
- Atomic request quotas: a conditional MongoDB update reserves a request before any provider call.
- Usage records: model, input/output tokens, estimated USD cost, timestamp, status, and provider failure code.
- Resilience: one retry for transient upstream errors, then an optional fallback model.
- Admin endpoints protected by a separate x-admin-key.

## Local setup

1. Copy .env.example to .env.
2. Set GEMINI_API_KEY, long random ADMIN_API_KEY and GATEWAY_KEY_PEPPER, and a MongoDB URI.
3. Run npm install and npm run dev.

## Create a virtual key

~~~bash
curl -X POST http://localhost:3000/v1/admin/keys \
  -H "content-type: application/json" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -d '{"name":"demo-client","requestLimit":20}'
~~~

The plaintext gateway key is returned once. MongoDB stores only an HMAC-SHA-256 hash of that key.

## Send a completion

~~~bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "content-type: application/json" \
  -H "x-api-key: rk_your_virtual_key" \
  -d '{"messages":[{"role":"user","content":"Explain request quotas in one sentence."}],"temperature":0.2}'
~~~

## Read usage

~~~bash
curl "http://localhost:3000/v1/admin/usage" \
  -H "x-admin-key: $ADMIN_API_KEY" \
  -H "x-api-key: $GATEWAY_API_KEY"
~~~

## Deployment

Deploy the repository as a Node web service. Set every variable from .env.example in the provider dashboard; do not upload .env. Use npm start as the start command. The service reads PORT from the platform.

Use a managed MongoDB deployment and set PRIMARY_*_COST_PER_1M_USD from the current pricing for the selected model. Estimated spend is informational; the hard quota is request-count based.

### Optional Redis burst limit

Set either `REDIS_URL`, or the three values `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`, to enable a per-key short-window limit. With the default `RATE_LIMIT_REQUESTS_PER_MINUTE=10`, Redis blocks a key's eleventh request in the same minute with `429 rate_limited`. MongoDB still enforces the durable total request budget. If no Redis connection values are set, ModelGate runs without this optional layer.

The repository includes `render.yaml` for a Render Blueprint deployment. Add the MongoDB URI and Gemini key as private Render environment variables before deploying. Treat configured model prices as estimates and verify them against your billing tier. A fallback model requires explicit input/output prices; zero is allowed only when deliberately configured for free inference.

See TESTING.md for verification steps, and DECISIONS.md and AI-LOG.md for the engineering rationale and AI-use record.


### Live deployment

ModelGate is deployed at `https://modelgate.onrender.com`.

The security-review changes documented here have not been deployed. The revised header-based usage endpoint and accounting behavior apply after releasing this version. The existing deployment still runs the earlier endpoint contract.

```bash
curl https://modelgate.onrender.com/health
```

The response is `{"status":"ok"}`. Use the API examples above with the deployed base URL and your own virtual key.
## Integration checklist

After adding a local `.env`, verify the service in this order:

1. Start the server and request `GET /health`.
2. Create a virtual key with a request limit of `2`.
3. Send two chat-completion requests with that virtual key and confirm both succeed.
4. Send a third request and confirm the gateway returns `429 budget_exhausted` before calling Gemini.
5. Request `GET /v1/admin/usage` with `x-admin-key` and `x-api-key`; confirm the count, tokens, cost, and outcome totals.
6. Temporarily configure an invalid provider base URL and confirm the gateway returns a safe `502 provider_unavailable` response with an `x-request-id` header.

## Security and accounting behavior

The earlier credential-bearing `/v1/admin/usage/:key` route is removed. Use `GET /v1/admin/usage` with both `x-admin-key` and `x-api-key` headers. Set `GATEWAY_API_KEY` to the returned virtual key in the curl example. Responses use `Cache-Control: no-store`.

After reserving quota, the gateway creates a pending usage record before inference. If this write fails, it returns `503 usage_persistence_unavailable` without calling Gemini; the reserved budget remains consumed. After inference, it updates the same record with actual tokens and estimated cost, retrying the update once. If both writes fail, it returns 503 without relabelling paid inference as a zero-cost provider failure. Do not automatically retry that response: the provider may have completed the work. The usage summary includes `pendingRequests` and `failedRequests`; pending totals do not represent confirmed zero spend.

Provider errors are sanitized, redirects are rejected, and successful responses must include completion choices and token usage. Invalid JSON returns 400; bodies over 100 KB return 413, both with a request ID.

Redis is optional at runtime as well as startup. When disconnected, on command failure, or after a one-second command timeout, its burst check is bypassed and MongoDB still enforces the hard request budget. Burst protection is unavailable in that condition. `Retry-After` reflects the next clock-minute boundary.

See REVIEW.md for the whole-codebase review and known limits. The opt-in integration test uses real MongoDB and Gemini: `npm run test:integration`. To test MongoDB concurrency without a billable inference, build first and run `node tests/integration/run.mjs --database-only`.

## Reviewer access

The service is an API: `/` has no page; `/health` reports process liveness. To let a reviewer exercise the deployed provider endpoint, the owner should create a dedicated virtual key with a small request limit through the protected admin endpoint and share that key privately. Never share the admin secret, provider credential, or database URI. Budget is consumed by accepted attempts, including provider failures; issue a fresh demo key if the previous allowance is exhausted.

Set `GATEWAY_API_KEY` to that limited virtual key and run:

```bash
curl -X POST https://modelgate.onrender.com/v1/chat/completions \
  -H "content-type: application/json" \
  -H "x-api-key: $GATEWAY_API_KEY" \
  -d '{"messages":[{"role":"user","content":"Reply with exactly OK."}]}'
```

The owner can inspect usage through the admin endpoint; the reviewer does not need admin access to request a completion. The live deployment must be verified after release; successful local integration does not establish that Render is running these changes.
