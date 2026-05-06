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

export async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function parseOptionalJson<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  return JSON.parse(text) as T;
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
