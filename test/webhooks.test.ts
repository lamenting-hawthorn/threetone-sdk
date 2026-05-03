import { describe, it, expect } from 'vitest';
import { verifyWebhook } from '../src/webhooks.js';
import { ThreetoneError } from '../src/errors.js';

async function sign(secret: string, signedPayload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const secret = 'whsec_test';

describe('verifyWebhook', () => {
  it('accepts a valid timestamped signature', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: { id: 'c1' } });
    const t = Math.floor(Date.now() / 1000);
    const digest = await sign(secret, `${t}.${payload}`);
    const event = await verifyWebhook({
      payload,
      signature: `t=${t},v1=${digest}`,
      secret,
    });
    expect(event.type).toBe('call.completed');
  });

  it('rejects a tampered payload', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: { id: 'c1' } });
    const t = Math.floor(Date.now() / 1000);
    const digest = await sign(secret, `${t}.${payload}`);
    await expect(
      verifyWebhook({
        payload: payload.replace('c1', 'c2'),
        signature: `t=${t},v1=${digest}`,
        secret,
      }),
    ).rejects.toBeInstanceOf(ThreetoneError);
  });

  it('rejects an old timestamp', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: {} });
    const t = Math.floor(Date.now() / 1000) - 10_000;
    const digest = await sign(secret, `${t}.${payload}`);
    await expect(
      verifyWebhook({ payload, signature: `t=${t},v1=${digest}`, secret, toleranceSec: 300 }),
    ).rejects.toThrow(/tolerance/);
  });

  it('accepts a bare hex digest as fallback', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: {} });
    const digest = await sign(secret, payload);
    const event = await verifyWebhook({ payload, signature: digest, secret });
    expect(event.type).toBe('call.completed');
  });
});
