import type { ComparisonResult } from '../api/types';
import type { StatDefinition } from '../types';

/** Builds the report stat cards summarizing the on-demand content (HTML)
 * comparison, mirroring buildLinkStatItems/buildFileStatItems so all three
 * report sections (Zawartość/Linki/Pliki) show a consistent stat-card row.
 *
 * "Sprawdzone strony" shows every page from the Podstrony analysis with no
 * exceptions (common pages + pages found only on old + pages found only on
 * new) -- content comparison of the meta pages (historia zmian, mapa
 * strony) themselves is included too; only what's found INSIDE them is
 * excluded, and that exclusion happens at the crawler/podstrony level, not
 * here. "Zmienione"/"Bez zmian" only apply to common pages, since content
 * can only be diffed where both versions exist. A 4th tile shows how many
 * pages exist on only one of the two sites (missing + extra), excluding
 * anything common to both. */
export function buildContentStatItems(result: ComparisonResult): StatDefinition[] {
  const checked = result.content_checked_count ?? 0;
  const changed = result.content_changed_count ?? 0;
  const unchanged = Math.max(checked - changed, 0);

  const missing = result.missing_in_new?.length ?? 0;
  const extra = result.extra_in_new?.length ?? 0;
  const common = result.unchanged_paths?.length ?? 0;
  const totalPages = common + missing + extra;

  const pct = (n: number) => (totalPages > 0 ? `${((n / totalPages) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'content-total',
      label: 'Sprawdzone podstrony',
      value: String(totalPages),
      helper: 'łącznie w raporcie',
      tone: 'blue',
      icon: 'code',
    },
    {
      id: 'content-unchanged',
      label: 'Bez zmian',
      value: String(unchanged),
      helper: `${pct(unchanged)} z podstron`,
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'content-changed',
      label: 'Zmienione',
      value: String(changed),
      helper: `${pct(changed)} z podstron`,
      tone: 'amber',
      icon: 'diff',
    },
    {
      id: 'content-per-site',
      label: 'Tylko na starym/nowym adresie',
      value: String(missing + extra),
      helper: `${pct(missing + extra)} z podstron`,
      tone: 'red',
      icon: 'alert',
    },
  ];
}
