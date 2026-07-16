import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { GitCompare, History, Sparkles, Columns2, MoveHorizontal, Search, SlidersHorizontal } from 'lucide-react';
import type { ComparisonResult, ScreenshotDiffEntry } from '../api/types';
import { getScreenshotUrl } from '../api/compareApi';

interface ScreenshotComparisonSectionProps {
  reportId: string;
  report: ComparisonResult;
  screenshots: { old: string[]; new: string[] } | null;
}

type ViewMode = 'diff' | 'old' | 'new' | 'side' | 'slider';
type GroupId = 'wspolne' | 'stara' | 'nowa';

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
  hasOld: boolean;
  hasNew: boolean;
}

const VIEW_MODES: { id: ViewMode; label: string; icon: typeof GitCompare; requires: (o: PageOption, hasDiff: boolean) => boolean }[] = [
  { id: 'diff', label: 'Różnica', icon: GitCompare, requires: (_o, hasDiff) => hasDiff },
  { id: 'side', label: 'Obok siebie', icon: Columns2, requires: (o) => o.hasOld && o.hasNew },
  { id: 'slider', label: 'Suwak', icon: MoveHorizontal, requires: (o) => o.hasOld && o.hasNew },
  { id: 'old', label: 'Stara wersja', icon: History, requires: (o) => o.hasOld },
  { id: 'new', label: 'Nowa wersja', icon: Sparkles, requires: (o) => o.hasNew },
];

function statusBadge(diff: ScreenshotDiffEntry | undefined): { text: string; className: string } | null {
  if (!diff) return null;
  return diff.status === 'identical'
    ? { text: 'identyczne', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
    : { text: `${diff.diff_percent}% różnicy`, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' };
}

/** Classic before/after image comparison slider: the "new" screenshot sits
 * on top of the "old" one, clipped to a draggable divider -- drag left to
 * reveal more of the old version, right to reveal more of the new one.
 * Uses pointer capture (not window-level listeners) so dragging keeps
 * working even if the cursor leaves the image bounds mid-drag. */
function BeforeAfterSlider({ oldSrc, newSrc, oldAlt, newAlt }: { oldSrc: string; newSrc: string; oldAlt: string; newAlt: string }) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function updateFromClientX(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, ratio)));
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    updateFromClientX(e.clientX);
  }
  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-lg border border-slate-200 dark:border-white/10"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img src={oldSrc} alt={oldAlt} draggable={false} className="block w-full select-none" />
      {/* Overlay is pinned to the exact same box as the base image (inset-0) and
          just visually clipped to the left pos% via clip-path -- the <img>
          inside renders at its natural full width, so it lines up pixel-for-
          pixel with the base image instead of being squeezed/scaled by a
          narrower wrapper. */}
      <div
        className="pointer-events-none absolute inset-0 select-none"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img src={newSrc} alt={newAlt} draggable={false} className="block w-full select-none" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" style={{ left: `${pos}%` }} />
      <div
        className="pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg"
        style={{ left: `${pos}%` }}
      >
        <MoveHorizontal size={16} />
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">stara</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">nowa</span>
    </div>
  );
}

export default function ScreenshotComparisonSection({ reportId, report, screenshots }: ScreenshotComparisonSectionProps) {
  const pageOptions = useMemo<PageOption[]>(() => {
    const oldSet = new Set(screenshots?.old ?? []);
    const newSet = new Set(screenshots?.new ?? []);
    const allPaths = Array.from(new Set([...oldSet, ...newSet])).sort();
    return allPaths.map((path) => {
      const hasOld = oldSet.has(path);
      const hasNew = newSet.has(path);
      const group: GroupId = hasOld && hasNew ? 'wspolne' : hasOld ? 'stara' : 'nowa';
      return { path, group, hasOld, hasNew };
    });
  }, [screenshots]);

  const diffByPath = useMemo(() => {
    const map = new Map<string, ScreenshotDiffEntry>();
    for (const entry of report.screenshot_diffs ?? []) map.set(entry.path, entry);
    return map;
  }, [report]);

  const [selectedPath, setSelectedPath] = useState<string | null>(pageOptions[0]?.path ?? null);
  const [mode, setMode] = useState<ViewMode>('diff');
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<GroupId | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);

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
        Brak podstron ze zrzutami ekranów do porównania.
      </p>
    );
  }

  const selected = pageOptions.find((p) => p.path === selectedPath) ?? null;
  const diff = selected ? diffByPath.get(selected.path) : undefined;
  const badge = statusBadge(diff);

  function selectPath(option: PageOption) {
    setSelectedPath(option.path);
    const hasDiff = diffByPath.has(option.path);
    const availableModes = VIEW_MODES.filter((m) => m.requires(option, hasDiff)).map((m) => m.id);
    if (!availableModes.includes(mode)) {
      setMode(availableModes[0] ?? 'old');
    }
  }

  function handleGroupChange(key: GroupId | 'all') {
    setGroupFilter(key);
    setFilterOpen(false);
  }

  const oldUrl = selected ? getScreenshotUrl(reportId, 'old', selected.path) : '';
  const newUrl = selected ? getScreenshotUrl(reportId, 'new', selected.path) : '';
  const diffUrl = selected ? getScreenshotUrl(reportId, 'diff', selected.path) : '';

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
                      ? 'bg-pink-500/15 text-pink-700 dark:text-pink-300'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-[32rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 dark:bg-white/[0.03] p-3">
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
                        onClick={() => selectPath(item)}
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
          {VIEW_MODES.map(({ id, label, icon: Icon, requires }) => {
            const enabled = selected ? requires(selected, diffByPath.has(selected.path)) : false;
            return (
              <button
                key={id}
                type="button"
                disabled={!enabled}
                onClick={() => setMode(id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  !enabled
                    ? 'cursor-not-allowed border-transparent text-slate-300 dark:text-slate-700'
                    : mode === id
                      ? 'border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-slate-100'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
          {badge && (
            <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.className}`}>{badge.text}</span>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-3">
          {!selected ? (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              Wybierz podstronę z listy, aby zobaczyć zrzuty ekranów.
            </p>
          ) : (
            <div className="max-h-[75vh] overflow-y-auto">
              {mode === 'diff' &&
                (diff ? (
                  <img src={diffUrl} alt={`Różnice — ${selected.path}`} className="block w-full rounded-lg" loading="lazy" />
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Brak obliczonej różnicy dla tej podstrony.</p>
                ))}

              {mode === 'old' &&
                (selected.hasOld ? (
                  <img src={oldUrl} alt={`Stara wersja — ${selected.path}`} className="block w-full rounded-lg" loading="lazy" />
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Brak zrzutu starej wersji.</p>
                ))}

              {mode === 'new' &&
                (selected.hasNew ? (
                  <img src={newUrl} alt={`Nowa wersja — ${selected.path}`} className="block w-full rounded-lg" loading="lazy" />
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Brak zrzutu nowej wersji.</p>
                ))}

              {mode === 'side' &&
                (selected.hasOld && selected.hasNew ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="mb-1 text-[11px] text-slate-400 dark:text-slate-500">Stary adres</p>
                      <img src={oldUrl} alt={`Stara wersja — ${selected.path}`} className="block w-full rounded-lg border border-slate-200 dark:border-white/10" loading="lazy" />
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] text-slate-400 dark:text-slate-500">Nowy adres</p>
                      <img src={newUrl} alt={`Nowa wersja — ${selected.path}`} className="block w-full rounded-lg border border-slate-200 dark:border-white/10" loading="lazy" />
                    </div>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Podstrona istnieje tylko na jednej wersji.</p>
                ))}

              {mode === 'slider' &&
                (selected.hasOld && selected.hasNew ? (
                  <BeforeAfterSlider
                    oldSrc={oldUrl}
                    newSrc={newUrl}
                    oldAlt={`Stara wersja — ${selected.path}`}
                    newAlt={`Nowa wersja — ${selected.path}`}
                  />
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Podstrona istnieje tylko na jednej wersji.</p>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
