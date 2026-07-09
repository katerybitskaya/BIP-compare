import type {
  CompareRequestPayload,
  ComparisonResult,
  PageContentDiff,
  RawSiteSnapshot,
  ReportSummary,
} from './types';

// The backend (bip-compare-backend, FastAPI) listens here by default.
// Override with VITE_API_BASE_URL in a .env file if it runs elsewhere.
const API_BASE_URL: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ??
  'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    throw new ApiError(
      'Nie udało się połączyć z backendem. Sprawdź, czy serwer API działa (domyślnie http://127.0.0.1:8000).'
    );
  }

  if (!response.ok) {
    let detail = `Błąd serwera (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') detail = body.detail;
      else if (Array.isArray(body?.detail)) {
        detail = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ') || detail;
      }
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new ApiError(detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function runCompare(payload: CompareRequestPayload): Promise<ComparisonResult> {
  return request<ComparisonResult>('/api/compare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listReports(): Promise<ReportSummary[]> {
  return request<ReportSummary[]>('/api/compare');
}

export function getReport(id: string): Promise<ComparisonResult> {
  return request<ComparisonResult>(`/api/compare/${id}`);
}

/** Fetches the full raw per-page content snapshot (HTML/text/links/
 * attachments for every crawled page) of one side of a saved comparison. */
export function getRawSnapshot(resultId: string, side: 'old' | 'new'): Promise<RawSiteSnapshot> {
  return request<RawSiteSnapshot>(`/api/compare/${resultId}/raw/${side}`);
}

/** Fetches an on-demand old-vs-new content diff (text, HTML structure, HTML
 * source) for a single page path. Only available when the report's scope
 * had "content" enabled — the backend returns HTTP 400 otherwise. */
export function getContentDiff(resultId: string, path: string): Promise<PageContentDiff> {
  return request<PageContentDiff>(`/api/compare/${resultId}/content-diff?path=${encodeURIComponent(path)}`);
}

export function clearAllReports(): Promise<{ removed: number }> {
  return request<{ removed: number }>('/api/compare', { method: 'DELETE' });
}
