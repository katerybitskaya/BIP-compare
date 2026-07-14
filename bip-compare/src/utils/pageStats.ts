import type { ComparisonResult } from '../api/types';
import type { StatDefinition } from '../types';

/** Builds the report stat cards summarizing the page (podstrony) comparison,
 * mirroring buildContentStatItems/buildLinkStatItems/buildFileStatItems so
 * the Podstrony section uses the same stat-card style as the rest of the
 * report. */
export function buildPageStatItems(result: ComparisonResult): StatDefinition[] {
  const unchanged = result.unchanged_paths?.length ?? 0;
  const missing = result.missing_in_new?.length ?? 0;
  const extra = result.extra_in_new?.length ?? 0;
  const total = unchanged + missing + extra;

  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'pages-total',
      label: 'Przeanalizowane podstrony',
      value: String(total),
      helper: 'łącznie w raporcie',
      tone: 'blue',
      icon: 'globe',
    },
    {
      id: 'pages-unchanged',
      label: 'Podstrony bez zmian',
      value: String(unchanged),
      helper: `${pct(unchanged)} z podstron`,
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'pages-missing',
      label: 'Brakuje na nowym adresie',
      value: String(missing),
      helper: `${pct(missing)} z podstron`,
      tone: 'red',
      icon: 'file-x',
    },
    {
      id: 'pages-extra',
      label: 'Zbędnych na nowym adresie',
      value: String(extra),
      helper: `${pct(extra)} z podstron`,
      tone: 'amber',
      icon: 'file-plus',
    },
  ];
}
