import { ThreetoneError, errorFromResponse } from './errors.js';
import {
  type AgentsNamespace,
  type BatchNamespace,
  type CallsNamespace,
  type ConversationsNamespace,
  type KnowledgeBaseNamespace,
  type PhoneNumbersNamespace,
  type VoicesNamespace,
  createAgentsNamespace,
  createBatchNamespace,
  createCallsNamespace,
  createConversationsNamespace,
  createKnowledgeBaseNamespace,
  createPhoneNumbersNamespace,
  createVoicesNamespace,
} from './namespaces/index.js';
import {
  type RetryOptions,
  computeBackoffMs,
  defaultRetryOptions,
  isIdempotent,
  shouldRetry,
  sleep,
} from './retry.js';

export interface ThreetoneClientOptions {
  /**
   * API key from the Threetone dashboard. Sent as `x-api-key`, `xi-api-key`,
   * and `Authorization: Bearer` for compatibility with all documented schemes.
   */
  apiKey: string;
  /** Defaults to https://api.threetone.in. No trailing slash required. */
  baseUrl?: string;
  /** Custom fetch implementation. Defaults to `globalThis.fetch` (resolved lazily). */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Retry policy. */
  retry?: Partial<RetryOptions>;
  /**
   * Headers merged into every request. Cannot override `Authorization`,
   * `x-api-key`, or `xi-api-key`.
   */
  defaultHeaders?: Record<string, string>;
}

export const DEFAULT_BASE_URL = 'https://api.threetone.in';

export class ThreetoneClient {
  readonly baseUrl: string;
  /** Outbound call helpers. */
  readonly calls: CallsNamespace;
  /** Conversation history helpers. Outbound calls are returned as conversations. */
  readonly conversations: ConversationsNamespace;
  /** Agent CRUD helpers. */
  readonly agents: AgentsNamespace;
  /** Batch calling helpers. */
  readonly batch: BatchNamespace;
  /** Workspace knowledge-base document helpers. */
  readonly knowledgeBase: KnowledgeBaseNamespace;
  /** Voice catalog helpers. */
  readonly voices: VoicesNamespace;
  /** Phone-number pricing inventory helpers. */
  readonly phoneNumbers: PhoneNumbersNamespace;

  readonly #apiKey: string;
  readonly #fetch: typeof fetch | undefined;
  readonly #timeoutMs: number;
  readonly #retry: RetryOptions;
  readonly #defaultHeaders: Record<string, string>;

  constructor(options: ThreetoneClientOptions) {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) throw new ThreetoneError('apiKey is required');
    if (/[\r\n]/.test(apiKey)) {
      throw new ThreetoneError('apiKey must not contain CR or LF characters');
    }
    this.#apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.#fetch = options.fetch;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#retry = { ...defaultRetryOptions, ...options.retry };
    this.#defaultHeaders = options.defaultHeaders ?? {};
    const request = this.request.bind(this);
    this.calls = createCallsNamespace(request);
    this.conversations = createConversationsNamespace(request);
    this.agents = createAgentsNamespace(request);
    this.batch = createBatchNamespace(request);
    this.knowledgeBase = createKnowledgeBaseNamespace(request);
    this.voices = createVoicesNamespace(request);
    this.phoneNumbers = createPhoneNumbersNamespace(request);
  }

  /**
   * Low-level request helper. Generated SDK functions call into this; users typically
   * don't call this directly once the ergonomic wrapper layer ships.
   *
   * @internal
   */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const baseHeaders = this.#buildHeaders(init.headers);
    const userSignal = init.signal ?? undefined;

    if (userSignal?.aborted) throw userSignal.reason;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.#retry.maxRetries; attempt++) {
      const { signal, cleanup, didTimeOut } = this.#linkAbort(userSignal);

      try {
        const response = await this.#doFetch(url, {
          ...init,
          method,
          headers: baseHeaders,
          signal,
        });
        if (response.ok) return response;
        if (attempt < this.#retry.maxRetries && shouldRetry(response.status, method)) {
          const delay = computeBackoffMs(attempt, response.headers.get('retry-after'), this.#retry);
          await sleep(delay, userSignal);
          continue;
        }
        const body = await safeJson(response);
        throw errorFromResponse(response, body);
      } catch (err) {
        lastError = err;
        if (err instanceof ThreetoneError) throw err;
        if (userSignal?.aborted) throw err;
        const isTimeout = didTimeOut();
        // Network errors (and our own timeout) are only safe to retry on idempotent methods.
        if (
          attempt < this.#retry.maxRetries &&
          isIdempotent(method) &&
          (isTimeout || isNetworkError(err))
        ) {
          await sleep(computeBackoffMs(attempt, null, this.#retry), userSignal);
          continue;
        }
        throw err;
      } finally {
        cleanup();
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ThreetoneError('Request failed', { cause: lastError });
  }

  #buildHeaders(input: HeadersInit | undefined): Headers {
    const h = new Headers(input);
    for (const [k, v] of Object.entries(this.#defaultHeaders)) {
      if (!h.has(k)) h.set(k, v);
    }
    // Threetone's docs use `x-api-key`; the OpenAPI spec defines `xi-api-key`
    // (an ElevenLabs convention). The HTTPBearer scheme is also accepted.
    // We send all three so any of the three accepted gateways will succeed.
    h.set('Authorization', `Bearer ${this.#apiKey}`);
    h.set('x-api-key', this.#apiKey);
    h.set('xi-api-key', this.#apiKey);
    if (!h.has('Accept')) h.set('Accept', 'application/json');
    return h;
  }

  #doFetch(url: string, init: RequestInit): Promise<Response> {
    const fn = this.#fetch ?? globalThis.fetch;
    return fn(url, init);
  }

  #linkAbort(userSignal: AbortSignal | undefined): {
    signal: AbortSignal;
    cleanup: () => void;
    didTimeOut: () => boolean;
  } {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new ThreetoneError(`Request timed out after ${this.#timeoutMs}ms`));
    }, this.#timeoutMs);

    let onAbort: (() => void) | undefined;
    if (userSignal) {
      if (userSignal.aborted) {
        controller.abort(userSignal.reason);
      } else {
        onAbort = () => controller.abort(userSignal.reason);
        userSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    return {
      signal: controller.signal,
      didTimeOut: () => timedOut,
      cleanup: () => {
        clearTimeout(timer);
        if (userSignal && onAbort) userSignal.removeEventListener('abort', onAbort);
      },
    };
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  // DOMException with name 'AbortError' is handled by the user-signal check upstream.
  return false;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  } catch {
    return undefined;
  }
}
