import { Check, X, ArrowRight, Clock, Trash2, Globe, FileCode, Link2, FileStack, Camera } from 'lucide-react';
import type { ReportSummary } from '../api/types';
import { formatDateTime } from '../utils/format';

interface ReportCardProps {
  report: ReportSummary;
  onClick: () => void;
  onDelete: () => void;
}

function ReachabilityMark({ reachable }: { reachable: boolean }) {
  return reachable ? (
    <Check size={13} className="shrink-0 text-emerald-500 dark:text-emerald-400" strokeWidth={3} />
  ) : (
    <X size={13} className="shrink-0 text-rose-500 dark:text-rose-400" strokeWidth={3} />
  );
}

// Color is reserved for status (works / broken) -- categories are told apart
// by icon + label only, all sharing one neutral, low-contrast style. Same
// icons used for these categories elsewhere in the app (ReportDetail section
// headers), so a category is recognizable by shape everywhere, not by hue.
const CATEGORY_TAGS: Array<{
  key: 'content' | 'links' | 'attachments' | 'screenshots' | null;
  label: string;
  Icon: typeof Globe;
  // Whether this category counts as "on" for reports saved before its scope
  // field existed (scope?.[key] is undefined) -- matches each field's real
  // default (content/links/attachments default to on, screenshots to off),
  // so an old report that predates the "Zrzuty ekranów" feature doesn't
  // incorrectly show that chip as active.
  defaultOn: boolean;
}> = [
  { key: null, label: 'Podstrony', Icon: Globe, defaultOn: true },
  { key: 'content', label: 'Zawartość', Icon: FileCode, defaultOn: true },
  { key: 'links', label: 'Linki', Icon: Link2, defaultOn: true },
  { key: 'attachments', label: 'Pliki', Icon: FileStack, defaultOn: true },
  { key: 'screenshots', label: 'Zrzuty ekranów', Icon: Camera, defaultOn: false },
];

export default function ReportCard({ report, onClick, onDelete }: ReportCardProps) {
  const scope = report.scope;
  const activeCategories = CATEGORY_TAGS.filter((c) => c.key === null || (scope?.[c.key] ?? c.defaultOn));

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
      className={`flex w-full cursor-pointer flex-col gap-4 rounded-2xl border bg-white dark:bg-white/[0.03] p-5 text-left shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur transition-colors hover:border-violet-400 dark:hover:border-violet-500/40 ${
        report.both_reachable
          ? 'border-slate-300 dark:border-white/10'
          : 'border-rose-300 dark:border-rose-500/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
        <span className="flex items-center gap-1.5">
          <Clock size={12} />
          {formatDateTime(report.generated_at)}
        </span>
        <div className="flex items-center gap-2">
          {report.both_reachable ? (
            <span className="flex items-center gap-1 font-medium text-slate-400 dark:text-slate-500">
              <Check size={13} className="text-emerald-500 dark:text-emerald-400" strokeWidth={3} />
              Obie strony działają
            </span>
          ) : (
            <span className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
              <X size={13} strokeWidth={3} />
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
          <ReachabilityMark reachable={report.old_reachable} />
          <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={report.old_url}>
            {report.old_url}
          </span>
          {!report.old_reachable && <span className="shrink-0 text-[11px] text-rose-500 dark:text-rose-400">niedostępna</span>}
        </div>
        <div className="flex items-center gap-2 pl-1 text-slate-400 dark:text-slate-500">
          <ArrowRight size={14} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <ReachabilityMark reachable={report.new_reachable} />
          <span className="truncate font-medium text-slate-900 dark:text-slate-100" title={report.new_url}>
            {report.new_url}
          </span>
          {!report.new_reachable && <span className="shrink-0 text-[11px] text-rose-500 dark:text-rose-400">niedostępna</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 dark:border-white/5 pt-3">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">Zakres:</span>
        {activeCategories.map(({ label, Icon }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 dark:border-white/10 bg-slate-100/60 dark:bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400"
          >
            <Icon size={11} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
