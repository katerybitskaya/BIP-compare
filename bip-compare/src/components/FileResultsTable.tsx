import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { FileComparison, FileStatus } from '../types';
import FileIcon from './FileIcon';
import StatusBadge from './StatusBadge';
import { formatSize } from '../utils/format';

const PAGE_SIZE = 6;

const FILTERS: Array<{ key: FileStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'ok', label: 'OK' },
  { key: 'different', label: 'Różnice' },
  { key: 'error404', label: 'Błędy 404' },
  { key: 'new', label: 'Nowe' },
  { key: 'removed', label: 'Usunięte' },
];

interface FileResultsTableProps {
  files: FileComparison[];
  selectedId: string | null;
  onSelect: (file: FileComparison) => void;
}

export default function FileResultsTable({ files, selectedId, onSelect }: FileResultsTableProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FileStatus | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      const matchesQuery = q === '' || f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [files, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const startIdx = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(safePage * PAGE_SIZE, filtered.length);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleFilterChange(key: FileStatus | 'all') {
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
    <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Wyniki – pliki</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-3 py-1.5">
            <Search size={15} className="text-slate-400 dark:text-slate-500" />
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              type="text"
              placeholder="Szukaj pliku…"
              className="w-36 bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-600 sm:w-44"
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
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-300 dark:border-white/10 bg-[#131829] p-1.5 shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => handleFilterChange(f.key)}
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm ${
                      statusFilter === f.key
                        ? 'bg-violet-500/15 text-violet-300'
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
              <th className="px-4 py-3">Plik</th>
              <th className="px-3 py-3">Stary rozmiar</th>
              <th className="px-3 py-3">Nowy rozmiar</th>
              <th className="px-3 py-3">Pobranie</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((file) => {
              const isSelected = file.id === selectedId;
              return (
                <tr
                  key={file.id}
                  onClick={() => onSelect(file)}
                  className={`cursor-pointer border-t border-slate-200 dark:border-white/5 transition-colors ${
                    isSelected ? 'bg-violet-500/10' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FileIcon kind={file.kind} size={16} />
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-200">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {formatSize(file.oldSizeKb)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {formatSize(file.newSizeKb)}
                  </td>
                  <td className="px-3 py-3">
                    <Download
                      size={16}
                      className={file.newDownloadOk ? 'text-emerald-400' : 'text-rose-400'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={file.status} />
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                  Brak plików spełniających kryteria wyszukiwania.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {filtered.length === 0
            ? '0 z 0 plików'
            : `${startIdx}-${endIdx} z ${filtered.length} plików`}
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
                  ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-slate-900 dark:text-white shadow-md shadow-violet-900/40'
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
                  ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-slate-900 dark:text-white shadow-md shadow-violet-900/40'
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
