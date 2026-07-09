import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, Link2, ExternalLink } from 'lucide-react';
import type { LinkComparison, LinkStatus } from '../types';
import LinkStatusBadge from './LinkStatusBadge';

const PAGE_SIZE = 6;

const FILTERS: Array<{ key: LinkStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'ok', label: 'OK' },
  { key: 'broken', label: 'Uszkodzone' },
  { key: 'new', label: 'Nowe' },
  { key: 'removed', label: 'Usunięte' },
];

interface LinkResultsTableProps {
  links: LinkComparison[];
  selectedId: string | null;
  onSelect: (link: LinkComparison) => void;
}

export default function LinkResultsTable({ links, selectedId, onSelect }: LinkResultsTableProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LinkStatus | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return links.filter((l) => {
      const matchesQuery = q === '' || l.text.toLowerCase().includes(q) || l.path.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [links, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const startIdx = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(safePage * PAGE_SIZE, filtered.length);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleFilterChange(key: LinkStatus | 'all') {
    setStatusFilter(key);
    setPage(1);
    setFilterOpen(false);
  }

  const pageNumbers = useMemo(() => {
    const nums: number[] = [];
    const max = Math.min(totalPages, 5);
    for (let i = 1; i <= max; i++) nums.push(i);
    return nums;
  }, [totalPages]);

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Wyniki – linki</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-3 py-1.5">
            <Search size={15} className="text-slate-400 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              type="text"
              placeholder="Szukaj linku…"
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
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <th className="px-4 py-3">Link</th>
              <th className="px-3 py-3">Stary status</th>
              <th className="px-3 py-3">Nowy status</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((link) => {
              const isSelected = link.id === selectedId;
              return (
                <tr
                  key={link.id}
                  onClick={() => onSelect(link)}
                  className={`cursor-pointer border-t border-slate-200 dark:border-white/5 transition-colors ${
                    isSelected ? 'bg-violet-500/10' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {link.external ? (
                        <ExternalLink size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
                      ) : (
                        <Link2 size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
                      )}
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-200" title={link.path}>
                        {link.text}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {link.oldHttp ?? '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {link.newHttp ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <LinkStatusBadge status={link.status} />
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                  Brak linków spełniających kryteria wyszukiwania.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {filtered.length === 0
            ? '0 z 0 linków'
            : `${startIdx}-${endIdx} z ${filtered.length} linków`}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-white/10 text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <ChevronLeft size={15} />
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                n === safePage
                  ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-md shadow-violet-900/40'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {n}
            </button>
          ))}
          {totalPages > 5 && <span className="px-1 text-slate-400 dark:text-slate-500">…</span>}
          {totalPages > 5 && (
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                safePage === totalPages
                  ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-md shadow-violet-900/40'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {totalPages}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 dark:border-white/10 text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
