import { defaultRetryOptions, type RetryOptions, computeBackoffMs, shouldRetry, sleep } from './retry.js';
import { errorFromResponse, ThreetoneError } from './errors.js';

export interface ThreetoneClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
  defaultHeaders?: Record<string, string>;
}

export const DEFAULT_BASE_URL = 'https://api.threetone.in';

export class ThreetoneClient {
  readonly baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #retry: RetryOptions;
  readonly #defaultHeaders: Record<string, string>;

  constructor(options: ThreetoneClientOptions) {
    if (!options.apiKey) throw new ThreetoneError('apiKey is required');
    this.#apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#retry = { ...defaultRetryOptions, ...options.retry };
    this.#defaultHeaders = options.defaultHeaders ?? {};
  }

  /**
   * Low-level request helper. The generated SDK functions call into this via
   * the configured Hey API client; users typically don't call this directly.
   */
  async request(
    path: string,
    init: RequestInit & { method: string } = { method: 'GET' },
  ): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.#apiKey}`);
    headers.set('xi-api-key', this.#apiKey);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    for (const [k, v] of Object.entries(this.#defaultHeaders)) {
      if (!headers.has(k)) headers.set(k, v);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#retry.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      const userSignal = init.signal ?? undefined;
      if (userSignal) {
        if (userSignal.aborted) controller.abort(userSignal.reason);
        else userSignal.addEventListener('abort', () => controller.abort(userSignal.reason), { once: true });
      }

      try {
        const response = await this.#fetch(url, { ...init, headers, signal: controller.signal });
        if (response.ok) return response;
        if (attempt < this.#retry.maxRetries && shouldRetry(response.status, init.method)) {
          const delay = computeBackoffMs(attempt, response.headers.get('retry-after'), this.#retry);
          await sleep(delay, userSignal);
          continue;
        }
        const body = await safeJson(response);
        throw errorFromResponse(response, body);
      } catch (err) {
        lastError = err;
        if (err instanceof ThreetoneError) throw err;
        if (attempt >= this.#retry.maxRetries) break;
        const delay = computeBackoffMs(attempt, null, this.#retry);
        await sleep(delay, userSignal);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ThreetoneError('Request failed', { cause: lastError });
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
}
