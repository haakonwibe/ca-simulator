// services/graphClient.ts — Shared Graph API HTTP client.
//
// Single implementation of fetch helpers used by both graphService and
// personaService. Handles timeout (15s), 403 → GraphPermissionError,
// 429 → retry-once with Retry-After, and pagination.

// ── Graph Permission Error ───────────────────────────────────────────

export const ADMIN_CONSENT_ERROR = 'ADMIN_CONSENT_REQUIRED';

export class GraphPermissionError extends Error {
  constructor() {
    super(ADMIN_CONSENT_ERROR);
    this.name = 'GraphPermissionError';
  }
}

// ── Fetch Helpers ────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

export async function graphFetch<T>(endpoint: string, token: string, extraHeaders?: Record<string, string>, _retryCount = 0): Promise<T> {
  const url = endpoint.startsWith('https://')
    ? endpoint
    : `https://graph.microsoft.com/v1.0${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 403) throw new GraphPermissionError();
      if (response.status === 429) {
        if (_retryCount >= MAX_RETRIES) throw new Error('Graph API rate limit exceeded after retries');
        clearTimeout(timeoutId);
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        await new Promise<void>((resolve, reject) => {
          const sleepId = setTimeout(resolve, retryAfter * 1000);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(sleepId);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
        return graphFetch<T>(endpoint, token, extraHeaders, _retryCount + 1);
      }
      throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function graphPost<T>(endpoint: string, token: string, body: unknown, _retryCount = 0): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 403) throw new GraphPermissionError();
      if (response.status === 429) {
        if (_retryCount >= MAX_RETRIES) throw new Error('Graph API rate limit exceeded after retries');
        clearTimeout(timeoutId);
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        await new Promise<void>((resolve, reject) => {
          const sleepId = setTimeout(resolve, retryAfter * 1000);
          controller.signal.addEventListener('abort', () => {
            clearTimeout(sleepId);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
        return graphPost<T>(endpoint, token, body, _retryCount + 1);
      }
      throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Pagination ───────────────────────────────────────────────────────

interface GraphPagedResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

/** Fetch all pages of a paged Graph API response. */
export async function fetchAllPages<T>(endpoint: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | undefined = endpoint;

  while (url) {
    const page: GraphPagedResponse<T> = await graphFetch<GraphPagedResponse<T>>(url, token);
    results.push(...page.value);
    const nextLink = page['@odata.nextLink'];
    if (nextLink && !nextLink.startsWith('https://graph.microsoft.com/')) {
      throw new Error('Untrusted @odata.nextLink URL');
    }
    url = nextLink;
  }

  return results;
}
