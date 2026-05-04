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

1. **Typed access to every endpoint** — generated automatically from the live OpenAPI spec via [Hey API](https://heyapi.dev). Request bodies, query params, and response shapes are all type-checked at compile time.
2. **A configured `ThreetoneClient`** — handles `Authorization` headers, request timeouts, retry-with-backoff on 429/5xx, and structured error mapping.
3. **Webhook signature verification** — hand-written using Web Crypto so it works in Node, Cloudflare Workers, Vercel Edge, Deno, Bun, and modern browsers without any Node-only imports.
4. **One ESM build** — compact (~12 KB main + ~3 KB webhooks), tree-shakeable, no CJS, no transpilation surprises.

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

```ts
import { ThreetoneClient } from '@threetone/sdk';

const threetone = new ThreetoneClient({
  apiKey: process.env.THREETONE_API_KEY!,
});

// Initiate an outbound call
const res = await threetone.request('/v1/voiceai/outbound-call', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    agent_id: 'agt_123',
    to_number: '+919999999999',
  }),
});
const data = await res.json();
console.log(data);
```

> **Note:** v0.1.0 exposes the low-level `client.request()` only. Typed namespaces (`client.agents.list()`, `client.calls.outbound()`, etc.) ship in v0.2 — see [roadmap](#roadmap--whats-next).

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

The Threetone API exposes ~50 endpoints. Below is the complete map, generated from the live OpenAPI spec. In v0.1.0 you call these via `client.request(path, init)`. Typed wrappers land in v0.2.

### Outbound calls

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/voiceai/outbound-call` | Initiate an outbound call |

### Agents (CRUD)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/convai/agents/create` | Create agent |
| `GET` | `/v1/convai/agents` | List agents |
| `GET` | `/v1/convai/agents/{agent_id}` | Get agent |
| `PATCH` | `/v1/convai/agents/{agent_id}` | Update agent |
| `DELETE` | `/v1/convai/agents/{agent_id}` | Delete agent |
| `GET` | `/v1/convai/agents/{agent_id}/widget` | Get widget |
| `POST` | `/v1/convai/agents/{agent_id}/avatar` | Upload widget avatar |

### Conversations

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/voiceai/conversations` | List conversations |
| `GET` | `/v1/voiceai/conversations/export` | Export conversations as CSV |
| `GET` | `/v1/voiceai/conversations/token` | Get conversation token |
| `GET` | `/v1/voiceai/conversations/{conversation_id}` | Get conversation details |
| `DELETE` | `/v1/voiceai/conversations/{conversation_id}` | Delete conversation |
| `GET` | `/v1/voiceai/conversations/{conversation_id}/audio` | Download audio |

### Batch calling

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/voiceai/batch-calling/submit` | Submit batch |
| `GET` | `/v1/voiceai/batch-calling/workspace` | List workspace batches |
| `GET` | `/v1/voiceai/batch-calling/{batch_id}` | Get batch |
| `DELETE` | `/v1/voiceai/batch-calling/{batch_id}` | Delete batch |
| `POST` | `/v1/voiceai/batch-calling/{batch_id}/cancel` | Cancel batch |
| `POST` | `/v1/voiceai/batch-calling/{batch_id}/retry` | Retry batch |

### Knowledge base

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/voiceai/knowledge-base` | List documents |
| `POST` | `/v1/voiceai/knowledge-base/url` | Create URL document |
| `POST` | `/v1/voiceai/knowledge-base/text` | Create text document |
| `POST` | `/v1/voiceai/knowledge-base/file` | Create file document |
| `POST` | `/v1/voiceai/knowledge-base/folder` | Create folder |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}` | Get document |
| `PATCH` | `/v1/voiceai/knowledge-base/{document_id}` | Update document |
| `DELETE` | `/v1/voiceai/knowledge-base/{document_id}` | Delete document |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}/content` | Get document content |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}/source-file-url` | Get source-file URL |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}/size` | Get document size |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}/chunk/{chunk_id}` | Get chunk |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}/dependent-agents` | List dependent agents |
| `POST` | `/v1/voiceai/knowledge-base/{document_id}/move` | Move to folder |
| `POST` | `/v1/voiceai/knowledge-base/bulk-move` | Bulk move |
| `GET` | `/v1/voiceai/knowledge-base/rag-index` | RAG index overview |
| `POST` | `/v1/voiceai/knowledge-base/rag-index` | Compute RAG indexes (batch) |
| `POST` | `/v1/voiceai/knowledge-base/{document_id}/rag-index` | Compute RAG index |
| `GET` | `/v1/voiceai/knowledge-base/{document_id}/rag-index` | List RAG indexes |
| `DELETE` | `/v1/voiceai/knowledge-base/{document_id}/rag-index/{rag_index_id}` | Delete RAG index |
| `GET` | `/v1/voiceai/knowledge-base/summaries` | Get summaries by IDs |

### Tools

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/voiceai/tools` | List tools |
| `POST` | `/v1/voiceai/tools` | Add tool |
| `GET` | `/v1/voiceai/tools/{tool_id}` | Get tool |
| `PATCH` | `/v1/voiceai/tools/{tool_id}` | Update tool |
| `DELETE` | `/v1/voiceai/tools/{tool_id}` | Delete tool |
| `GET` | `/v1/voiceai/tools/{tool_id}/dependent-agents` | List dependent agents |

### Voices

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/voices` | List available voices |
| `GET` | `/v1/voices/{voice_id}` | Get voice |

### Phone numbers

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/phone-numbers/inventory` | Get phone-number inventory |

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
| Other | `ThreetoneError` (base class) |

```ts
import {
  ThreetoneClient,
  ThreetoneAuthError,
  ThreetoneRateLimitError,
} from '@threetone/sdk';

try {
  await client.request('/v1/convai/agents');
} catch (err) {
  if (err instanceof ThreetoneAuthError) {
    // Bad API key
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
│   ├── client.ts               # ✍️ ThreetoneClient: auth + retry + timeout + error mapping
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
2. **Hand-write only what generation can't produce.** Auth wiring, retry logic, error mapping, webhook verification, ergonomic naming. ~250 LOC total.
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

### Step 6 — Add the ergonomic typed surface (1–2 hours)

Replace `client.request('/v1/voiceai/outbound-call', ...)` with named, fully-typed methods:

```ts
// What we want users to write:
await client.calls.initiateOutbound({ body: { agent_id, to_number } });
await client.agents.list();
await client.agents.get({ path: { agent_id } });
await client.knowledgeBase.createUrl({ body: { url } });
```

Mechanically: in `src/client.ts`, import each generated SDK function from `src/generated/sdk.gen.ts`, bind them to a configured Hey API client instance, and group by tag (`agents`, `calls`, `conversations`, `knowledgeBase`, `tools`, `voices`, `phoneNumbers`, `batchCalling`).

This is a v0.2 release.

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
