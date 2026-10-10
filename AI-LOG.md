# AI-LOG

This file is maintained while the project is built. It records how AI assistance was used and what was independently reviewed or changed.

## 1. Requirement analysis

I used Codex to read the supplied take-home PDF and turn it into an implementation checklist. The non-negotiable requirements identified were: a real LLM proxy, gateway-issued virtual keys, actual per-key budget blocking, persisted usage and estimated spend, resilience behavior, deployment, and the two explanation documents.

I chose not to build a frontend because the brief explicitly says UI is not being scored.

## 2. Research

I used Codex to research official documentation for LLM request usage fields, MongoDB single-document atomic updates, Express error handling, and deployment secret handling. This research informed the choice of a non-streaming Gemini OpenAI-compatible chat endpoint and a request-count quota.

## 3. Architecture selection

I selected TypeScript, Node.js, Express, MongoDB, and Mongoose because they match my existing full-stack experience and keep the service small enough for a weekend. The project is organized into routes, models, and services so that provider calls, budget logic, and key handling are separate.

## 4. Virtual keys and secrets

The first generated design stored the raw gateway key in the database for convenience. I rejected that design. The final implementation returns a plaintext gateway key once, then stores only an HMAC-SHA-256 hash using a server-side pepper.

Provider credentials, the admin key, database URI, and key pepper are read from environment variables. They are listed in .env.example and excluded from Git.

## 5. Budget and concurrency design

I used Codex to draft the quota logic, then reviewed the race condition where two requests see one available request at the same time. I changed the approach from “read the count, then increment it” to one conditional MongoDB findOneAndUpdate operation. It increments usage only when requestsUsed is below requestLimit.

This creates a request reservation before calling the provider. If no key can be updated, the API rejects the request with a 429 response before it reaches the provider.

## 6. Provider and resilience behavior

The gateway sends a non-streaming chat-completion request to an Gemini OpenAI-compatible endpoint. It retries one time for retryable upstream errors such as timeout, 429, and 5xx responses. If a different fallback model is configured, it tries that model after the primary retry.

A successful call records tokens and estimated cost. A failed provider call records a failure entry. Failed attempts count against the request quota; this avoids an unlimited retry path during an upstream outage.

## 7. Documentation created

- README.md: local setup, API examples, and deployment guidance.
- DECISIONS.md: lifecycle, tradeoffs, concurrency behavior, deliberate scope cuts, limitations, and future work.
- AI-LOG.md: this honest record of AI assistance and engineering review.

## 8. Verification completed so far

- TypeScript compilation completed successfully with tsc.
- The cost calculation and retry-status policy were checked with a Node.js assertion script.

## 9. Remaining build steps

1. Create a MongoDB database and configure environment variables.
2. Run the service locally.
3. Create a real gateway key through the admin endpoint.
4. Call the LLM endpoint with a real provider key.
5. Confirm usage logging and budget exhaustion behavior.
6. Deploy the service and run the same verification against the public URL.
7. Update this file and DECISIONS.md with the exact deployed URL, test evidence, and any changes made during integration testing.

## How I stayed in control

I did not treat generated code as complete without review. I checked the boundary where secrets enter the application, the order of quota reservation and provider calls, and the error paths that record usage. Any deployed version will be tested with real credentials before submission.

## 10. Observability update

I added a generated request ID to every gateway response and usage record. This allows a provider error, client response, and database entry to be correlated during debugging without logging a client key or provider secret. The TypeScript build was run again after this change.

## 11. Configuration structure

I aligned the project with the MailRise backend convention by separating configuration into a config folder. `config/index.ts` validates required environment variables, while `config/db.ts` owns the Mongoose connection. This keeps application startup, environment validation, and database setup separate. The temporary local environment file was removed; runtime configuration will be added by the developer before integration testing. The TypeScript build passed after this refactor.

## 12. Controller layer

I moved HTTP request handling into separate admin and completion controllers. Route files now only declare paths and middleware, while controllers validate requests, coordinate key and budget checks, call services, persist usage records, and format HTTP responses. This follows the MailRise route/controller/service separation while retaining the gateway-specific atomic quota reservation. The TypeScript build passed after the refactor.

## 13. Automated policy tests

I added Node.js built-in tests for estimated token-cost calculations and provider error behavior. The tests verify that transient provider failures receive one retry, non-recoverable errors do not retry, and input/output pricing is calculated independently. All four tests passed. Database-backed tests for virtual-key creation, atomic quota exhaustion, and usage aggregation remain part of the configured integration-test stage because they require a local MongoDB URI.

## 14. Gemini adapter hardening

I made the provider adapter explicitly validate the successful OpenAI-compatible Gemini response shape before reading token usage. I also added provider error extraction that handles Gemini error payloads returned as either an object or an array. This preserves useful upstream error messages while the gateway still returns a safe 502 response to clients. All four automated tests passed after the change. The README now includes the ordered integration checklist to run after a local environment file is added.

## 15. Deployment readiness

I added a Render Blueprint configuration, a health-check endpoint declaration, Node 20 deployment configuration, and environment-variable placeholders for every secret. The server now handles SIGINT and SIGTERM by stopping HTTP intake and disconnecting from MongoDB before it exits. The default Gemini 3.8 Flash cost estimate is configured from the documented current standard paid rates and remains configurable through environment variables. The TypeScript build and all four automated tests passed after these changes.

## 16. Project relocation verification

The project was moved to the Projects folder and renamed ModelGate. Because the local dependency links became stale after relocation, I recreated node_modules from the lockfile. I then reran the TypeScript build and all four automated tests; they passed in the renamed project directory.

## 17. Redis rate-limit decision

I separated the assignment's required per-key budget from a short-window rate limit. MongoDB already enforces the durable request-count budget atomically. Redis is planned as an additional production safeguard for burst control, using an atomic per-key counter with a TTL. It is documented in DECISIONS.md but not claimed as implemented, because adding another managed dependency before the core Gemini and MongoDB flow is verified would expand scope without proving the primary requirement.

## 18. Redis rate-limit implementation

I implemented the previously documented Redis rate-limit extension. It is optional so local development and the assignment core do not require a second datastore. When configured, Redis connects at startup and ModelGate rejects burst traffic before reserving MongoDB budget. A Lua script makes the counter increment and first-expiry assignment atomic. The TypeScript build and all four existing automated tests passed after the dependency and code changes.

## 19. Redis connection compatibility and availability

I updated Redis configuration to support either a standard `REDIS_URL` or the host, port, and password format used by the existing Codix project. I inspected the Codix connection configuration and found that its configured hostname no longer resolved in DNS during this build. I therefore changed startup to try Redis once with a five-second timeout and no reconnect loop. If it cannot connect, ModelGate clearly logs the condition and continues with its required MongoDB atomic request budget. When a reachable Redis service is configured, the existing Lua-backed burst rate limit is enabled automatically. This avoids treating an optional rate-limit service as a reason to make the entire gateway unavailable.
## 20. Live integration verification

I configured local ModelGate environment values from the existing MailRise MongoDB and Gemini configuration, without copying credentials into project documentation. I configured Redis using the existing Codix host, port, and password format. The Codix Redis hostname did not resolve, so startup correctly logged the unavailable optional dependency and continued with MongoDB budgets.

Live checks completed on 10 October 2026:

- `GET /health` returned `200` with `{ "status": "ok" }`.
- A virtual key was created through the protected admin endpoint.
- A real Gemini 3.8 Flash completion returned `200` with `ModelGate ready.` through the gateway.
- Gemini later produced transient timeouts, which the gateway returned as safe `502 provider_unavailable` responses and logged as failed usage records.
- A separate key with a limit of two produced request statuses `502`, `502`, then `429`. Its database summary reported `requestsUsed: 2` and two persisted usage records. This confirms the third request was blocked by the atomic MongoDB budget before another provider call.

The configured Gemini account reports that `gemini-2.5-flash` is unavailable to new users and directs new requests to `gemini-3.8-flash`; ModelGate therefore retains Gemini 3.8 Flash as its default. The optional Redis rate-limit path compiles and is ready for a reachable managed Redis endpoint, but could not be live-tested with the stale Codix endpoint.
## 21. Final local verification guide

I added `TESTING.md` so a reviewer can repeat the automated and local API checks without seeing credentials. I verified that `.env.example` contains every configuration variable used by the application and contains placeholders rather than credential-shaped values. I then reran the TypeScript build and all four automated tests successfully. Finally, I ran the provider adapter with an unreachable local base URL; it returned the expected retryable provider error, which the HTTP controller maps to a safe 502 response. Public deployment and live Redis rate-limit verification remain environment-dependent because no hosting deployment or reachable Redis service is configured in this workspace.