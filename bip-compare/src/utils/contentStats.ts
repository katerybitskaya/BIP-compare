import type { ComparisonResult } from '../api/types';
import type { StatDefinition } from '../types';

/** Builds the report stat cards summarizing the on-demand content (HTML)
 * comparison, mirroring buildLinkStatItems/buildFileStatItems so all three
 * report sections (Zawartość/Linki/Pliki) show a consistent stat-card row. */
export function buildContentStatItems(result: ComparisonResult): StatDefinition[] {
  const checked = result.content_checked_count ?? 0;
  const changed = result.content_changed_count ?? 0;
  const unchanged = Math.max(checked - changed, 0);

  const pct = (n: number) => (checked > 0 ? `${((n / checked) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'content-checked',
      label: 'Sprawdzone strony',
      value: String(checked),
      helper: `${pct(checked)} z zaplanowanego`,
      tone: 'blue',
      icon: 'code',
    },
    {
      id: 'content-changed',
      label: 'Zmienione',
      value: String(changed),
      helper: `${pct(changed)} ze sprawdzonych`,
      tone: 'amber',
      icon: 'diff',
    },
    {
      id: 'content-unchanged',
      label: 'Bez zmian',
      value: String(unchanged),
      helper: `${pct(unchanged)} ze sprawdzonych`,
      tone: 'green',
      icon: 'check',
    },
  ];
}
