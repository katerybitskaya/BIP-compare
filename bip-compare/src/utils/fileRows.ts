import type { ComparisonResult, FileDiffEntry } from '../api/types';
import type { FileComparison, FileKind, FileStatus, StatDefinition } from '../types';

function kindFromFilename(filename: string): FileKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'doc';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'xls';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  return 'other';
}

function bytesToKb(bytes: number | null | undefined): number | null {
  return bytes === null || bytes === undefined ? null : bytes / 1024;
}

/** Maps the backend's site-wide FileDiffEntry list onto the original
 * FileComparison shape, so the existing FileResultsTable/FileDetailPanel
 * (built for the mock dashboard) can render real data unchanged. */
export function buildFileRows(result: ComparisonResult): FileComparison[] {
  const entries: FileDiffEntry[] = result.file_diffs ?? [];
  return entries.map((entry) => ({
    id: entry.key,
    name: entry.filename,
    path: entry.key,
    kind: kindFromFilename(entry.filename),
    oldSizeKb: bytesToKb(entry.old?.size_bytes),
    newSizeKb: bytesToKb(entry.new?.size_bytes),
    oldHttp: entry.old?.status_code ?? null,
    newHttp: entry.new?.status_code ?? null,
    oldType: entry.old?.content_type ?? 'application/octet-stream',
    newType: entry.new?.content_type ?? 'application/octet-stream',
    oldModified: null,
    newModified: null,
    oldDownloadOk: entry.old?.ok ?? false,
    newDownloadOk: entry.new?.ok ?? false,
    status: (entry.status as FileStatus) ?? 'ok',
  }));
}

/** Builds the four Dashboard stat cards from the site-wide file comparison. */
export function buildFileStatItems(result: ComparisonResult): StatDefinition[] {
  const entries: FileDiffEntry[] = result.file_diffs ?? [];
  const total = entries.length;
  const diffCount = entries.filter((e) => e.status === 'different').length;
  const okCount = entries.filter((e) => e.status === 'ok').length;
  const errorCount = entries.filter((e) => e.status === 'error404').length;

  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'files',
      label: 'Porównane pliki',
      value: String(total),
      helper: `${pct(total)} z zaplanowanego`,
      tone: 'blue',
      icon: 'files',
    },
    {
      id: 'diffs',
      label: 'Różnice',
      value: String(diffCount),
      helper: `${pct(diffCount)} z porównanych`,
      tone: 'amber',
      icon: 'diff',
    },
    {
      id: 'ok',
      label: 'Pliki OK',
      value: String(okCount),
      helper: `${pct(okCount)} z plików`,
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'errors',
      label: 'Błędy pobierania',
      value: String(errorCount),
      helper: `${pct(errorCount)} z plików`,
      tone: 'red',
      icon: 'alert',
    },
  ];
}
