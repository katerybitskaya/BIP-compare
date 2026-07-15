import { CheckCircle2, XCircle, ArrowRight, Clock, Trash2 } from 'lucide-react';
import type { ReportSummary } from '../api/types';
import { formatDateTime } from '../utils/format';

interface ReportCardProps {
  report: ReportSummary;
  onClick: () => void;
  onDelete: () => void;
}

function ReachabilityBadge({ reachable }: { reachable: boolean }) {
  return reachable ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-emerald-400/20 dark:text-emerald-400">
      <CheckCircle2 size={12} /> Działa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-400/20 dark:text-rose-400">
      <XCircle size={12} /> Niedostępna
    </span>
  );
}

// Same per-category colors as the Dashboard tiles (buildOverviewStatItems in
// overviewRows.ts) -- Podstrony/Zawartość/Linki/Pliki each keep one fixed
// color everywhere in the app, so a category is recognizable at a glance.
const CATEGORY_TAG_STYLES: Record<string, string> = {
  pages: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  content: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  links: 'bg-red-500/10 text-red-600 dark:text-red-300',
  attachments: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
};

const CATEGORY_TAGS: Array<{ key: 'content' | 'links' | 'attachments'; label: string }> = [
  { key: 'content', label: 'Zawartość' },
  { key: 'links', label: 'Linki' },
  { key: 'attachments', label: 'Pliki' },
];

export default function ReportCard({ report, onClick, onDelete }: ReportCardProps) {
  const scope = report.scope;
  const activeCategories: Array<{ label: string; className: string }> = [
    { label: 'Podstrony', className: CATEGORY_TAG_STYLES.pages },
    ...CATEGORY_TAGS.filter((c) => (scope?.[c.key] ?? true)).map((c) => ({
      label: c.label,
      className: CATEGORY_TAG_STYLES[c.key],
    })),
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex w-full cursor-pointer flex-col gap-4 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 text-left shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur transition-colors hover:border-violet-400 dark:hover:border-violet-500/40"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
        <span className="flex items-center gap-1.5">
          <Clock size={12} />
          {formatDateTime(report.generated_at)}
        </span>
        <div className="flex items-center gap-2">
          {report.both_reachable ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
              Obie strony działają
            </span>
          ) : (
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400">
              Problem z dostępnością
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Usuń raport"
            title="Usuń raport"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={report.old_url}>
            {report.old_url}
          </span>
          <ReachabilityBadge reachable={report.old_reachable} />
        </div>
        <div className="flex items-center gap-2 pl-1 text-slate-400 dark:text-slate-500">
          <ArrowRight size={14} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={report.new_url}>
            {report.new_url}
          </span>
          <ReachabilityBadge reachable={report.new_reachable} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 dark:border-white/5 pt-3">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">Zakres:</span>
        {activeCategories.map((cat) => (
          <span key={cat.label} className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${cat.className}`}>
            {cat.label}
          </span>
        ))}
      </div>
    </div>
  );
}
