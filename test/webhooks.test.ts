import { describe, expect, it } from 'vitest';
import { ThreetoneError } from '../src/errors.js';
import { verifyWebhook } from '../src/webhooks.js';

async function sign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const secret = 'whsec_test';

function fixturePayload(): string {
  return JSON.stringify({
    event: 'call_started',
    timestamp: '2024-01-15T10:30:00Z',
    data: { call_id: 'call_abc123', phone_number: '+1234567890' },
  });
}

describe('verifyWebhook — happy path', () => {
  it('accepts a valid sha256= signature', async () => {
    const payload = fixturePayload();
    const digest = await sign(secret, payload);
    const event = await verifyWebhook({
      payload,
      signature: `sha256=${digest}`,
      secret,
    });
    expect(event.event).toBe('call_started');
    expect(event.timestamp).toBe('2024-01-15T10:30:00Z');
    expect((event.data as { call_id: string }).call_id).toBe('call_abc123');
  });

  it('accepts uppercase hex digest', async () => {
    const payload = fixturePayload();
    const digest = (await sign(secret, payload)).toUpperCase();
    const event = await verifyWebhook({ payload, signature: `sha256=${digest}`, secret });
    expect(event.event).toBe('call_started');
  });

  it('tolerates leading/trailing whitespace in the header', async () => {
    const payload = fixturePayload();
    const digest = await sign(secret, payload);
    const event = await verifyWebhook({
      payload,
      signature: `   sha256=${digest}   `,
      secret,
    });
    expect(event.event).toBe('call_started');
  });
});

describe('verifyWebhook — security', () => {
  it('rejects a tampered payload', async () => {
    const payload = fixturePayload();
    const digest = await sign(secret, payload);
    await expect(
      verifyWebhook({
        payload: payload.replace('call_abc123', 'call_xyz999'),
        signature: `sha256=${digest}`,
        secret,
      }),
    ).rejects.toBeInstanceOf(ThreetoneError);
  });

  it('rejects a wrong secret', async () => {
    const payload = fixturePayload();
    const digest = await sign('different_secret', payload);
    await expect(verifyWebhook({ payload, signature: `sha256=${digest}`, secret })).rejects.toThrow(
      /mismatch/,
    );
  });

  it('rejects bare hex (no sha256= prefix)', async () => {
    const payload = fixturePayload();
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: digest, secret })).rejects.toThrow(
      /must start with `sha256=`/,
    );
  });

  it('rejects unknown algorithm prefix', async () => {
    const payload = fixturePayload();
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `sha1=${digest}`, secret })).rejects.toThrow(
      /sha256=/,
    );
  });
});

describe('verifyWebhook — malformed signatures', () => {
  it('rejects non-hex digest', async () => {
    await expect(
      verifyWebhook({
        payload: '{"event":"x","timestamp":"t","data":{}}',
        signature: `sha256=${'Z'.repeat(64)}`,
        secret,
      }),
    ).rejects.toThrow(/64 hex/);
  });

  it('rejects digest of wrong length', async () => {
    await expect(
      verifyWebhook({
        payload: '{"event":"x","timestamp":"t","data":{}}',
        signature: 'sha256=abcd',
        secret,
      }),
    ).rejects.toThrow(/64 hex/);
  });

  it('rejects empty signature', async () => {
    await expect(
      verifyWebhook({ payload: fixturePayload(), signature: '', secret }),
    ).rejects.toThrow(/signature/);
  });

  it('rejects empty secret', async () => {
    await expect(
      verifyWebhook({
        payload: fixturePayload(),
        signature: `sha256=${'a'.repeat(64)}`,
        secret: '',
      }),
    ).rejects.toThrow(/secret/);
  });
});

describe('verifyWebhook — payload shape', () => {
  it('rejects payload without `event` field', async () => {
    const payload = JSON.stringify({ timestamp: 't', data: {} });
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `sha256=${digest}`, secret })).rejects.toThrow(
      /event/,
    );
  });

  it('rejects non-string `event` field', async () => {
    const payload = JSON.stringify({ event: 123, timestamp: 't', data: {} });
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `sha256=${digest}`, secret })).rejects.toThrow(
      /event/,
    );
  });

  it('rejects non-string `timestamp` field when present', async () => {
    const payload = JSON.stringify({ event: 'call_started', timestamp: 12345, data: {} });
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `sha256=${digest}`, secret })).rejects.toThrow(
      /timestamp/,
    );
  });

  it('accepts payload without `timestamp` field (forward-compat)', async () => {
    const payload = JSON.stringify({ event: 'call_started', data: {} });
    const digest = await sign(secret, payload);
    const event = await verifyWebhook({ payload, signature: `sha256=${digest}`, secret });
    expect(event.event).toBe('call_started');
  });

  it('rejects payload that is not a JSON object', async () => {
    const payload = '"just a string"';
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `sha256=${digest}`, secret })).rejects.toThrow(
      /object/,
    );
  });

  it('rejects malformed JSON', async () => {
    const payload = '{not json';
    const digest = await sign(secret, payload);
    await expect(verifyWebhook({ payload, signature: `sha256=${digest}`, secret })).rejects.toThrow(
      /JSON/,
    );
  });
});
