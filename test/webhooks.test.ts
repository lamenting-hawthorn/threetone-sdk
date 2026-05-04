import { describe, expect, it } from 'vitest';
import { ThreetoneError } from '../src/errors.js';
import { verifyWebhook } from '../src/webhooks.js';

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

describe('verifyWebhook — happy path', () => {
  it('accepts a valid timestamped signature', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: { id: 'c1' } });
    const t = Math.floor(Date.now() / 1000);
    const digest = await sign(secret, `${t}.${payload}`);
    const event = await verifyWebhook({ payload, signature: `t=${t},v1=${digest}`, secret });
    expect(event.type).toBe('call.completed');
  });

  it('accepts a bare hex digest only when allowBareHex is true', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: {} });
    const digest = await sign(secret, payload);
    const event = await verifyWebhook({
      payload,
      signature: digest,
      secret,
      allowBareHex: true,
    });
    expect(event.type).toBe('call.completed');
  });
});

describe('verifyWebhook — security', () => {
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
      verifyWebhook({
        payload,
        signature: `t=${t},v1=${digest}`,
        secret,
        toleranceSec: 300,
      }),
    ).rejects.toThrow(/tolerance/);
  });

  it('rejects bare hex by default (no replay protection)', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: {} });
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: digest, secret })).rejects.toThrow(
      /allowBareHex/,
    );
  });
});

describe('verifyWebhook — malformed headers', () => {
  it('rejects header with only v1 and no t', async () => {
    const payload = '{"type":"x","data":{}}';
    const digest = await sign(secret, payload);
    await expect(
      verifyWebhook({ payload, signature: `v1=${digest},foo=bar`, secret }),
    ).rejects.toThrow(/must include both/);
  });

  it('rejects header with t= empty value (downgrade attempt)', async () => {
    const payload = '{"type":"x","data":{}}';
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `t=,v1=${digest}`, secret })).rejects.toThrow(
      /must include both/,
    );
  });

  it('rejects non-integer timestamp', async () => {
    const payload = '{"type":"x","data":{}}';
    const digest = await sign(secret, payload);
    await expect(
      verifyWebhook({ payload, signature: `t=abc,v1=${digest}`, secret }),
    ).rejects.toThrow(/timestamp/);
  });

  it('rejects non-hex digest', async () => {
    await expect(
      verifyWebhook({ payload: '{}', signature: 't=1,v1=ZZZZ', secret }),
    ).rejects.toThrow(/hex/);
  });

  it('rejects wrong-length digest', async () => {
    await expect(
      verifyWebhook({ payload: '{}', signature: 't=1,v1=abcd', secret }),
    ).rejects.toThrow(/64-char/);
  });

  it('tolerates extra whitespace around keys/values', async () => {
    const payload = JSON.stringify({ type: 'call.completed', data: {} });
    const t = Math.floor(Date.now() / 1000);
    const digest = await sign(secret, `${t}.${payload}`);
    const event = await verifyWebhook({
      payload,
      signature: ` t = ${t} , v1 = ${digest} `,
      secret,
    });
    expect(event.type).toBe('call.completed');
  });
});

describe('verifyWebhook — input validation', () => {
  it('rejects negative toleranceSec', async () => {
    await expect(
      verifyWebhook({
        payload: '{}',
        signature: `t=1,v1=${'a'.repeat(64)}`,
        secret,
        toleranceSec: -1,
      }),
    ).rejects.toThrow(/toleranceSec/);
  });

  it('rejects empty secret', async () => {
    await expect(
      verifyWebhook({ payload: '{}', signature: `t=1,v1=${'a'.repeat(64)}`, secret: '' }),
    ).rejects.toThrow(/secret/);
  });

  it('rejects empty signature', async () => {
    await expect(verifyWebhook({ payload: '{}', signature: '', secret })).rejects.toThrow(
      /signature/,
    );
  });
});
