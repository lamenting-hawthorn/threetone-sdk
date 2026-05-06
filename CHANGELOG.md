# Changelog

## 0.2.0 - 2026-05-06

- Added namespace-first helpers on `ThreetoneClient`: `calls`, `conversations`, `agents`, `batch`, `knowledgeBase`, `voices`, and `phoneNumbers`.
- Added `ThreetoneCallError` for outbound-call responses that return HTTP 200 with `success: false`.
- Updated the outbound-call example and README to use `client.calls.outbound()` with the required `phoneNumberId`.
- Added namespace unit tests and example type-checking.
