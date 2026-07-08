import { CheckCircle2, XCircle, ArrowRight, Clock } from 'lucide-react';
import type { ReportSummary } from '../api/types';
import { formatDateTime } from '../utils/format';

interface ReportCardProps {
  report: ReportSummary;
  onClick: () => void;
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

export default function ReportCard({ report, onClick }: ReportCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-4 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 text-left shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur transition-colors hover:border-violet-400 dark:hover:border-violet-500/40"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
        <span className="flex items-center gap-1.5">
          <Clock size={12} />
          {formatDateTime(report.generated_at)}
        </span>
        {report.both_reachable ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
            Obie strony działają
          </span>
        ) : (
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400">
            Problem z dostępnością
          </span>
        )}
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

      <div className="grid grid-cols-3 gap-2 border-t border-slate-200 dark:border-white/5 pt-3 text-center">
        <div>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{report.unchanged_count}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">bez zmian</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-rose-600 dark:text-rose-400">{report.missing_count}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">brakuje</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{report.extra_count}</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">zbędne</p>
        </div>
      </div>
    </button>
  );
}
