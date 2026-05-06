import { ThreetoneError } from '../errors.js';

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface Page<T> {
  data: Array<T>;
  nextCursor?: string;
  hasMore: boolean;
}

export type Requester = (path: string, init?: RequestInit) => Promise<Response>;

export function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) query.append(key, String(item));
      }
      continue;
    }
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export function jsonInit(
  method: string,
  body?: unknown,
  options: RequestOptions = {},
): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...options,
  };
}

const MAX_BODY_SNIPPET = 4096;

function trimSnippet(text: string): string {
  return text.length > MAX_BODY_SNIPPET ? `${text.slice(0, MAX_BODY_SNIPPET)}…` : text;
}

function invalidJsonError(response: Response, text: string, cause: unknown): ThreetoneError {
  return new ThreetoneError('Invalid JSON in response', {
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? undefined,
    body: trimSnippet(text),
    cause,
  });
}

export async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw invalidJsonError(response, text, err);
  }
}

export async function parseOptionalJson<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw invalidJsonError(response, text, err);
  }
}

export function toPage<T>(
  items: Array<T>,
  nextCursor: string | null | undefined,
  hasMore: boolean,
): Page<T> {
  return {
    data: items,
    ...(nextCursor ? { nextCursor } : {}),
    hasMore,
  };
}
