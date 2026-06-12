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
const DEFAULT_RETRY_AFTER_S = 5;
const MAX_RETRY_AFTER_S = 60;

/**
 * Parse a Retry-After header (delta-seconds or HTTP-date per RFC 9110) into a
 * bounded number of seconds. Unparseable values fall back to the default —
 * never NaN, which setTimeout would treat as 0 and retry instantly.
 */
function parseRetryAfterSeconds(headerValue: string | null): number {
  if (!headerValue) return DEFAULT_RETRY_AFTER_S;
  const asNumber = parseInt(headerValue, 10);
  if (Number.isFinite(asNumber)) {
    return Math.min(Math.max(asNumber, 0), MAX_RETRY_AFTER_S);
  }
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    return Math.min(Math.max((asDate - Date.now()) / 1000, 0), MAX_RETRY_AFTER_S);
  }
  return DEFAULT_RETRY_AFTER_S;
}

function sleepForRetry(response: Response): Promise<void> {
  const seconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
  return new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
}

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
        await sleepForRetry(response);
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
        await sleepForRetry(response);
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

/**
 * Fetch all pages of a paged Graph API response.
 * extraHeaders are sent on every page request, including @odata.nextLink follows
 * (advanced queries require ConsistencyLevel: eventual on each page).
 */
export async function fetchAllPages<T>(endpoint: string, token: string, extraHeaders?: Record<string, string>): Promise<T[]> {
  const results: T[] = [];
  let url: string | undefined = endpoint;

  while (url) {
    const page: GraphPagedResponse<T> = await graphFetch<GraphPagedResponse<T>>(url, token, extraHeaders);
    results.push(...page.value);
    const nextLink = page['@odata.nextLink'];
    if (nextLink && !nextLink.startsWith('https://graph.microsoft.com/')) {
      throw new Error('Untrusted @odata.nextLink URL');
    }
    url = nextLink;
  }

  return results;
}
