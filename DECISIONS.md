# Decisions

## What I built

This is a non-streaming HTTP LLM gateway built with TypeScript, Express, MongoDB, and an Gemini Gemini API compatibility endpoint. Clients call the gateway with a virtual key, not the provider credential. The gateway reserves a request against the key's quota, calls the configured model, writes a usage record, and returns the provider response.

## Request lifecycle

~~~text
Client -> POST /v1/chat/completions (x-api-key)
       -> HMAC virtual key and atomically reserve request quota in MongoDB
       -> Gemini OpenAI-compatible provider call
       -> retry once for transient errors -> optional fallback model
       -> persist token usage / estimated cost / outcome
       -> return provider response
~~~

## Key decisions

### 1. Request-count budgets

I use a hard request-count limit rather than a token or currency cap. The gateway knows whether a request is allowed before calling the provider, so it can enforce the rule exactly. Output-token cost is only known after inference, so a strict cost cap would require reserving a pessimistic maximum cost and settling it later.

### 2. Atomic quota reservation

I use one conditional findOneAndUpdate operation that only increments requestsUsed if it is still below requestLimit. This prevents two concurrent requests on a nearly exhausted key from both passing the check. Only one can reserve the final request.

### 3. Key handling

The API returns a plaintext rk_ key exactly once, then stores only an HMAC-SHA-256 hash using a server-side pepper. A database leak therefore does not reveal usable gateway keys.

### 4. Non-streaming provider calls

I chose non-streaming calls because the completed response reliably provides usage data that can be persisted alongside the request. Streaming is useful for user experience, but it adds response-forwarding and late-usage accounting complexity that is not central to this version.

### 5. Resilience policy

The gateway makes one additional attempt for transient failures such as timeouts, 429s, and 5xx responses. If a separate fallback model is configured, it tries that after the primary retries. It does not retry invalid requests or authentication failures. Failed provider attempts are logged and count against the request quota, preventing an unavailable provider from becoming an unlimited retry path.

## Why enforce budgets at the gateway?

The gateway is the last trusted service before the provider credential and billable request. A caller can be buggy, compromised, or intentionally bypass its own local check. Enforcing the limit where provider access is controlled makes the policy dependable for every client.

## Concurrency

Two simultaneous requests for a key with one request remaining run the same conditional update. MongoDB applies each single-document update atomically and re-evaluates the condition, so only one can increment the counter. The other receives a 429 before any provider call.

## Deliberate scope cuts

I did not build a polished frontend, user accounts, multi-tenant permissions, streaming, semantic caching, or a cost-based hard cap. The assignment prioritizes a small service whose security and core accounting behavior can be explained and tested.

## Least-certain decision

Counting a failed provider attempt against the quota protects the provider and avoids retry abuse, but it can feel unfair when the upstream fails. Releasing the reservation would improve fairness, but could allow repeated failures to bypass a fixed quota. In a production version I would separate billable quota from an independently rate-limited failure budget and alert on provider failures.

## With one more week

I would add key rotation and revocation, idempotency keys, structured request IDs, provider-specific adapters, a background queue for analytics, alerting, per-model allow-lists, token/cost reservations, an authenticated dashboard, and integration tests backed by ephemeral MongoDB.

## Redis rate limiting: planned production safeguard

The assignment requires a hard per-key budget: each virtual key must have a cap measured in requests, tokens, or cost, and the gateway must block requests once that cap is exhausted. The current implementation uses an atomic MongoDB request-count reservation for this requirement.

A rate limit is a separate control. It limits how quickly a valid key may send requests in a short time window, such as 10 requests per minute. It does not replace the total budget because a key can remain under a per-minute rate while eventually exceeding its total allowance.

For a production extension, I would add Redis before the MongoDB budget reservation. The gateway would atomically increment a key such as `rate-limit:<key-hash>:<minute-window>`, set a 60-second expiry, and return `429 rate_limited` when the configured threshold is exceeded. A Lua script or Redis transaction would make the increment and initial expiry atomic. MongoDB would remain the source of truth for durable budgets and usage records.

I have deliberately not added Redis to the current core because the assignment values a small, working gateway over unnecessary infrastructure. It is listed as the next hardening step after real Gemini and MongoDB integration testing.

## Redis burst rate limit

Redis rate limiting is now implemented as an optional production layer. When either `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` is configured, ModelGate uses an atomic Redis Lua script to increment a per-key counter and set its 60-second expiry in the same operation. The configured limit defaults to 10 requests per minute. A request beyond that limit returns `429 rate_limited` with `Retry-After`. MongoDB remains responsible for the durable total request budget and usage records. If Redis is intentionally not configured, the gateway continues with the required MongoDB budget enforcement only.

### Redis availability behavior

Redis is an optional burst-control layer. Startup attempts one connection with a five-second timeout and no reconnect loop. If the configured Redis service is unavailable, the application logs the condition and continues with MongoDB's atomic total-request budget, which is the assignment's required enforcement. When Redis is connected, the rate-limit middleware becomes active automatically. This makes a stale optional Redis endpoint unable to prevent the core gateway from starting, while keeping deployment failures visible in logs.