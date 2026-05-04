import { ThreetoneError } from './errors.js';

/**
 * Documented Threetone webhook event names.
 *
 * Source: https://docs.threetone.in/guides/phone-integration/webhooks
 *
 * The union is widened with `string & {}` so consumers still get autocomplete
 * on known names while remaining forward-compatible if Threetone adds events.
 */
export type ThreetoneKnownEventName =
  | 'call_started'
  | 'call_ended'
  | 'call_transferred'
  | 'agent_available'
  | 'agent_busy'
  | 'agent_offline'
  | 'conversation_started'
  | 'conversation_ended'
  | 'escalation_triggered'
  | 'system_error'
  | 'maintenance_scheduled'
  | 'quota_exceeded';

export type ThreetoneEventName = ThreetoneKnownEventName | (string & {});

/**
 * A Threetone webhook event payload.
 *
 * Threetone uses `event` as the discriminator (NOT `type`) and emits an
 * ISO 8601 string for `timestamp`. Narrow on `event` to access typed `data`.
 */
export interface ThreetoneEvent<TData = unknown> {
  /** Event-name discriminator, e.g. `call_started`. */
  event: ThreetoneEventName;
  /** ISO 8601 timestamp of when the event occurred (e.g. `2024-01-15T10:30:00Z`). */
  timestamp: string;
  /** Event-specific payload. */
  data: TData;
}

export interface VerifyWebhookOptions {
  /** Raw request body as a string. Read with `await req.text()` *before* parsing JSON. */
  payload: string;
  /**
   * The full value of the `X-ThreeTone-Signature` request header.
   * Format: `sha256=<hex_hmac_sha256>`.
   */
  signature: string;
  /** Webhook signing secret from the Threetone dashboard. */
  secret: string;
}

const HEX_RE = /^[0-9a-f]+$/i;
const SHA256_HEX_LEN = 64;
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify a Threetone webhook signature and return the parsed event.
 *
 * Threetone signs webhooks per the documented scheme:
 *   `X-ThreeTone-Signature: sha256=<hex(hmac_sha256(secret, raw_body))>`
 *
 * Uses Web Crypto so it runs unchanged on Node 20+, Cloudflare Workers,
 * Vercel Edge, Deno, Bun, and modern browsers.
 *
 * **Replay protection note:** Threetone's documented signing scheme does not
 * include a signed timestamp, so this verifier cannot detect signature replay
 * on its own. If your endpoint is exposed publicly, key an idempotency layer
 * on a payload identifier such as `data.call_id` to drop duplicates.
 *
 * @throws {ThreetoneError} on any validation failure.
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<ThreetoneEvent> {
  const { payload, signature, secret } = options;

  if (typeof secret !== 'string' || secret.length === 0) {
    throw new ThreetoneError('secret is required');
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    throw new ThreetoneError('signature header is required');
  }
  if (typeof payload !== 'string') {
    throw new ThreetoneError('payload must be a string (the raw request body)');
  }

  const digest = parseSignatureHeader(signature);
  const expected = await hmacSha256Hex(secret, payload);

  if (!timingSafeEqualHex(expected, digest)) {
    throw new ThreetoneError('Webhook signature mismatch');
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch (err) {
    throw new ThreetoneError('Webhook payload is not valid JSON', { cause: err });
  }
  if (typeof event !== 'object' || event === null) {
    throw new ThreetoneError('Webhook payload must be a JSON object');
  }
  const e = event as Record<string, unknown>;
  if (typeof e.event !== 'string') {
    throw new ThreetoneError('Webhook payload missing required `event` field (string)');
  }
  if ('timestamp' in e && typeof e.timestamp !== 'string') {
    throw new ThreetoneError('Webhook payload `timestamp` must be a string when present');
  }
  return event as ThreetoneEvent;
}

function parseSignatureHeader(header: string): string {
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith(SIGNATURE_PREFIX)) {
    throw new ThreetoneError(
      'Webhook signature header must start with `sha256=` (per Threetone signing scheme)',
    );
  }
  const digest = trimmed.slice(SIGNATURE_PREFIX.length).trim().toLowerCase();
  if (digest.length !== SHA256_HEX_LEN || !HEX_RE.test(digest)) {
    throw new ThreetoneError('Webhook signature digest must be 64 hex characters (SHA-256)');
  }
  return digest;
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return bytesToHex(new Uint8Array(sig));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
