import { getToken } from './auth.js';
import { DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, REPORT_TIMEOUT_MS, MAX_PAGES } from './constants.js';

const BASE_URL = 'https://api.appstoreconnect.apple.com';

export interface ASCError {
  id: string;
  status: string;
  code: string;
  title: string;
  detail: string;
}

export interface ASCResponse<T = any> {
  data: T;
  included?: any[];
  links?: { self: string; next?: string };
  meta?: { paging?: { total: number; limit: number } };
}

export class ASCClientError extends Error {
  constructor(
    public status: number,
    public errors: ASCError[],
  ) {
    const msg = errors.map(e => `[${e.code}] ${e.title}: ${e.detail}`).join('\n');
    super(`ASC API Error (${status}):\n${msg}`);
    this.name = 'ASCClientError';
  }
}

function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return {} as T;
  }

  // For report downloads (gzip content)
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/a-gzip') || contentType.includes('application/gzip')) {
    const buffer = await response.arrayBuffer();
    const decompressed = new TextDecoder().decode(
      await decompress(new Uint8Array(buffer))
    );
    return decompressed as unknown as T;
  }

  const body = await response.text();

  if (!response.ok) {
    let errors: ASCError[] = [];
    try {
      const parsed = JSON.parse(body);
      errors = parsed.errors || [];
    } catch {
      errors = [{
        id: 'unknown',
        status: String(response.status),
        code: 'UNKNOWN',
        title: 'Unknown Error',
        detail: body.slice(0, 500),
      }];
    }

    // Rate limit handling
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new ASCClientError(429, [{
        id: 'rate_limit',
        status: '429',
        code: 'RATE_LIMIT',
        title: 'Rate Limited',
        detail: `Too many requests. Retry after ${retryAfter || '30'} seconds.`,
      }]);
    }

    throw new ASCClientError(response.status, errors);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    return body as unknown as T;
  }
}

async function decompress(data: Uint8Array): Promise<Buffer> {
  const { gunzipSync } = await import('zlib');
  return gunzipSync(Buffer.from(data));
}

function authHeaders(contentType = 'application/json'): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': contentType,
  };
}

export async function ascGet<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const response = await fetch(url.toString(), {
    headers: authHeaders(),
    signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
  });
  return handleResponse<T>(response);
}

export async function ascPost<T = any>(path: string, body: any): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
  });
  return handleResponse<T>(response);
}

export async function ascPatch<T = any>(path: string, body: any): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
  });
  return handleResponse<T>(response);
}

export async function ascDelete(path: string): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
    signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
  });
  await handleResponse<void>(response);
}

// For binary uploads (screenshots) - longer timeout
export async function ascUploadChunk(url: string, chunk: Buffer | Uint8Array, reqHeaders: Record<string, string>): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: reqHeaders,
    body: Buffer.from(chunk),
    signal: createAbortSignal(UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Upload chunk failed: ${response.status} ${await response.text()}`);
  }
}

// For report downloads - longer timeout
export async function ascGetReport(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: authHeaders(),
    signal: createAbortSignal(REPORT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Report download failed: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  try {
    const decompressed = await decompress(new Uint8Array(buffer));
    return new TextDecoder().decode(decompressed);
  } catch {
    return new TextDecoder().decode(new Uint8Array(buffer));
  }
}

// Paginated fetch with safety limit to prevent infinite loops
export async function ascGetAll<T = any>(path: string, params?: Record<string, string>): Promise<T[]> {
  const allData: T[] = [];
  let url: string | null = `${BASE_URL}${path}`;

  const urlObj = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      urlObj.searchParams.set(k, v);
    }
  }
  url = urlObj.toString();

  let pageCount = 0;
  while (url && pageCount < MAX_PAGES) {
    const resp: Response = await fetch(url, {
      headers: authHeaders(),
      signal: createAbortSignal(DEFAULT_TIMEOUT_MS),
    });
    const page: ASCResponse<T[]> = await handleResponse<ASCResponse<T[]>>(resp);
    allData.push(...page.data);
    url = page.links?.next || null;
    pageCount++;
  }

  return allData;
}
