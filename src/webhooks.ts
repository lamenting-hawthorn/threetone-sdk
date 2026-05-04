import { ThreetoneError } from './errors.js';

/**
 * A Threetone webhook event. The `type` discriminator and `data` payload
 * are defined by the platform's `ConvAIWebhooks` schema; consumers should
 * narrow on `type` to access typed `data`.
 */
export interface ThreetoneEvent<T = unknown> {
  type: string;
  data: T;
  timestamp?: number;
}

export interface VerifyWebhookOptions {
  /** Raw request body as a string. Read with `await req.text()` *before* JSON parsing. */
  payload: string;
  /**
   * The full value of the Threetone signature header (typically `x-threetone-signature`).
   * Format: `t=<unix_seconds>,v1=<hex_hmac_sha256>`.
   */
  signature: string;
  /** Webhook signing secret from the Threetone dashboard. */
  secret: string;
  /** Maximum allowed clock skew in seconds. Default 300 (5 minutes). Must be ≥ 0 and finite. */
  toleranceSec?: number;
  /**
   * If true, accept signatures that are a bare hex digest (no timestamp).
   * **Off by default** because bare-hex signatures cannot be replay-protected.
   */
  allowBareHex?: boolean;
}

const HEX_RE = /^[0-9a-f]+$/i;
const SHA256_HEX_LEN = 64;

/**
 * Verify a Threetone webhook signature and return the parsed event.
 *
 * Uses Web Crypto so it runs unchanged on Node 20+, Cloudflare Workers,
 * Vercel Edge, Deno, Bun, and modern browsers.
 *
 * **Security:**
 * - Timing-safe HMAC comparison.
 * - Rejects timestamps outside `toleranceSec` to prevent replay.
 * - Rejects malformed signature headers without falling back to a weaker mode.
 * - Bare-hex signatures (no timestamp) are rejected unless `allowBareHex: true`.
 *
 * @throws {ThreetoneError} on any validation failure.
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<ThreetoneEvent> {
  const { payload, signature, secret } = options;
  const toleranceSec = options.toleranceSec ?? 300;
  const allowBareHex = options.allowBareHex ?? false;

  if (!Number.isFinite(toleranceSec) || toleranceSec < 0) {
    throw new ThreetoneError('toleranceSec must be a non-negative finite number');
  }
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new ThreetoneError('secret is required');
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    throw new ThreetoneError('signature header is required');
  }
  if (typeof payload !== 'string') {
    throw new ThreetoneError('payload must be a string (the raw request body)');
  }

  const parsed = parseSignatureHeader(signature, allowBareHex);

  if (parsed.timestamp !== undefined) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - parsed.timestamp) > toleranceSec) {
      throw new ThreetoneError('Webhook timestamp outside tolerance window');
    }
  }

  const signedPayload = parsed.timestamp !== undefined ? `${parsed.timestamp}.${payload}` : payload;
  const expected = await hmacSha256Hex(secret, signedPayload);

  if (!timingSafeEqualHex(expected, parsed.digest)) {
    throw new ThreetoneError('Webhook signature mismatch');
  }

  let event: ThreetoneEvent;
  try {
    event = JSON.parse(payload) as ThreetoneEvent;
  } catch (err) {
    throw new ThreetoneError('Webhook payload is not valid JSON', { cause: err });
  }
  if (typeof event !== 'object' || event === null || typeof event.type !== 'string') {
    throw new ThreetoneError('Webhook payload missing required `type` field');
  }
  return event;
}

interface ParsedSignature {
  timestamp: number | undefined;
  digest: string;
}

function parseSignatureHeader(header: string, allowBareHex: boolean): ParsedSignature {
  const trimmed = header.trim();
  // Stripe-style "t=...,v1=..." header.
  if (trimmed.includes('=') && trimmed.includes(',')) {
    let timestamp: number | undefined;
    let digest: string | undefined;
    for (const part of trimmed.split(',')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!key || !value) continue;
      if (key === 't') {
        if (!/^\d+$/.test(value)) {
          throw new ThreetoneError('Webhook signature: timestamp `t` must be an integer');
        }
        timestamp = Number(value);
        if (!Number.isFinite(timestamp) || timestamp < 0) {
          throw new ThreetoneError('Webhook signature: timestamp `t` must be non-negative');
        }
      } else if (key === 'v1') {
        digest = value.toLowerCase();
      }
    }
    if (timestamp === undefined || digest === undefined) {
      throw new ThreetoneError('Webhook signature: header must include both `t` and `v1`');
    }
    if (digest.length !== SHA256_HEX_LEN || !HEX_RE.test(digest)) {
      throw new ThreetoneError('Webhook signature: `v1` must be a 64-char hex SHA-256 digest');
    }
    return { timestamp, digest };
  }
  // Bare hex digest (opt-in, no replay protection).
  if (!allowBareHex) {
    throw new ThreetoneError(
      'Webhook signature: header must be `t=...,v1=...`. Pass `allowBareHex: true` to accept bare digests.',
    );
  }
  const digest = trimmed.toLowerCase();
  if (digest.length !== SHA256_HEX_LEN || !HEX_RE.test(digest)) {
    throw new ThreetoneError('Webhook signature: bare digest must be a 64-char hex SHA-256');
  }
  return { timestamp: undefined, digest };
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
