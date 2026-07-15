export type FileStatus = 'ok' | 'different' | 'error404' | 'new' | 'removed';

export type FileKind = 'pdf' | 'doc' | 'xls' | 'image' | 'other';

export interface FileComparison {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  oldSizeKb: number | null;
  newSizeKb: number | null;
  oldHref: string | null;
  newHref: string | null;
  oldHttp: number | null;
  newHttp: number | null;
  oldType: string;
  newType: string;
  oldModified: string | null;
  newModified: string | null;
  oldDownloadOk: boolean;
  newDownloadOk: boolean;
  status: FileStatus;
}

export type LinkStatus = 'ok' | 'broken' | 'new' | 'removed';

export interface LinkComparison {
  id: string;
  text: string;
  path: string;
  external: boolean;
  oldHref: string | null;
  newHref: string | null;
  oldHttp: number | null;
  newHttp: number | null;
  oldSourcePath: string | null;
  newSourcePath: string | null;
  oldWorks: boolean;
  newWorks: boolean;
  status: LinkStatus;
}

export interface StatDefinition {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: 'blue' | 'amber' | 'green' | 'red';
  icon: 'files' | 'diff' | 'check' | 'alert' | 'globe' | 'code' | 'link' | 'file-x' | 'file-plus' | 'swap';
}

// --- Dashboard overview (category-level summary of a report) --------------

export type CategoryId = 'pages' | 'content' | 'links' | 'files';

export type CategoryStatus = 'ok' | 'issues' | 'skipped';

export interface CategoryOverviewRow {
  id: CategoryId;
  label: string;
  checked: number;
  issues: number;
  status: CategoryStatus;
}

export interface CategoryBreakdownStat {
  label: string;
  value: number;
  tone: 'default' | 'success' | 'danger' | 'warning';
}

export interface CategoryOverviewEntry {
  row: CategoryOverviewRow;
  breakdown: CategoryBreakdownStat[];
  emptyMessage: string | null;
}

export type NavKey =
  | 'dashboard'
  | 'comparisons'
  | 'runs'
  | 'reports'
  | 'settings';
