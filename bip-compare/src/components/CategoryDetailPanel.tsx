import { Info, ArrowRight, Files, FileCode, Link2, FileStack } from 'lucide-react';
import type { CategoryId, CategoryOverviewEntry } from '../types';

const PAGE_ICONS: Record<CategoryId, typeof Files> = {
  pages: Files,
  content: FileCode,
  links: Link2,
  files: FileStack,
};

const TONE_CLASSES: Record<string, string> = {
  default: 'text-slate-900 dark:text-slate-100',
  success: 'text-emerald-600 dark:text-emerald-400',
  danger: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
};

interface CategoryDetailPanelProps {
  entry: CategoryOverviewEntry | null;
  onViewFullReport: () => void;
}

export default function CategoryDetailPanel({ entry, onViewFullReport }: CategoryDetailPanelProps) {
  if (!entry) {
    return (
      <aside className="hidden w-full shrink-0 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:flex lg:w-96 lg:flex-col lg:items-center lg:justify-center">
        <div className="text-center text-sm text-slate-400 dark:text-slate-500">
          <Info size={22} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          Wybierz kategorię z listy, aby zobaczyć szczegóły.
        </div>
      </aside>
    );
  }

  const Icon = PAGE_ICONS[entry.row.id];

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:w-96">
      <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-white/5 p-4">
        <Icon size={18} className="text-slate-500 dark:text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.row.label}</h2>
      </div>

      <div className="flex-1 space-y-4 p-4">
        {entry.emptyMessage ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">{entry.emptyMessage}</p>
        ) : (
          <dl className="space-y-2.5 text-sm">
            {entry.breakdown.map((stat) => (
              <div key={stat.label} className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">{stat.label}</dt>
                <dd className={`font-medium ${TONE_CLASSES[stat.tone]}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="border-t border-slate-200 dark:border-white/5 p-4">
        <button
          type="button"
          onClick={onViewFullReport}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-violet-900/30 hover:opacity-90"
        >
          Zobacz pełny raport
          <ArrowRight size={15} />
        </button>
      </div>
    </aside>
  );
}
