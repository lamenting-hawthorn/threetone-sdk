export class ThreetoneError extends Error {
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(
    message: string,
    options: { status?: number; requestId?: string; body?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ThreetoneError';
    this.status = options.status;
    this.requestId = options.requestId;
    this.body = options.body;
  }
}

export class ThreetoneAuthError extends ThreetoneError {
  constructor(message = 'Authentication failed', opts: ConstructorParameters<typeof ThreetoneError>[1] = {}) {
    super(message, opts);
    this.name = 'ThreetoneAuthError';
  }
}

export class ThreetoneRateLimitError extends ThreetoneError {
  readonly retryAfterMs: number | undefined;
  constructor(
    message = 'Rate limited',
    opts: ConstructorParameters<typeof ThreetoneError>[1] & { retryAfterMs?: number } = {},
  ) {
    super(message, opts);
    this.name = 'ThreetoneRateLimitError';
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export class ThreetoneValidationError extends ThreetoneError {
  constructor(message = 'Invalid request', opts: ConstructorParameters<typeof ThreetoneError>[1] = {}) {
    super(message, opts);
    this.name = 'ThreetoneValidationError';
  }
}

export class ThreetoneServerError extends ThreetoneError {
  constructor(message = 'Server error', opts: ConstructorParameters<typeof ThreetoneError>[1] = {}) {
    super(message, opts);
    this.name = 'ThreetoneServerError';
  }
}

export function errorFromResponse(
  response: Response,
  body: unknown,
): ThreetoneError {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  const status = response.status;
  const message =
    typeof body === 'object' && body !== null && 'detail' in body && typeof (body as { detail: unknown }).detail === 'string'
      ? (body as { detail: string }).detail
      : `HTTP ${status}`;
  const opts = { status, requestId, body };

  if (status === 401 || status === 403) return new ThreetoneAuthError(message, opts);
  if (status === 422 || status === 400) return new ThreetoneValidationError(message, opts);
  if (status === 429) {
    const retryAfter = response.headers.get('retry-after');
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return new ThreetoneRateLimitError(message, { ...opts, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });
  }
  if (status >= 500) return new ThreetoneServerError(message, opts);
  return new ThreetoneError(message, opts);
}
