# @threetone/sdk

Official TypeScript SDK for the [Threetone Labs](https://threetone.in) voice AI platform — a B2B voice AI agent platform supporting 21+ languages with deep coverage of Indic and Southeast Asian languages.

> **Status:** Pre-1.0 (`0.x`). API surface may change between minor versions until 1.0.0 is tagged.

---

## Table of contents

- [What this SDK does](#what-this-sdk-does)
- [Install](#install)
- [Quickstart](#quickstart)
- [Authentication](#authentication)
- [API surface](#api-surface)
  - [Outbound calls](#outbound-calls)
  - [Agents (CRUD)](#agents-crud)
  - [Conversations](#conversations)
  - [Batch calling](#batch-calling)
  - [Knowledge base](#knowledge-base)
  - [Tools](#tools)
  - [Voices](#voices)
  - [Phone numbers](#phone-numbers)
- [Webhook signature verification](#webhook-signature-verification)
- [Error handling](#error-handling)
- [Retry & timeout behavior](#retry--timeout-behavior)
- [Runtime support](#runtime-support)
- [How the SDK is built](#how-the-sdk-is-built)
- [Development](#development)
- [Roadmap — what's next](#roadmap--whats-next)
- [License](#license)

---

## What this SDK does

The Threetone REST API is documented as an OpenAPI 3.1 spec at `https://api.threetone.in/openapi.json`. Until now, customers have integrated by hand-rolling HTTP calls.

This SDK gives you:

1. **Typed namespace helpers** — `client.calls.outbound()`, `client.agents.list()`, `client.knowledgeBase.addText()`, and other methods for the common integration paths.
2. **Generated API types** — request bodies, query params, and response shapes are generated automatically from the live OpenAPI spec via [Hey API](https://heyapi.dev).
3. **A configured `ThreetoneClient`** — handles `Authorization` headers, request timeouts, retry-with-backoff on 429/5xx, and structured error mapping.
4. **Webhook signature verification** — hand-written using Web Crypto so it works in Node, Cloudflare Workers, Vercel Edge, Deno, Bun, and modern browsers without any Node-only imports.
5. **One ESM build** — tree-shakeable, no CJS, no transpilation surprises.

**Out of scope for v1:** real-time WebSocket streaming during a live call. That ships in v2.

---

## Install

```bash
pnpm add @threetone/sdk
# or
npm install @threetone/sdk
# or
yarn add @threetone/sdk
```

**Requirements:** Node.js 20+ or any runtime with Web Standards `fetch` and Web Crypto.

---

## Quickstart

Before placing an outbound call, copy these from the Threetone dashboard:

- API key
- Agent ID
- Phone number ID for a provisioned number

`/v1/phone-numbers/inventory` is a pricing catalog, not a list of your provisioned numbers.

```ts
import { ThreetoneClient } from '@threetone/sdk';

const threetone = new ThreetoneClient({
  apiKey: process.env.THREETONE_API_KEY!,
});

const call = await threetone.calls.outbound({
  agentId: 'agt_123',
  phoneNumberId: 'pn_123',
  toPhoneNumber: '+919999999999',
});

console.log(call.conversationId);
```

Calls are returned as conversations. Use the `conversationId` from `calls.outbound()` to fetch call status and details:

```ts
const conversation = await threetone.conversations.get(call.conversationId);
```

---

## Authentication

Threetone's docs and OpenAPI spec disagree on the header name (`x-api-key` vs `xi-api-key`); the SDK sends every documented variant on every request so any of them succeeds:

- `Authorization: Bearer <key>`
- `x-api-key: <key>`
- `xi-api-key: <key>`

Get your key from the Threetone dashboard. Do **not** ship it to the browser — use environment variables on a server or edge runtime.

```ts
const client = new ThreetoneClient({ apiKey: process.env.THREETONE_API_KEY! });
```

### Optional client config

```ts
new ThreetoneClient({
  apiKey: '...',
  baseUrl: 'https://api.threetone.in',     // default
  fetch: customFetch,                       // inject undici/MSW/workers fetch
  timeoutMs: 30_000,                        // default 30s per request
  retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 8_000 },
  defaultHeaders: { 'x-trace-id': '...' },
});
```

---

## API surface

The Threetone API exposes ~50 endpoints. v0.2 ships namespace helpers for the common integration paths and keeps `client.request(path, init)` available for lower-level access.

### Naming conventions

The SDK uses a deliberate two-layer naming scheme. Top-level namespace method parameters are camelCase, hand-designed for ergonomics. Nested objects (request bodies and response items) follow the API's snake_case shape, sourced directly from the generated types in `src/generated/`. This keeps the generated types as the single source of truth and avoids a brittle case-conversion layer.

| Layer | Convention | Example |
|---|---|---|
| Top-level method parameters | camelCase | `outbound({ agentId, phoneNumberId, toPhoneNumber })` |
| Nested request objects | snake_case (API shape) | `recipients: [{ phone_number }]`, `conversationConfig: { language }` |
| Page wrappers | camelCase | `{ data, nextCursor, hasMore }` |
| Page item shape | snake_case (API shape) | `{ agent_id, created_at_unix_secs }` |
| `calls.outbound` response | camelCase | `{ conversationId, callSid }` |

The `calls.outbound` response is the only response we transform to camelCase, because outbound calls are the most common entry point and the response is small and stable. Everything else returns the API's snake_case shape.

Nested types (`OutboundCallRecipient`, `ConversationalConfigApiModelInput`, `AgentPatchRequest`, etc.) are inferred at the call site from the namespace method signatures, so your IDE will autocomplete them without any extra imports. They are not currently re-exported by name; if you need to alias one, narrow it from the parameter type:

```ts
type Recipient = Parameters<typeof client.batch.create>[0]['recipients'][number];
```

### Null vs undefined in optional fields

When a request param accepts `T | null` (e.g. `CreateAgentParams.platformSettings`), passing `null` is equivalent to omitting the field — the SDK strips top-level `null` values from request bodies before sending. This is safer than the alternative because the API does not consistently accept literal `null` for optional fields.

If you need to clear a server-side field via PATCH (i.e. send literal `null` deliberately), use `client.agents.update(id, patch)` and pass the raw `AgentPatchRequest` shape — that path goes through unchanged.

### Outbound calls

```ts
await client.calls.outbound({
  agentId: 'agt_123',
  phoneNumberId: 'pn_123',
  toPhoneNumber: '+919999999999',
});
```

Throws `ThreetoneCallError` when the API returns HTTP 200 with `success: false`.

### Agents (CRUD)

```ts
const agents = await client.agents.list({ limit: 20 });
const agent = await client.agents.get('agt_123');
await client.agents.create({
  name: 'Support agent',
  conversationConfig: { language: 'hi' },
});
await client.agents.update('agt_123', { name: 'Updated support agent' });
await client.agents.delete('agt_123');
```

### Conversations

```ts
const page = await client.conversations.list({ agentId: 'agt_123', limit: 20 });
const conversation = await client.conversations.get('conv_123');
```

List methods return `{ data, nextCursor, hasMore }`.

### Batch calling

```ts
const batch = await client.batch.create({
  callName: 'Q2 followup',
  agentId: 'agt_123',
  recipients: [{ phone_number: '+919999999999' }],
  agentPhoneNumberId: 'pn_123',
});
await client.batch.get(batch.id);
await client.batch.cancel(batch.id);
```

### Knowledge base

```ts
const docs = await client.knowledgeBase.list({ limit: 20 });
const doc = await client.knowledgeBase.get('doc_123');
await client.knowledgeBase.addUrl({ url: 'https://docs.example.com' });
await client.knowledgeBase.addText({ text: 'FAQ content', name: 'faq.txt' });
await client.knowledgeBase.addFile({ file, name: 'manual.pdf' });
```

### Tools

Tools endpoints are available through `client.request()` in v0.2. Typed tool helpers are planned after the core calling and knowledge-base flows.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/voiceai/tools` | List tools |
| `POST` | `/v1/voiceai/tools` | Add tool |
| `GET` | `/v1/voiceai/tools/{tool_id}` | Get tool |
| `PATCH` | `/v1/voiceai/tools/{tool_id}` | Update tool |
| `DELETE` | `/v1/voiceai/tools/{tool_id}` | Delete tool |
| `GET` | `/v1/voiceai/tools/{tool_id}/dependent-agents` | List dependent agents |

### Voices

```ts
const voices = await client.voices.list();
```

### Phone numbers

```ts
const inventory = await client.phoneNumbers.inventory();
```

This returns the pricing inventory. It does not return the provisioned `phoneNumberId` required for outbound calls.

> The full typed schema for every request and response lives in `src/generated/` (generated on `pnpm build` — not committed).

---

## Webhook signature verification

```ts
import { verifyWebhook } from '@threetone/sdk/webhooks';

// Next.js App Router / Vercel Edge
export const runtime = 'edge';

export async function POST(req: Request): Promise<Response> {
  try {
    const event = await verifyWebhook({
      payload: await req.text(),
      signature: req.headers.get('x-threetone-signature') ?? '',
      secret: process.env.THREETONE_WEBHOOK_SECRET!,
    });

    switch (event.event) {
      case 'call_started':
        // handle new call
        break;
      case 'call_ended':
        // handle completion
        break;
      case 'escalation_triggered':
        // route to a human
        break;
    }
    return new Response('ok');
  } catch (err) {
    // Signature mismatch, malformed header, or invalid JSON
    return new Response((err as Error).message, { status: 400 });
  }
}
```

### Signing scheme

Threetone signs every webhook with HMAC-SHA256 over the raw request body and sends the digest in the `X-ThreeTone-Signature` header:

```
X-ThreeTone-Signature: sha256=<hex_hmac_sha256(secret, raw_body)>
```

`verifyWebhook` enforces this exact format and uses **timing-safe** comparison so signature bytes don't leak through string-comparison timing.

### Event types

The payload uses `event` (not `type`) as the discriminator and includes an ISO 8601 `timestamp` string. Documented event names:

| Category | Event names |
|---|---|
| Calls | `call_started`, `call_ended`, `call_transferred` |
| Agents | `agent_available`, `agent_busy`, `agent_offline` |
| Conversations | `conversation_started`, `conversation_ended`, `escalation_triggered` |
| System | `system_error`, `maintenance_scheduled`, `quota_exceeded` |

The `ThreetoneEventName` type accepts these known values with autocomplete plus any `string`, so future events won't break your code.

> **Replay protection note:** the documented signing scheme does not include a signed timestamp, so signature replay cannot be detected by signature alone. If your endpoint is exposed publicly, key an idempotency layer on a payload identifier (e.g. `data.call_id`) to drop duplicates.

---

## Error handling

Every non-2xx response is mapped to a typed error class:

| HTTP status | Error class |
|---|---|
| 401, 403 | `ThreetoneAuthError` |
| 400, 422 | `ThreetoneValidationError` |
| 429 | `ThreetoneRateLimitError` (includes `retryAfterMs`) |
| 5xx | `ThreetoneServerError` |
| HTTP 200 + `success: false` from `calls.outbound()` | `ThreetoneCallError` |
| Other | `ThreetoneError` (base class) |

```ts
import {
  ThreetoneClient,
  ThreetoneAuthError,
  ThreetoneCallError,
  ThreetoneRateLimitError,
} from '@threetone/sdk';

const client = new ThreetoneClient({ apiKey: process.env.THREETONE_API_KEY! });

try {
  await client.calls.outbound({
    agentId: 'agt_123',
    phoneNumberId: 'pn_123',
    toPhoneNumber: '+919999999999',
  });
} catch (err) {
  if (err instanceof ThreetoneAuthError) {
    // Bad API key
  } else if (err instanceof ThreetoneCallError) {
    // API accepted the request but could not initiate the call
  } else if (err instanceof ThreetoneRateLimitError) {
    console.log('Retry after', err.retryAfterMs, 'ms');
  }
}
```

Every error includes:
- `status` — HTTP status code
- `requestId` — value of the `x-request-id` response header (helpful for support tickets)
- `body` — the parsed response body (useful for `detail` messages)

---

## Retry & timeout behavior

By default the client retries up to **2 times** on:
- HTTP 429 (rate limited)
- HTTP 5xx for **idempotent methods only** — `GET`, `HEAD`, `DELETE`, `PUT`. POST is **not** retried by default to avoid duplicating side effects.

Backoff: exponential starting at 250 ms, capped at 8 s, with up to 25% jitter. If the server returns a `Retry-After` header, that value wins.

Every request has a **30-second timeout** by default (configurable via `timeoutMs`). User-supplied `AbortSignal`s are honored.

---

## Runtime support

| Runtime | Supported |
|---|---|
| Node.js 20+ | ✅ |
| Node.js 22, 24 | ✅ |
| Bun | ✅ |
| Deno | ✅ |
| Cloudflare Workers | ✅ |
| Vercel Edge | ✅ |
| Modern browsers (Chrome, Safari, Firefox, Edge) | ✅ |
| Node.js ≤18 | ❌ (no global `fetch`) |

The SDK uses only Web Standards APIs — `fetch`, `Headers`, `Response`, `AbortController`, `crypto.subtle`, `TextEncoder`. No `node:crypto`, no `node:http`, no `Buffer`.

---

## How the SDK is built

```
sdk/
├── spec/                       # (optional) hand-authored OpenAPI yaml — unused; we pull live
├── src/
│   ├── generated/              # ⚙️ Hey API codegen output — gitignored, regenerated on build
│   │   ├── client.gen.ts       #    fetch client config
│   │   ├── sdk.gen.ts          #    one function per endpoint
│   │   ├── types.gen.ts        #    request + response interfaces
│   │   └── schemas.gen.ts      #    runtime JSON schemas
│   ├── client.ts               # ✍️ ThreetoneClient: auth + retry + timeout + namespaces
│   ├── namespaces/             # ✍️ Ergonomic typed namespace helpers
│   ├── errors.ts               # ✍️ Typed error hierarchy
│   ├── retry.ts                # ✍️ Backoff/jitter logic
│   ├── webhooks.ts             # ✍️ Web Crypto signature verifier
│   └── index.ts                # ✍️ Public exports — controls SemVer surface
├── test/
│   ├── client.test.ts          # auth headers, error mapping, retry behavior
│   └── webhooks.test.ts        # signature accept/reject, timestamp tolerance
├── examples/
│   ├── node-outbound-call.ts   # runnable Node script
│   └── edge-webhook-handler.ts # Next.js App Router / Vercel Edge route
├── .github/workflows/
│   ├── ci.yml                  # PR: lint + typecheck + test + build + attw
│   └── release.yml             # tag push: pnpm publish with npm OIDC provenance
├── openapi-ts.config.ts        # Hey API codegen config
├── tsup.config.ts              # ESM build config
├── biome.json                  # lint + format
├── vitest.config.ts            # test runner
├── tsconfig.json               # strict TS config
└── package.json
```

### Design principles

1. **Generate everything we can.** Endpoint signatures, request shapes, response shapes — all from the live OpenAPI spec. Zero ongoing maintenance cost as the API evolves; just `pnpm generate`.
2. **Hand-write only what generation can't produce.** Auth wiring, retry logic, error mapping, webhook verification, and ergonomic naming.
3. **One ESM build, Web Standards only.** No CJS, no Node-only APIs. Same artifact runs everywhere.
4. **Public surface is controlled in `src/index.ts`.** Generated code is internal; we re-export only the types and the hand-written client. This lets us refactor generated output without breaking SemVer.

### Codegen pipeline

`pnpm generate` runs `@hey-api/openapi-ts` against `https://api.threetone.in/openapi.json` and writes typed code to `src/generated/`. The directory is `.gitignore`d and regenerated on every build, so PR diffs stay small and the generated code never drifts from the spec.

To pin against a specific spec version, set `THREETONE_OPENAPI_URL`:

```bash
THREETONE_OPENAPI_URL=https://staging.threetone.in/openapi.json pnpm generate
```

---

## Development

```bash
# Install
pnpm install

# Generate the typed client from the live OpenAPI spec
pnpm generate

# Type-check
pnpm typecheck
pnpm test:types

# Lint + format
pnpm lint
pnpm format

# Run tests
pnpm test
pnpm test:watch

# Build (runs generate + tsup)
pnpm build

# Run an example with a real key
THREETONE_API_KEY=sk_... pnpm tsx examples/node-outbound-call.ts
```

### Project conventions

- **`src/generated/` is sacred.** Never edit by hand. If you need to change generated output, change the OpenAPI spec or the Hey API config.
- **Public exports go through `src/index.ts`.** Anything not re-exported there is internal and may change without a SemVer bump.
- **No CJS.** ESM-only. We support modern runtimes; if a customer needs CJS we'll revisit.
- **No Node-only imports** in any `src/` file. Use `globalThis.crypto`, `fetch`, `TextEncoder`, etc.

---

## Roadmap — what's next

This is the realistic path to v1.0. Tackle in order; later steps build on earlier ones.

### Step 1 — End-to-end test webhook verification with a real Threetone webhook (15 min)

The signing scheme is implemented per the [Threetone docs](https://docs.threetone.in/guides/phone-integration/webhooks): `X-ThreeTone-Signature: sha256=<hex>` over the raw body. Confirm by:

1. Configure a webhook in the Threetone dashboard pointing at a tunneled endpoint (ngrok, etc.).
2. Trigger a real `call_started` event.
3. Run `verifyWebhook` against the live signature; it should accept.
4. Tamper with one byte; it should reject.

If anything is off, the spec/docs may have drifted — file an issue.

### Step 2 — Claim the `@threetone` npm scope (10 min)

1. Sign in at npmjs.com as a user who'll own the org.
2. Create a new organization named `threetone`.
3. Generate an npm access token (Automation type) for CI publishes.
4. Add it to GitHub repo secrets as `NPM_TOKEN`.

This unblocks publish and prevents anyone from squatting the name.

### Step 3 — Push to GitHub & enable CI (5 min)

```bash
git remote add origin https://github.com/lamenting-hawthorn/threetone-sdk.git
git push -u origin main
```

The CI workflow runs automatically on every PR and push to `main` — lint, typecheck, build, test, and `attw` (Are The Types Wrong?) check.

### Step 4 — Smoke-test against a real API key (10 min)

```bash
THREETONE_API_KEY=sk_real \
THREETONE_AGENT_ID=agt_real \
THREETONE_TO_NUMBER=+919999999999 \
pnpm tsx examples/node-outbound-call.ts
```

Validates the live spec matches reality, the auth headers work, and timeouts/retries don't fire spuriously.

### Step 5 — Upgrade Hey API to the latest (30 min)

Currently pinned to `@hey-api/openapi-ts@^0.64.0`. v0.73+ bundles the fetch client into the codegen package itself, so:

```bash
pnpm add -D @hey-api/openapi-ts@latest
pnpm remove @hey-api/client-fetch
pnpm generate
pnpm build
pnpm test
```

The codegen config may need minor tweaks — Hey API renamed a few plugin entries between 0.64 and 0.97. If anything breaks, the error usually points at `openapi-ts.config.ts`.

### Step 6 — Expand namespace coverage

v0.2 includes the core calling, agent, conversation, batch, knowledge-base, voice, and phone-number inventory helpers. Next namespace candidates are tools, conversation export/audio download, knowledge-base update/delete/move/RAG helpers, and batch retry/list helpers.

### Step 7 — Add Changesets for versioning (15 min)

```bash
pnpm add -D @changesets/cli
pnpm changeset init
```

Every PR adds a changeset describing the change; merging produces a "Version Packages" PR; merging that publishes. Removes manual CHANGELOG drudgery.

### Step 8 — Publish v0.2.0 to npm

```bash
git tag v0.2.0
git push origin v0.2.0
```

The release workflow builds, tests, and publishes with npm OIDC provenance. No long-lived tokens.

### Step 9 — Add docs site (TypeDoc → GitHub Pages)

```bash
pnpm add -D typedoc
pnpm typedoc src/index.ts --out docs
```

Push to `gh-pages` branch in CI on every release. Auto-generated API reference, zero maintenance.

### Step 10 — v1.0: live call streaming (multi-week)

WebSocket-based bidirectional audio + transcript streaming during a live call. The OpenAPI spec already enumerates `ClientEvent` types (audio, user_transcript, agent_response, vad_score, dtmf_request, etc.) — we wrap a `WebSocket` connection, frame events, and expose an `EventEmitter`-style API. Out of scope for 0.x.

---

## License

MIT © Threetone Labs
