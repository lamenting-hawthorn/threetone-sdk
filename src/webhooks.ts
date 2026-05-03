import { ThreetoneError } from './errors.js';

/**
 * Threetone webhook event. The exact `type` discriminator and payload shape is
 * defined by the platform's `ConvAIWebhooks` schema; until that's wired through
 * the generated types, we expose a structural interface and let users narrow.
 */
export interface ThreetoneEvent<T = unknown> {
  type: string;
  data: T;
  timestamp?: number;
  [key: string]: unknown;
}

export interface VerifyWebhookOptions {
  payload: string;
  signature: string;
  secret: string;
  /** Maximum allowed clock skew, in seconds. Default 300 (5 minutes). */
  toleranceSec?: number;
}

/**
 * Verify a Threetone webhook signature and return the parsed event.
 *
 * Uses Web Crypto so it works in Node 20+, Cloudflare Workers, Vercel Edge,
 * Deno, Bun, and modern browsers.
 *
 * Signature header format expected (subject to confirmation with Threetone backend):
 *   `t=<unix_seconds>,v1=<hex_hmac_sha256>`
 *
 * If your deployment uses a different format, pass a pre-extracted hex digest
 * as `signature` and an empty `payload` prefix; or open an issue.
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<ThreetoneEvent> {
  const { payload, signature, secret } = options;
  const toleranceSec = options.toleranceSec ?? 300;

  const parsed = parseSignatureHeader(signature);

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

function parseSignatureHeader(header: string): ParsedSignature {
  // Stripe-style "t=...,v1=..." header
  if (header.includes('=') && header.includes(',')) {
    let timestamp: number | undefined;
    let digest: string | undefined;
    for (const part of header.split(',')) {
      const [k, v] = part.split('=', 2);
      if (!k || !v) continue;
      if (k.trim() === 't') {
        const parsed = Number(v);
        if (Number.isFinite(parsed)) timestamp = parsed;
      } else if (k.trim() === 'v1') {
        digest = v.trim();
      }
    }
    if (digest) return { timestamp, digest };
  }
  // Fallback: bare hex digest
  return { timestamp: undefined, digest: header.trim() };
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
