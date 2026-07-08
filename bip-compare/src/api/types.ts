// TypeScript mirror of the Pydantic models exposed by the BIP Compare backend
// (see bip-compare-backend/app/models.py).

export interface CompareRequestPayload {
  old_url: string;
  new_url: string;
  max_pages?: number;
  timeout_seconds?: number;
}

export interface PageStatus {
  path: string;
  url: string;
  status_code: number | null;
  ok: boolean;
  error: string | null;
}

export interface SiteReport {
  base_url: string;
  reachable: boolean;
  root_status_code: number | null;
  root_error: string | null;
  pages: PageStatus[];
  page_count: number;
}

export interface PageDiffEntry {
  path: string;
  reference_url: string;
  reference_status_code: number | null;
  checked_url: string;
  checked_status_code: number | null;
  reason: string;
}

export interface ComparisonResult {
  id: string;
  generated_at: string;
  duration_ms: number;
  old_url: string;
  new_url: string;
  old_site: SiteReport;
  new_site: SiteReport;
  both_reachable: boolean;
  missing_in_new: PageDiffEntry[];
  extra_in_new: PageDiffEntry[];
  unchanged_paths: string[];
}

export interface ReportSummary {
  id: string;
  generated_at: string;
  duration_ms: number;
  old_url: string;
  new_url: string;
  both_reachable: boolean;
  old_reachable: boolean;
  new_reachable: boolean;
  old_page_count: number;
  new_page_count: number;
  missing_count: number;
  extra_count: number;
  unchanged_count: number;
}
