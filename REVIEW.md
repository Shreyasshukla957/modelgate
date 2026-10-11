# Whole-codebase review

Reviewed the existing ModelGate implementation against REQUIREMENTS.md and the documented design. The scope is security, backend correctness and the assignment's required behaviors. No new stretch feature was added.

## Standards: security and correctness

- Fixed credentials in usage URLs by moving virtual keys to headers; the legacy route is removed.
- Fixed raw provider error reflection and rejected provider redirects.
- Fixed JSON parser errors returning 500 without a request ID; invalid JSON is 400 and oversized input is 413.
- Added no-store and nosniff response headers and constant-time admin secret comparison.
- Fixed runtime Redis outages causing unhandled failures, bounded command waiting and corrected Retry-After to the clock-window boundary.
- Removed the unused Vitest dependency tree: the full audit initially reported nine advisories, including three critical development dependencies; the subsequent audit reports none. This was not evidence of a deployed exploit.

## Spec: required behavior

- Fixed invalid/missing completion and token data being accepted as a zero-cost success.
- Fixed successful inference being relabelled as zero-cost failure after a usage-write error. Pending records precede inference; updates preserve outcome metadata and can safely retry once.
- Required explicit fallback prices rather than implicitly estimating configured fallback inference as free.
- Reconciled contradictory Redis documentation and updated API usage examples and tests.

## Verification

Automated regression tests exercise HTTP boundaries, inference validation, accounting failure handling, fallback, pricing and Redis policy. A real MongoDB check confirms one winner among 20 competing reservations and HTTP 429 for the exhausted key. The live Gemini integration attempt returned 502; that external integration is not claimed as passed for the new local version. Redis tests use doubles rather than a live server.

## Remaining limitations and useful next work

Pending usage is detectable but not automatically reconciled; process crashes and lost provider acknowledgments can leave unknown spend. Provider retries may duplicate upstream work. Budget reservation and usage creation are separate writes. The optional Redis layer cannot guarantee burst control during outages and fixed windows allow boundary bursts. The shared admin secret has no dedicated brute-force limit. Health reports process liveness only. Output size and concurrent in-flight provider calls have no separate caps.

Useful next features, after validating and releasing these fixes: durable usage reconciliation, idempotency, key revocation and rotation, admin throttling, readiness reporting, output/concurrency caps and alerts. These are proposals, not implemented features or assignment requirements.

Follow-up verification on 11 October 2026 passed a real local Gemini completion, MongoDB token persistence, the usage summary, and concurrent budget enforcement. Outcome updates now require acknowledgment and one matching usage record; an update matching no record returns 503 instead of success. No additional test files were introduced in this follow-up.

The developer subsequently authorized focused local commits. Push and deployment remain pending; the existing Render deployment does not include these corrections.
