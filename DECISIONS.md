# Decisions

## What I built

ModelGate is a non-streaming TypeScript/Express gateway in front of Gemini's OpenAI-compatible endpoint. Clients authenticate with gateway-issued virtual keys while provider credentials stay on the server. MongoDB atomically enforces request budgets and stores usage outcomes, token counts, and estimated costs. Optional Redis limits bursts, while a bounded retry policy handles transient provider failures.

## Request lifecycle

```text
Client -> request ID / JSON validation -> virtual key authentication
       -> optional Redis burst check -> atomic MongoDB quota reservation
       -> pending usage record -> Gemini -> retry / optional fallback
       -> update usage outcome -> response
```

If quota is exhausted, no provider request is sent. If the pending usage record cannot be created, inference is also blocked, with a 503 response; the reserved quota remains consumed. Both admin authentication and an x-api-key header are required to read usage; credentials never need to appear in a URL.

## Five important decisions

### 1. Requests rather than tokens or currency for hard budgets

A request count is known before inference and can be enforced exactly with one database update. A cost cap would require pessimistic token reservations and later settlement. I chose a request budget and report cost estimates separately, accepting that individual requests can have different costs.

### 2. Atomic reservation rather than read-then-increment

MongoDB findOneAndUpdate checks active status and requestsUsed < requestLimit before incrementing in the same operation. This prevents concurrent requests from exceeding a key's allowance. Reservations remain consumed even when provider or usage storage fails, which prevents retry abuse but can penalize clients during outages.

### 3. Hashed keys rather than stored plaintext

Virtual keys are generated with cryptographic randomness and returned once. MongoDB stores an HMAC-SHA-256 hash using a server-side pepper. This reduces credential exposure from database leaks, but losing or changing the pepper invalidates existing keys. The admin secret is compared through constant-time digest comparison. Usage lookup accepts credentials in headers instead of a URL, and responses are marked no-store.

### 4. Synchronous usage writes rather than an analytics queue

I chose pending records and synchronous outcome updates to keep accounting observable without adding a queue. After a successful inference, the update to the same record is retried once. Persistent failure returns 503 and never deliberately overwrites a paid success with a zero-cost failure. A pending record can represent incomplete work or unresolved persistence; summaries expose that state instead of claiming complete spend figures. This is not transactional exactly-once inference or billing: process crashes, lost acknowledgments, and failed writes can still leave unknown usage. A durable reconciliation queue would address that in a larger system.

### 5. Non-streaming inference with bounded retries

Non-streaming responses make completion and token validation straightforward. Streaming would add partial delivery and late-usage accounting. One retry is made for timeouts, 429, and 5xx errors, then a separate fallback model is tried if configured. Invalid requests and authentication failures are not retried. Upstream redirects and malformed successful responses are rejected. Clients receive sanitized errors, not raw provider diagnostics. Fallback input/output prices must be explicitly configured.

An outcome update counts as saved only when MongoDB acknowledges it and matches exactly one usage record. A missing record is treated as a persistence failure, even if the command itself resolves successfully. Retrying an identical update is safe even if the first attempt already applied it; a zero modified count alone is not a failure.

## Why budgets belong at the gateway

The gateway controls the provider credential and the last step before a potentially billable request. Caller-side checks can be bypassed or implemented incorrectly. Enforcing quota here makes every caller follow the same policy.

## Concurrency

Two requests competing for the last reservation run a conditional single-document update. Only one can increment the counter. The real MongoDB integration check uses 20 competing reservations and verifies that only one wins. Quota reservation and usage creation are separate writes: a process failure between them can consume quota without creating a usage record.

## Redis policy

Redis is an optional fixed-window burst limit, separate from the durable total-request budget. A Lua script increments a per-key clock-minute counter and applies expiry atomically. The default is 10 requests per minute; the eleventh returns 429 with Retry-After calculated to the next minute boundary. Fixed windows can allow a double burst across a boundary; a sliding window would be smoother but requires more state.

Connection uses a URL or host/port/password, with a five-second startup connection timeout and reconnect disabled. Offline commands are not queued. Missing, disconnected, failing, or stalled Redis bypasses this optional check; command waiting is bounded to one second. MongoDB quota enforcement still runs. This explicitly favors gateway availability over guaranteed burst protection during Redis outages. The Redis client must be reconnected by restarting the service after a sustained disconnect. The one-second timeout bounds waiting, but cannot cancel a command already sent to Redis.

## Deliberate scope cuts

No polished frontend, user accounts, streaming, semantic caching, model training, multi-tenant permissions, or hard currency caps. The assignment prioritizes a working backend whose enforcement and tradeoffs can be explained. This review adds corrections to existing requirements rather than new stretch features.

## Least-certain decision

Keeping reservations consumed during failures protects against repeated billable attempts, but is unfair when inference never starts. Releasing reservations would improve fairness, yet requires careful ownership and settlement to avoid retry or concurrency abuse. I would separate total billable quota from a failure-attempt budget before implementing refunds.

## Where it breaks and one more week

Provider timeouts can cause unknown upstream spend; retries may repeat completed upstream work. Current totals include reported successful-response usage, not definitive provider invoices. Pending records require manual investigation after crashes or persistent write failures. The health endpoint is liveness only, not a guarantee of datastore or provider readiness. Admin authentication is a shared secret without a dedicated brute-force limiter. Redis is optional and fixed windows permit boundary bursts. Generated output and concurrent in-flight inference have no separate configurable caps.

Next priorities: durable usage reconciliation, request idempotency, admin rate limiting, key revocation/rotation, readiness checks, output/concurrency limits, and deployment alerts. Integration tests against a disposable local MongoDB/Redis setup would make outage tests more representative without relying on paid external services.
