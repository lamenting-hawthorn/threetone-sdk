import { parseRetryAfterMs } from './retry.js';

export interface ThreetoneErrorOptions {
  status?: number;
  requestId?: string;
  body?: unknown;
  cause?: unknown;
}

export class ThreetoneError extends Error {
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(message: string, options: ThreetoneErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ThreetoneError';
    this.status = options.status;
    this.requestId = options.requestId;
    this.body = options.body;
  }

  /** Structured representation for logging frameworks. Omits `body` to avoid leaking PII. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      requestId: this.requestId,
    };
  }
}

export class ThreetoneAuthError extends ThreetoneError {
  constructor(message = 'Authentication failed', opts: ThreetoneErrorOptions = {}) {
    super(message, opts);
    this.name = 'ThreetoneAuthError';
  }
}

export class ThreetoneRateLimitError extends ThreetoneError {
  readonly retryAfterMs: number | undefined;
  constructor(
    message = 'Rate limited',
    opts: ThreetoneErrorOptions & { retryAfterMs?: number } = {},
  ) {
    super(message, opts);
    this.name = 'ThreetoneRateLimitError';
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export class ThreetoneNotFoundError extends ThreetoneError {
  constructor(message = 'Not found', opts: ThreetoneErrorOptions = {}) {
    super(message, opts);
    this.name = 'ThreetoneNotFoundError';
  }
}

export class ThreetoneValidationError extends ThreetoneError {
  constructor(message = 'Invalid request', opts: ThreetoneErrorOptions = {}) {
    super(message, opts);
    this.name = 'ThreetoneValidationError';
  }
}

export class ThreetoneServerError extends ThreetoneError {
  constructor(message = 'Server error', opts: ThreetoneErrorOptions = {}) {
    super(message, opts);
    this.name = 'ThreetoneServerError';
  }
}

const MAX_BODY_SNIPPET = 4096;

function trimBodySnippet(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  return body.length > MAX_BODY_SNIPPET ? `${body.slice(0, MAX_BODY_SNIPPET)}…` : body;
}

export function errorFromResponse(response: Response, body: unknown): ThreetoneError {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const status = response.status;
  const trimmed = trimBodySnippet(body);
  const message =
    typeof body === 'object' &&
    body !== null &&
    'detail' in body &&
    typeof (body as { detail: unknown }).detail === 'string'
      ? (body as { detail: string }).detail
      : `HTTP ${status}`;
  const opts: ThreetoneErrorOptions = { status, requestId, body: trimmed };

  if (status === 401 || status === 403) return new ThreetoneAuthError(message, opts);
  if (status === 404) return new ThreetoneNotFoundError(message, opts);
  if (status === 422 || status === 400) return new ThreetoneValidationError(message, opts);
  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after')) ?? undefined;
    return new ThreetoneRateLimitError(message, {
      ...opts,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
  }
  if (status >= 500) return new ThreetoneServerError(message, opts);
  return new ThreetoneError(message, opts);
}
