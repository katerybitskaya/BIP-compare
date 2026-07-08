import type { ComparisonResult } from '../api/types';
import type { StatDefinition } from '../types';

export type PageCategory = 'missing' | 'extra' | 'unchanged';

export interface PageRow {
  path: string;
  category: PageCategory;
  oldUrl: string;
  newUrl: string;
  reason?: string;
  hasDetail: boolean;
}

/** Flattens a ComparisonResult's missing/extra/unchanged lists into one
 * table-friendly array, sorted with problems first (missing, then extra,
 * then unchanged) and alphabetically by path within each group. Every field
 * access is defensive (?? fallback) because a report saved by an older
 * backend version may be missing newer fields entirely. */
export function buildPageRows(result: ComparisonResult): PageRow[] {
  const rows: PageRow[] = [];

  for (const entry of result.missing_in_new ?? []) {
    rows.push({
      path: entry.path,
      category: 'missing',
      oldUrl: entry.reference_url,
      newUrl: entry.checked_url,
      reason: entry.reason,
      hasDetail: false,
    });
  }

  for (const entry of result.extra_in_new ?? []) {
    rows.push({
      path: entry.path,
      category: 'extra',
      oldUrl: entry.checked_url,
      newUrl: entry.reference_url,
      reason: entry.reason,
      hasDetail: false,
    });
  }

  const oldByPath = new Map((result.old_site?.pages ?? []).map((p) => [p.path, p]));
  const newByPath = new Map((result.new_site?.pages ?? []).map((p) => [p.path, p]));
  const pageDetails = result.page_details ?? {};
  for (const path of result.unchanged_paths ?? []) {
    rows.push({
      path,
      category: 'unchanged',
      oldUrl: oldByPath.get(path)?.url ?? result.old_url,
      newUrl: newByPath.get(path)?.url ?? result.new_url,
      hasDetail: Boolean(pageDetails[path]),
    });
  }

  const order: Record<PageCategory, number> = { missing: 0, extra: 1, unchanged: 2 };
  rows.sort((a, b) => order[a.category] - order[b.category] || a.path.localeCompare(b.path));
  return rows;
}

/** Builds the four Dashboard/Report stat cards from a real ComparisonResult.
 * Also defensive against missing fields on older report shapes. */
export function buildStatItems(result: ComparisonResult): StatDefinition[] {
  const unchangedCount = result.unchanged_paths?.length ?? 0;
  const missingCount = result.missing_in_new?.length ?? 0;
  const extraCount = result.extra_in_new?.length ?? 0;
  const totalPages = unchangedCount + missingCount + extraCount;
  const structuralDiffs = missingCount + extraCount;
  const contentChanges = result.pages_with_content_changes ?? 0;
  const linkIssues = result.pages_with_link_issues ?? 0;
  const attachmentIssues = result.pages_with_attachment_issues ?? 0;
  const detailIssues = contentChanges + linkIssues + attachmentIssues;

  const pct = (n: number) => (totalPages > 0 ? `${((n / totalPages) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'pages',
      label: 'Porównane podstrony',
      value: String(totalPages),
      helper: `${pct(totalPages)} z zaplanowanego`,
      tone: 'blue',
      icon: 'files',
    },
    {
      id: 'diffs',
      label: 'Różnice w strukturze',
      value: String(structuralDiffs),
      helper: `${pct(structuralDiffs)} porównanych — brakujące/zbędne`,
      tone: 'amber',
      icon: 'diff',
    },
    {
      id: 'ok',
      label: 'Podstrony bez zmian',
      value: String(unchangedCount),
      helper: `${pct(unchangedCount)} porównanych`,
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'issues',
      label: 'Różnice w treści/linkach/plikach',
      value: String(detailIssues),
      helper: `treść: ${contentChanges} · linki: ${linkIssues} · pliki: ${attachmentIssues}`,
      tone: 'red',
      icon: 'alert',
    },
  ];
}
