// TypeScript mirror of the Pydantic models exposed by the BIP Compare backend
// (see bip-compare-backend/app/models.py).

export interface CompareScope {
  content: boolean;
  links: boolean;
  attachments: boolean;
}

export interface CompareRequestPayload {
  old_url: string;
  new_url: string;
  max_pages?: number;
  timeout_seconds?: number;
  scope?: CompareScope;
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

// --- Raw per-page content snapshot -----------------------------------------
// Fetched via GET /api/compare/{id}/raw/{old|new} — the full crawled content
// of every page on one site, used to build a page-content comparison.

export interface RawPageEntry {
  url: string;
  status_code: number | null;
  ok: boolean;
  error: string | null;
  html: string | null;
  text: string | null;
  structure: Record<string, number> | null;
  links: Array<{ href: string; text: string; key: string }> | null;
  attachments: Array<{ href: string; filename: string; key: string }> | null;
}

export interface RawSiteSnapshot {
  base_url: string;
  reachable: boolean;
  root_status_code: number | null;
  root_error: string | null;
  pages: Record<string, RawPageEntry>;
}

export interface FileEntry {
  filename: string;
  href: string;
  status_code: number | null;
  ok: boolean;
  size_bytes: number | null;
  content_type: string | null;
  source_path: string;
}

export interface FileDiffEntry {
  key: string;
  filename: string;
  old: FileEntry | null;
  new: FileEntry | null;
  status: string; // "ok" | "different" | "error404" | "new" | "removed"
}

export interface LinkEntry {
  href: string;
  text: string;
  status_code: number | null;
  ok: boolean;
  source_path: string;
}

export interface LinkDiffEntry {
  key: string;
  text: string;
  old: LinkEntry | null;
  new: LinkEntry | null;
  status: string; // "ok" | "broken" | "new" | "removed"
}

// --- Per-page content diff (on demand) --------------------------------------
// Fetched via GET /api/compare/{id}/content-diff?path=... — only available
// when the report's scope.content was enabled at compare time.

export interface ContentDiffLine {
  kind: string; // "same" | "del" | "ins"
  text: string;
}

export interface StructureDiffRow {
  tag: string;
  old: number | null;
  new: number | null;
  changed: boolean;
}

export interface PageContentDiff {
  path: string;
  status: string; // "same" | "changed" | "removed" | "added"
  old_url: string | null;
  new_url: string | null;
  text_diff: ContentDiffLine[];
  structure_diff: StructureDiffRow[];
  html_diff: ContentDiffLine[];
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
  // Optional: reports saved by an older backend version won't have this.
  scope?: CompareScope;
  missing_in_new: PageDiffEntry[];
  extra_in_new: PageDiffEntry[];
  unchanged_paths: string[];
  file_diffs?: FileDiffEntry[];
  link_diffs?: LinkDiffEntry[];
  content_checked_count?: number;
  content_changed_count?: number;
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
  // Optional: reports saved by an older backend version won't have these.
  scope?: CompareScope;
  file_count?: number;
  file_issue_count?: number;
  link_count?: number;
  link_issue_count?: number;
  content_checked_count?: number;
  content_changed_count?: number;
}
