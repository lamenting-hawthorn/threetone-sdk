# Changelog

## 0.2.1 - 2026-05-06

- Fixed `parseJson` and `parseOptionalJson` to wrap malformed-JSON failures in `ThreetoneError` instead of leaking raw `SyntaxError`.
- Strip top-level `null` values from request bodies in `agents.create` and `batch.create`. Passing `null` for a nullable field is now equivalent to omitting it.
- Added namespace-level error-path tests (404, 422, 429) and an empty-204 test for `agents.delete`.
- Documented the camelCase/snake_case convention boundary, the null-stripping policy, and the phone-number inventory caveat in the README.

## 0.2.0 - 2026-05-06

- Added namespace-first helpers on `ThreetoneClient`: `calls`, `conversations`, `agents`, `batch`, `knowledgeBase`, `voices`, and `phoneNumbers`.
- Added `ThreetoneCallError` for outbound-call responses that return HTTP 200 with `success: false`.
- Updated the outbound-call example and README to use `client.calls.outbound()` with the required `phoneNumberId`.
- Added namespace unit tests and example type-checking.
