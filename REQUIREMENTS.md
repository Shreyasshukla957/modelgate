# Assignment Requirements Checklist

This file maps every requirement in the RentOk Backend Intern Take-Home to a concrete project artifact and verification step.

## Core requirements

| Requirement | Implementation | Verification |
|---|---|---|
| Proxy a real LLM chat/completion call | POST /v1/chat/completions forwards a non-streaming request to a Gemini OpenAI-compatible provider | Send a real curl request after provider configuration |
| Keep provider credentials server-side | Provider key is read only from environment variables | Confirm .env is ignored and no provider key appears in response or logs |
| Issue virtual API keys | POST /v1/admin/keys creates an rk_ key and persists only its HMAC hash | Create a key and call the gateway using it |
| Enforce a per-key budget | Atomic MongoDB reservation increments requestsUsed only while it is lower than requestLimit | Use a key with a low limit; verify the next request receives 429 |
| Persist usage and spend | UsageLog records API key, model, input/output tokens, estimated cost, status, and timestamp | Call GET /v1/admin/usage with x-admin-key and x-api-key headers after a successful request |
| Handle provider failure | Retry one transient failure, optionally attempt a configured fallback model, then return a clear 502 | Test with an invalid/unavailable provider endpoint without exposing credentials |
| Deploy safely | Use environment variables in a hosted Node service and managed MongoDB | Health-check and example request against public URL |
| Explain system design | DECISIONS.md | Review against the requirements below |
| Explain AI use | AI-LOG.md | Keep the record current and honest |
| Provide a working example | README.md curl examples | Run the documented commands successfully |

## Explicit design questions to answer in DECISIONS.md

- Why a request-count budget was chosen.
- The full request lifecycle.
- Why budgets are enforced at the gateway.
- Behavior when concurrent requests use the final quota.
- Retry and fallback policy.
- Scope intentionally not built.
- The least-certain decision and both sides of it.
- Known limitations and the next-week plan.

## Scope limits

The assignment does not require a polished frontend, multi-tenant identity, model fine-tuning, or more than one optional stretch feature. The core backend, deployment, and documentation take priority.

## Reviewed version: verification and release status

The local integration run on 11 October 2026 passed real Gemini inference, MongoDB token persistence, the usage summary, and concurrent budget enforcement. Provider validation rejects malformed successful responses. Accounting creates a pending record before inference and requires an acknowledged outcome update matching one record before returning success. Persistent accounting failures remain visible as unresolved work rather than confirmed zero spend.

Tests are optional in the assignment; the existing automated checks are verification aids, not an additional mandatory deliverable. The developer authorized local commits. The reviewed version still needs push, deployment, and a repeat production check before its behavior can be claimed for the public URL. Reviewer access also requires a privately shared limited virtual key; no admin or provider credentials should be shared.

## Completion definition

The project is complete only when it builds, runs with real configuration, blocks an exhausted key, writes usage records, handles a provider failure clearly, is deployed to a public URL, and every claim in the documentation matches the final behavior.
