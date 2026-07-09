import type { ComparisonResult } from '../api/types';
import type {
  CategoryBreakdownStat,
  CategoryId,
  CategoryOverviewEntry,
  CategoryOverviewRow,
  CategoryStatus,
  StatDefinition,
} from '../types';

const CATEGORY_LABELS: Record<CategoryId, string> = {
  pages: 'Podstrony',
  content: 'Zawartość',
  links: 'Linki',
  files: 'Pliki',
};

function rowStatus(scopeEnabled: boolean, issues: number): CategoryStatus {
  if (!scopeEnabled) return 'skipped';
  return issues > 0 ? 'issues' : 'ok';
}

/** Builds the four Dashboard tiles — one per comparison category — each
 * showing only how many checked items in that category differ. Each
 * category keeps a fixed color (not tied to whether it happens to have
 * issues right now), so the four tiles stay visually distinct at a glance. */
export function buildOverviewStatItems(report: ComparisonResult): StatDefinition[] {
  const scopeContent = report.scope?.content ?? true;
  const scopeLinks = report.scope?.links ?? true;
  const scopeAttachments = report.scope?.attachments ?? true;

  const pagesIssues = report.missing_in_new.length + report.extra_in_new.length;
  const contentChanged = report.content_changed_count ?? 0;
  const linkIssues = (report.link_diffs ?? []).filter((l) => l.status !== 'ok').length;
  const fileIssues = (report.file_diffs ?? []).filter((f) => f.status !== 'ok').length;

  function tileValue(scopeEnabled: boolean, issues: number): string {
    return scopeEnabled ? String(issues) : '—';
  }

  return [
    {
      id: 'pages',
      label: CATEGORY_LABELS.pages,
      value: tileValue(true, pagesIssues),
      helper: 'podstron z różnicą',
      tone: 'blue',
      icon: 'files',
    },
    {
      id: 'content',
      label: CATEGORY_LABELS.content,
      value: tileValue(scopeContent, contentChanged),
      helper: scopeContent ? 'stron zmienionych' : 'pominięte w zakresie',
      tone: 'amber',
      icon: 'diff',
    },
    {
      id: 'links',
      label: CATEGORY_LABELS.links,
      value: tileValue(scopeLinks, linkIssues),
      helper: scopeLinks ? 'linków z różnicą' : 'pominięte w zakresie',
      tone: 'red',
      icon: 'alert',
    },
    {
      id: 'files',
      label: CATEGORY_LABELS.files,
      value: tileValue(scopeAttachments, fileIssues),
      helper: scopeAttachments ? 'plików z różnicą' : 'pominięte w zakresie',
      tone: 'green',
      icon: 'check',
    },
  ];
}

/** Builds the category overview table rows + right-panel breakdowns, used
 * by CategoryOverviewTable/CategoryDetailPanel on the Dashboard. */
export function buildCategoryOverview(report: ComparisonResult): CategoryOverviewEntry[] {
  const scopeContent = report.scope?.content ?? true;
  const scopeLinks = report.scope?.links ?? true;
  const scopeAttachments = report.scope?.attachments ?? true;

  const entries: CategoryOverviewEntry[] = [];

  // --- Podstrony ---
  {
    const total = report.unchanged_paths.length + report.missing_in_new.length + report.extra_in_new.length;
    const issues = report.missing_in_new.length + report.extra_in_new.length;
    const row: CategoryOverviewRow = {
      id: 'pages',
      label: CATEGORY_LABELS.pages,
      checked: total,
      issues,
      status: rowStatus(true, issues),
    };
    const breakdown: CategoryBreakdownStat[] = [
      { label: 'Łącznie podstron', value: total, tone: 'default' },
      { label: 'Bez zmian', value: report.unchanged_paths.length, tone: 'success' },
      { label: 'Brakujące na nowym adresie', value: report.missing_in_new.length, tone: 'danger' },
      { label: 'Zbędne — tylko na nowym', value: report.extra_in_new.length, tone: 'warning' },
    ];
    entries.push({ row, breakdown, emptyMessage: total === 0 ? 'Brak podstron do porównania.' : null });
  }

  // --- Zawartość ---
  {
    const checked = report.content_checked_count ?? 0;
    const changed = report.content_changed_count ?? 0;
    const row: CategoryOverviewRow = {
      id: 'content',
      label: CATEGORY_LABELS.content,
      checked,
      issues: changed,
      status: rowStatus(scopeContent, changed),
    };
    let breakdown: CategoryBreakdownStat[] = [];
    let emptyMessage: string | null = null;
    if (!scopeContent) {
      emptyMessage = 'Zawartość nie była porównywana dla tego raportu — zakres „Zawartość” był odznaczony.';
    } else if (checked === 0) {
      emptyMessage = 'Brak wspólnych podstron do porównania treści.';
    } else {
      breakdown = [
        { label: 'Sprawdzone strony', value: checked, tone: 'default' },
        { label: 'Zmienione', value: changed, tone: 'warning' },
        { label: 'Bez zmian', value: checked - changed, tone: 'success' },
      ];
    }
    entries.push({ row, breakdown, emptyMessage });
  }

  // --- Linki ---
  {
    const linkDiffs = report.link_diffs ?? [];
    const checked = linkDiffs.length;
    const okCount = linkDiffs.filter((l) => l.status === 'ok').length;
    const brokenCount = linkDiffs.filter((l) => l.status === 'broken').length;
    const newCount = linkDiffs.filter((l) => l.status === 'new').length;
    const removedCount = linkDiffs.filter((l) => l.status === 'removed').length;
    const issues = checked - okCount;
    const row: CategoryOverviewRow = {
      id: 'links',
      label: CATEGORY_LABELS.links,
      checked,
      issues,
      status: rowStatus(scopeLinks, issues),
    };
    let breakdown: CategoryBreakdownStat[] = [];
    let emptyMessage: string | null = null;
    if (!scopeLinks) {
      emptyMessage = 'Linki nie były porównywane dla tego raportu — zakres „Linki” był odznaczony.';
    } else if (checked === 0) {
      emptyMessage = 'Nie znaleziono żadnych linków do porównania.';
    } else {
      breakdown = [
        { label: 'Sprawdzone linki', value: checked, tone: 'default' },
        { label: 'OK', value: okCount, tone: 'success' },
        { label: 'Uszkodzone', value: brokenCount, tone: 'danger' },
        { label: 'Nowe', value: newCount, tone: 'default' },
        { label: 'Usunięte', value: removedCount, tone: 'default' },
      ];
    }
    entries.push({ row, breakdown, emptyMessage });
  }

  // --- Pliki ---
  {
    const fileDiffs = report.file_diffs ?? [];
    const checked = fileDiffs.length;
    const okCount = fileDiffs.filter((f) => f.status === 'ok').length;
    const differentCount = fileDiffs.filter((f) => f.status === 'different').length;
    const errorCount = fileDiffs.filter((f) => f.status === 'error404').length;
    const newCount = fileDiffs.filter((f) => f.status === 'new').length;
    const removedCount = fileDiffs.filter((f) => f.status === 'removed').length;
    const issues = checked - okCount;
    const row: CategoryOverviewRow = {
      id: 'files',
      label: CATEGORY_LABELS.files,
      checked,
      issues,
      status: rowStatus(scopeAttachments, issues),
    };
    let breakdown: CategoryBreakdownStat[] = [];
    let emptyMessage: string | null = null;
    if (!scopeAttachments) {
      emptyMessage = 'Pliki nie były porównywane dla tego raportu — zakres „Pliki” był odznaczony.';
    } else if (checked === 0) {
      emptyMessage = 'Nie znaleziono żadnych plików do porównania.';
    } else {
      breakdown = [
        { label: 'Sprawdzone pliki', value: checked, tone: 'default' },
        { label: 'OK', value: okCount, tone: 'success' },
        { label: 'Różnica w rozmiarze', value: differentCount, tone: 'warning' },
        { label: 'Błąd 404', value: errorCount, tone: 'danger' },
        { label: 'Nowe', value: newCount, tone: 'default' },
        { label: 'Usunięte', value: removedCount, tone: 'default' },
      ];
    }
    entries.push({ row, breakdown, emptyMessage });
  }

  return entries;
}
