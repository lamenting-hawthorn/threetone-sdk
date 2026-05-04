export interface RetryOptions {
  /** Number of additional attempts after the first. Default 2 (= 3 total attempts). */
  maxRetries: number;
  /** Initial backoff in ms. Default 250. */
  baseDelayMs: number;
  /** Cap on backoff in ms. Default 8_000. */
  maxDelayMs: number;
}

export const defaultRetryOptions: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
};

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'PUT']);

export function isIdempotent(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

export function shouldRetry(status: number, method: string): boolean {
  if (status === 429) return true;
  if (status === 408) return true;
  if (status >= 500 && status <= 599) return isIdempotent(method);
  return false;
}

/** Parse a Retry-After header (delta-seconds OR HTTP-date) to milliseconds. */
export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    return null;
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

export function computeBackoffMs(
  attempt: number,
  retryAfterHeader: string | null,
  opts: RetryOptions,
): number {
  const retryAfter = parseRetryAfterMs(retryAfterHeader);
  if (retryAfter !== null) return Math.min(retryAfter, opts.maxDelayMs);
  // Decorrelated full jitter: spread in [base, base + exp)
  const exp = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
  return Math.min(opts.maxDelayMs, opts.baseDelayMs + Math.random() * exp);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const state: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };
    const onAbort = (): void => {
      if (state.timer !== null) clearTimeout(state.timer);
      reject(signal?.reason);
    };
    state.timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
