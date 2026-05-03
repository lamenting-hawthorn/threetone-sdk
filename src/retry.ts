export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const defaultRetryOptions: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
};

export function shouldRetry(status: number, method: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && status <= 599) {
    const m = method.toUpperCase();
    return m === 'GET' || m === 'HEAD' || m === 'DELETE' || m === 'PUT';
  }
  return false;
}

export function computeBackoffMs(
  attempt: number,
  retryAfterHeader: string | null,
  opts: RetryOptions,
): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, opts.maxDelayMs);
  }
  const exp = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
  const jitter = Math.random() * exp * 0.25;
  return exp + jitter;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
