export type FileStatus = 'ok' | 'different' | 'error404' | 'new' | 'removed';

export type FileKind = 'pdf' | 'doc' | 'xls' | 'image' | 'other';

export interface FileComparison {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  oldSizeKb: number | null;
  newSizeKb: number | null;
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

export interface StatDefinition {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: 'blue' | 'amber' | 'green' | 'red';
  icon: 'files' | 'diff' | 'check' | 'alert';
}

export type NavKey =
  | 'dashboard'
  | 'comparisons'
  | 'runs'
  | 'reports'
  | 'settings';
