import { describe, expect, it, vi } from 'vitest';
import { ThreetoneClient } from '../src/client.js';
import {
  ThreetoneAuthError,
  ThreetoneNotFoundError,
  ThreetoneRateLimitError,
  ThreetoneServerError,
  ThreetoneValidationError,
} from '../src/errors.js';

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('ThreetoneClient construction', () => {
  it('rejects empty apiKey', () => {
    expect(() => new ThreetoneClient({ apiKey: '' })).toThrow();
  });

  it('rejects whitespace-only apiKey', () => {
    expect(() => new ThreetoneClient({ apiKey: '   ' })).toThrow();
  });

  it('rejects apiKey with CR/LF', () => {
    expect(() => new ThreetoneClient({ apiKey: 'a\r\nb' })).toThrow();
  });

  it('strips trailing slash from baseUrl', () => {
    const c = new ThreetoneClient({ apiKey: 'k', baseUrl: 'https://example.com/' });
    expect(c.baseUrl).toBe('https://example.com');
  });
});

describe('ThreetoneClient headers', () => {
  it('sets Authorization, x-api-key, xi-api-key, and Accept', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const c = new ThreetoneClient({ apiKey: 'k_test', fetch: fetchMock });
    await c.request('/v1/voices');
    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer k_test');
    expect(headers.get('x-api-key')).toBe('k_test');
    expect(headers.get('xi-api-key')).toBe('k_test');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('merges defaultHeaders without overriding auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      defaultHeaders: {
        'x-trace-id': 'abc',
        authorization: 'Bearer hijack',
        'x-api-key': 'hijack',
        'xi-api-key': 'hijack',
      },
    });
    await c.request('/v1/voices');
    const headers = fetchMock.mock.calls[0]?.[1].headers as Headers;
    expect(headers.get('x-trace-id')).toBe('abc');
    expect(headers.get('authorization')).toBe('Bearer k');
    expect(headers.get('x-api-key')).toBe('k');
    expect(headers.get('xi-api-key')).toBe('k');
  });
});

describe('ThreetoneClient error mapping', () => {
  const cases: Array<[number, unknown]> = [
    [401, ThreetoneAuthError],
    [403, ThreetoneAuthError],
    [404, ThreetoneNotFoundError],
    [400, ThreetoneValidationError],
    [422, ThreetoneValidationError],
    [500, ThreetoneServerError],
  ];
  for (const [status, ctor] of cases) {
    it(`maps ${status} → ${(ctor as { name: string }).name}`, async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, { detail: 'x' }));
      const c = new ThreetoneClient({
        apiKey: 'k',
        fetch: fetchMock,
        retry: { maxRetries: 0 },
      });
      await expect(c.request('/v1/voices')).rejects.toBeInstanceOf(
        ctor as new (
          ...args: unknown[]
        ) => Error,
      );
    });
  }

  it('attaches requestId from x-request-id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { detail: 'no' }, { 'x-request-id': 'req_42' }));
    const c = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock, retry: { maxRetries: 0 } });
    try {
      await c.request('/v1/voices');
    } catch (err) {
      expect((err as ThreetoneAuthError).requestId).toBe('req_42');
    }
  });
});

describe('ThreetoneClient retry behavior', () => {
  it('retries on 429 and surfaces ThreetoneRateLimitError when exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { detail: 'slow' }, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(429, { detail: 'slow' }, { 'retry-after': '0' }));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    await expect(c.request('/v1/voices')).rejects.toBeInstanceOf(ThreetoneRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry POST on 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { detail: 'down' }));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0 },
    });
    await expect(c.request('/v1/voiceai/outbound-call', { method: 'POST' })).rejects.toBeInstanceOf(
      ThreetoneServerError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries GET on 5xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { detail: 'down' }))
      .mockResolvedValueOnce(jsonResponse(200, { voices: [] }));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    const res = await c.request('/v1/voices');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries GET on network errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
    });
    const res = await c.request('/v1/voices');
    expect(res.status).toBe(200);
  });

  it('does not retry POST on network errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('ECONNRESET'));
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0 },
    });
    await expect(c.request('/v1/voiceai/outbound-call', { method: 'POST' })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('ThreetoneClient AbortSignal', () => {
  it('rejects immediately when signal is already aborted', async () => {
    const fetchMock = vi.fn();
    const c = new ThreetoneClient({ apiKey: 'k', fetch: fetchMock });
    const ctrl = new AbortController();
    ctrl.abort(new Error('user cancelled'));
    await expect(c.request('/v1/voices', { signal: ctrl.signal })).rejects.toThrow(
      /user cancelled/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retry after user-initiated abort', async () => {
    const ctrl = new AbortController();
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      ctrl.abort(new Error('cancelled mid-flight'));
      throw new DOMException('aborted', 'AbortError');
    });
    const c = new ThreetoneClient({
      apiKey: 'k',
      fetch: fetchMock,
      retry: { maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0 },
    });
    await expect(c.request('/v1/voices', { signal: ctrl.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
