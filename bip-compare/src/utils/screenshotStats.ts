import type { ComparisonResult } from '../api/types';
import type { StatDefinition } from '../types';

/** Builds the report stat cards for the Zrzuty ekranów section, mirroring
 * buildContentStatItems' 4-tile layout: total analyzed / unchanged / changed
 * / only-on-one-side. Needs the raw screenshot manifest (old/new captured
 * paths) on top of the report itself -- result.screenshot_diffs alone only
 * covers paths captured on BOTH sides, so "Przeanalizowane zrzuty" would
 * undercount (missing every page that only exists on one version) without
 * it, same as content_checked_count alone undercounts "Sprawdzone strony"
 * in buildContentStatItems. */
export function buildScreenshotStatItems(
  result: ComparisonResult,
  screenshots: { old: string[]; new: string[] } | null
): StatDefinition[] {
  const oldPaths = screenshots?.old ?? [];
  const newPaths = screenshots?.new ?? [];
  const oldSet = new Set(oldPaths);
  const newSet = new Set(newPaths);
  const allPaths = new Set<string>([...oldPaths, ...newPaths]);
  const total = allPaths.size;

  const entries = result.screenshot_diffs ?? [];
  const identicalCount = entries.filter((e) => e.status === 'identical').length;
  const differentCount = entries.filter((e) => e.status === 'different').length;

  let onlyOneSide = 0;
  for (const path of allPaths) {
    if (oldSet.has(path) !== newSet.has(path)) onlyOneSide += 1;
  }

  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'screenshots-total',
      label: 'Przeanalizowane zrzuty',
      value: String(total),
      helper: 'łącznie w raporcie',
      tone: 'blue',
      icon: 'files',
    },
    {
      id: 'screenshots-unchanged',
      label: 'Bez zmian',
      value: String(identicalCount),
      helper: `${pct(identicalCount)} z zrzutów`,
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'screenshots-changed',
      label: 'Zmienione',
      value: String(differentCount),
      helper: `${pct(differentCount)} z zrzutów`,
      tone: 'amber',
      icon: 'diff',
    },
    {
      id: 'screenshots-per-site',
      label: 'Tylko na starym/nowym adresie',
      value: String(onlyOneSide),
      helper: `${pct(onlyOneSide)} z zrzutów`,
      tone: 'red',
      icon: 'alert',
    },
  ];
}
