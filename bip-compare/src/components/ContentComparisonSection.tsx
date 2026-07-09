import { useEffect, useMemo, useState } from 'react';
import { AlignLeft, Code2, Layers, Loader2, AlertTriangle, Search, SlidersHorizontal } from 'lucide-react';
import type { ComparisonResult, PageContentDiff } from '../api/types';
import { getContentDiff } from '../api/compareApi';

interface ContentComparisonSectionProps {
  reportId: string;
  report: ComparisonResult;
}

type TabId = 'text' | 'structure' | 'html';
type GroupId = 'wspolne' | 'stara' | 'nowa';

const TABS: { id: TabId; label: string; icon: typeof AlignLeft }[] = [
  { id: 'text', label: 'Tekst', icon: AlignLeft },
  { id: 'structure', label: 'Struktura', icon: Layers },
  { id: 'html', label: 'Kod HTML', icon: Code2 },
];

const GROUP_LABELS: Record<GroupId, string> = {
  wspolne: 'Wspólne podstrony',
  stara: 'Tylko na starym adresie',
  nowa: 'Tylko na nowym adresie',
};

const GROUP_FILTERS: Array<{ key: GroupId | 'all'; label: string }> = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'wspolne', label: GROUP_LABELS.wspolne },
  { key: 'stara', label: GROUP_LABELS.stara },
  { key: 'nowa', label: GROUP_LABELS.nowa },
];

interface PageOption {
  path: string;
  group: GroupId;
}

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'same':
      return { text: 'bez zmian', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
    case 'changed':
      return { text: 'różnice', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' };
    case 'added':
      return { text: 'tylko na nowym adresie', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' };
    case 'removed':
      return { text: 'tylko na starym adresie', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' };
    default:
      return { text: status, className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' };
  }
}

function lineClasses(kind: string): string {
  if (kind === 'del') return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (kind === 'ins') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  return 'text-slate-600 dark:text-slate-300';
}

function linePrefix(kind: string): string {
  if (kind === 'del') return '−';
  if (kind === 'ins') return '+';
  return ' ';
}

export default function ContentComparisonSection({ reportId, report }: ContentComparisonSectionProps) {
  const pageOptions = useMemo<PageOption[]>(() => {
    const wspolne = report.unchanged_paths.map((path) => ({ path, group: 'wspolne' as const }));
    const stara = report.missing_in_new.map((entry) => ({ path: entry.path, group: 'stara' as const }));
    const nowa = report.extra_in_new.map((entry) => ({ path: entry.path, group: 'nowa' as const }));
    return [...wspolne, ...stara, ...nowa];
  }, [report]);

  const [selectedPath, setSelectedPath] = useState<string | null>(pageOptions[0]?.path ?? null);
  const [tab, setTab] = useState<TabId>('text');
  const [diff, setDiff] = useState<PageContentDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (!selectedPath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getContentDiff(reportId, selectedPath)
      .then((data) => {
        if (!cancelled) setDiff(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nie udało się pobrać porównania treści.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, selectedPath]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pageOptions.filter((p) => {
      const matchesQuery = q === '' || p.path.toLowerCase().includes(q);
      const matchesGroup = groupFilter === 'all' || p.group === groupFilter;
      return matchesQuery && matchesGroup;
    });
  }, [pageOptions, query, groupFilter]);

  if (pageOptions.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500">
        Brak podstron do porównania treści — obie witryny nie mają wspólnych ani unikalnych podstron.
      </p>
    );
  }

  function handleGroupChange(key: GroupId | 'all') {
    setGroupFilter(key);
    setFilterOpen(false);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-slate-400 dark:text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="Szukaj podstrony…"
            className="w-full min-w-0 bg-transparent text-xs text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600"
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/10 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <SlidersHorizontal size={13} />
            {groupFilter === 'all' ? 'Filtruj' : GROUP_LABELS[groupFilter]}
          </button>
          {filterOpen && (
            <div className="absolute left-0 right-0 z-10 mt-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131829] p-1.5 shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
              {GROUP_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => handleGroupChange(f.key)}
                  className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs ${
                    groupFilter === f.key
                      ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl bg-slate-50 dark:bg-white/[0.03] p-3">
          {filteredOptions.length === 0 ? (
            <p className="px-1 text-xs text-slate-400 dark:text-slate-500">Brak podstron spełniających kryteria.</p>
          ) : (
            (['wspolne', 'stara', 'nowa'] as const).map((group) => {
              const items = filteredOptions.filter((p) => p.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {GROUP_LABELS[group]}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => setSelectedPath(item.path)}
                        className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs ${
                          selectedPath === item.path
                            ? 'bg-white dark:bg-white/10 font-medium text-slate-900 dark:text-slate-100 shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/5'
                        }`}
                        title={item.path}
                      >
                        {item.path}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                tab === id
                  ? 'border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
          {diff && (
            <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${statusLabel(diff.status).className}`}>
              {statusLabel(diff.status).text}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              Wczytywanie porównania…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!selectedPath && !loading && !error && (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              Wybierz podstronę z listy, aby zobaczyć porównanie.
            </p>
          )}

          {diff && !loading && !error && (
            <>
              {tab === 'text' && (
                <div className="max-h-96 space-y-0.5 overflow-y-auto font-mono text-xs">
                  {diff.text_diff.length === 0 ? (
                    <p className="font-sans text-slate-400 dark:text-slate-500">Brak tekstu do porównania.</p>
                  ) : (
                    diff.text_diff.map((line, idx) => (
                      <div key={idx} className={`rounded px-2 py-0.5 whitespace-pre-wrap break-words ${lineClasses(line.kind)}`}>
                        <span className="mr-1.5 select-none opacity-60">{linePrefix(line.kind)}</span>
                        {line.text || ' '}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'structure' && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 dark:text-slate-500">
                      <th className="px-2 py-1 text-left font-medium">Znacznik</th>
                      <th className="px-2 py-1 text-right font-medium">Stara</th>
                      <th className="px-2 py-1 text-right font-medium">Nowa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.structure_diff.map((row) => (
                      <tr
                        key={row.tag}
                        className={row.changed ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300'}
                      >
                        <td className="px-2 py-1 font-mono">&lt;{row.tag}&gt;</td>
                        <td className="px-2 py-1 text-right">{row.old ?? '—'}</td>
                        <td className="px-2 py-1 text-right">{row.new ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tab === 'html' && (
                <div className="max-h-96 space-y-0.5 overflow-y-auto font-mono text-xs">
                  {diff.html_diff.length === 0 ? (
                    <p className="font-sans text-slate-400 dark:text-slate-500">Brak kodu HTML do porównania.</p>
                  ) : (
                    diff.html_diff.map((line, idx) => (
                      <div key={idx} className={`rounded px-2 py-0.5 whitespace-pre-wrap break-all ${lineClasses(line.kind)}`}>
                        <span className="mr-1.5 select-none opacity-60">{linePrefix(line.kind)}</span>
                        {line.text || ' '}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
