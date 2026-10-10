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
curl "http://localhost:3000/v1/admin/usage/rk_your_virtual_key" \
  -H "x-admin-key: $ADMIN_API_KEY"
~~~

## Deployment

Deploy the repository as a Node web service. Set every variable from .env.example in the provider dashboard; do not upload .env. Use npm start as the start command. The service reads PORT from the platform.

Use a managed MongoDB deployment and set PRIMARY_*_COST_PER_1M_USD from the current pricing for the selected model. Estimated spend is informational; the hard quota is request-count based.

### Optional Redis burst limit

Set either `REDIS_URL`, or the three values `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`, to enable a per-key short-window limit. With the default `RATE_LIMIT_REQUESTS_PER_MINUTE=10`, Redis blocks a key's eleventh request in the same minute with `429 rate_limited`. MongoDB still enforces the durable total request budget. If no Redis connection values are set, ModelGate runs without this optional layer.

The repository includes `render.yaml` for a Render Blueprint deployment. Add the MongoDB URI and Gemini key as private Render environment variables before deploying. The default Gemini 3.8 Flash estimate uses the current standard input and output prices in the Gemini pricing documentation; update these values whenever the provider's pricing changes.

See TESTING.md for verification steps, and DECISIONS.md and AI-LOG.md for the engineering rationale and AI-use record.

## Integration checklist

After adding a local `.env`, verify the service in this order:

1. Start the server and request `GET /health`.
2. Create a virtual key with a request limit of `2`.
3. Send two chat-completion requests with that virtual key and confirm both succeed.
4. Send a third request and confirm the gateway returns `429 budget_exhausted` before calling Gemini.
5. Request the key usage summary and confirm it contains the request count, token usage, estimated cost, and success count.
6. Temporarily configure an invalid provider base URL and confirm the gateway returns a safe `502 provider_unavailable` response with an `x-request-id` header.
