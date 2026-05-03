import { describe, it, expect, vi } from 'vitest';
import { ThreetoneClient } from '../src/client.js';
import { ThreetoneAuthError, ThreetoneRateLimitError } from '../src/errors.js';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('ThreetoneClient', () => {
  it('sets Authorization and xi-api-key headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const c = new ThreetoneClient({ apiKey: 'k_test', fetch: fetchMock });
    await c.request('/v1/voices', { method: 'GET' });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer k_test');
    expect(headers.get('xi-api-key')).toBe('k_test');
  });

  it('maps 401 to ThreetoneAuthError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { detail: 'bad key' }));
    const c = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock, retry: { maxRetries: 0 } });
    await expect(c.request('/v1/voices', { method: 'GET' })).rejects.toBeInstanceOf(ThreetoneAuthError);
  });

  it('retries on 429 and surfaces ThreetoneRateLimitError when exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { detail: 'slow down' }, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(429, { detail: 'slow down' }, { 'retry-after': '0' }));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    await expect(c.request('/v1/voices', { method: 'GET' })).rejects.toBeInstanceOf(
      ThreetoneRateLimitError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects when apiKey is missing', () => {
    expect(() => new ThreetoneClient({ apiKey: '' })).toThrow();
  });
});
