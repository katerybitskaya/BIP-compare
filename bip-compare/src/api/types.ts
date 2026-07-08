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

// --- Per-page detailed diff (content / links / attachments) ---------------

export interface ContentChange {
  type: string; // "added" | "removed" | "changed"
  old_text: string | null;
  new_text: string | null;
}

export interface ContentDiff {
  changed: boolean;
  old_length: number;
  new_length: number;
  similarity: number;
  old_structure: Record<string, number>;
  new_structure: Record<string, number>;
  changes: ContentChange[];
  truncated: boolean;
}

export interface LinkStatus {
  href: string;
  text: string;
  status_code: number | null;
  ok: boolean;
}

export interface LinksDiff {
  missing_links: string[];
  extra_links: string[];
  broken_links_old: LinkStatus[];
  broken_links_new: LinkStatus[];
}

export interface AttachmentInfo {
  href: string;
  filename: string;
  size_bytes: number | null;
}

export interface AttachmentChange {
  filename: string;
  old_size_bytes: number | null;
  new_size_bytes: number | null;
}

export interface AttachmentsDiff {
  missing_files: AttachmentInfo[];
  extra_files: AttachmentInfo[];
  changed_size: AttachmentChange[];
  order_changed: boolean;
}

export interface ScreenshotDiff {
  old_screenshot_path: string | null;
  new_screenshot_path: string | null;
  diff_percentage: number | null;
}

export interface PageDetail {
  path: string;
  old_url: string;
  new_url: string;
  content_diff: ContentDiff | null;
  links_diff: LinksDiff | null;
  attachments_diff: AttachmentsDiff | null;
  screenshot_diff: ScreenshotDiff | null;
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

export interface ComparisonResult {
  id: string;
  generated_at: string;
  duration_ms: number;
  old_url: string;
  new_url: string;
  old_site: SiteReport;
  new_site: SiteReport;
  both_reachable: boolean;
  // Optional: reports saved by an older backend version (before scoped
  // detail comparison existed) won't have these fields at all.
  scope?: CompareScope;
  missing_in_new: PageDiffEntry[];
  extra_in_new: PageDiffEntry[];
  unchanged_paths: string[];
  page_details?: Record<string, string>;
  pages_with_content_changes?: number;
  pages_with_link_issues?: number;
  pages_with_attachment_issues?: number;
  file_diffs?: FileDiffEntry[];
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
  pages_with_content_changes?: number;
  pages_with_link_issues?: number;
  pages_with_attachment_issues?: number;
  file_count?: number;
  file_issue_count?: number;
}
