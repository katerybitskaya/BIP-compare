import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Files, FileCode, Link2, FileStack, Camera } from 'lucide-react';
import type { CategoryId, CategoryOverviewRow, CategoryStatus } from '../types';

const PAGE_ICONS: Record<CategoryId, typeof Files> = {
  pages: Files,
  content: FileCode,
  links: Link2,
  files: FileStack,
  screenshots: Camera,
};

const STATUS_CONFIG: Record<CategoryStatus, { label: string; bg: string; text: string; ring: string }> = {
  ok: { label: 'OK', bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-1 ring-emerald-400/20' },
  issues: { label: 'Z problemami', bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-1 ring-amber-400/20' },
  skipped: { label: 'Pominięte', bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-1 ring-slate-400/20' },
};

const FILTERS: Array<{ key: CategoryStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'ok', label: 'OK' },
  { key: 'issues', label: 'Z problemami' },
  { key: 'skipped', label: 'Pominięte' },
];

interface CategoryOverviewTableProps {
  rows: CategoryOverviewRow[];
  selectedId: CategoryId | null;
  onSelect: (row: CategoryOverviewRow) => void;
}

export default function CategoryOverviewTable({ rows, selectedId, onSelect }: CategoryOverviewTableProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CategoryStatus | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery = q === '' || r.label.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  function handleFilterChange(key: CategoryStatus | 'all') {
    setStatusFilter(key);
    setFilterOpen(false);
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Wyniki – przegląd raportu</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-3 py-1.5">
            <Search size={15} className="text-slate-400 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="text"
              placeholder="Szukaj kategorii…"
              className="w-36 bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 sm:w-44"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/10 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <SlidersHorizontal size={14} />
              Filtruj
            </button>
            {filterOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131829] p-1.5 shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => handleFilterChange(f.key)}
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm ${
                      statusFilter === f.key
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
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <th className="px-4 py-3">Kategoria</th>
              <th className="px-3 py-3">Sprawdzono</th>
              <th className="px-3 py-3">Problemy</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isSelected = row.id === selectedId;
              const Icon = PAGE_ICONS[row.id];
              const cfg = STATUS_CONFIG[row.status];
              return (
                <tr
                  key={row.id}
                  onClick={() => onSelect(row)}
                  className={`cursor-pointer border-t border-slate-200 dark:border-white/5 transition-colors ${
                    isSelected ? 'bg-violet-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-200">{row.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {row.status === 'skipped' ? '—' : row.checked}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {row.status === 'skipped' ? '—' : row.issues}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                  Brak kategorii spełniających kryteria wyszukiwania.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 dark:border-white/5 p-4">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {filtered.length === 0 ? '0 z 0 kategorii' : `${filtered.length} z ${rows.length} kategorii`}
        </p>
      </div>
    </section>
  );
}
