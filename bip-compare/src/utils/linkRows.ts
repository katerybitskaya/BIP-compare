import type { ComparisonResult, LinkDiffEntry } from '../api/types';
import type { LinkComparison, LinkStatus, StatDefinition } from '../types';

function isExternal(key: string): boolean {
  // Same-host links are keyed by normalized path (crawler._extract_page_content);
  // cross-host links are keyed by their full absolute URL instead.
  return !key.startsWith('/');
}

/** Maps the backend's site-wide LinkDiffEntry list onto a small UI-friendly
 * shape, mirroring how buildFileRows adapts FileDiffEntry for the file panel. */
export function buildLinkRows(result: ComparisonResult): LinkComparison[] {
  const entries: LinkDiffEntry[] = result.link_diffs ?? [];
  return entries.map((entry) => ({
    id: entry.key,
    text: entry.text || entry.key,
    path: entry.key,
    external: isExternal(entry.key),
    oldHref: entry.old?.href ?? null,
    newHref: entry.new?.href ?? null,
    oldHttp: entry.old?.status_code ?? null,
    newHttp: entry.new?.status_code ?? null,
    oldSourcePath: entry.old?.source_path ?? null,
    newSourcePath: entry.new?.source_path ?? null,
    oldWorks: entry.old?.ok ?? false,
    newWorks: entry.new?.ok ?? false,
    status: (entry.status as LinkStatus) ?? 'ok',
  }));
}

/** Builds the four report stat cards from the site-wide link comparison. */
export function buildLinkStatItems(result: ComparisonResult): StatDefinition[] {
  const entries: LinkDiffEntry[] = result.link_diffs ?? [];
  const total = entries.length;
  const brokenCount = entries.filter((e) => e.status === 'broken').length;
  const okCount = entries.filter((e) => e.status === 'ok').length;
  const newCount = entries.filter((e) => e.status === 'new').length;
  const removedCount = entries.filter((e) => e.status === 'removed').length;
  const changedCount = newCount + removedCount;

  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1).replace('.', ',')}%` : '–');

  return [
    {
      id: 'links',
      label: 'Porównane linki',
      value: String(total),
      helper: 'łącznie w raporcie',
      tone: 'blue',
      icon: 'link',
    },
    {
      id: 'ok',
      label: 'Linki OK',
      value: String(okCount),
      helper: `${pct(okCount)} z linków`,
      tone: 'green',
      icon: 'check',
    },
    {
      id: 'broken',
      label: 'Uszkodzone linki',
      value: String(brokenCount),
      helper: `${pct(brokenCount)} z linków`,
      tone: 'red',
      icon: 'alert',
    },
    {
      id: 'changed',
      label: 'Nowe / usunięte',
      value: `${newCount} / ${removedCount}`,
      helper: `${pct(changedCount)} z linków`,
      tone: 'amber',
      icon: 'swap',
    },
  ];
}
