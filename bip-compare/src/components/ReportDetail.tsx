import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileX,
  FilePlus,
  Loader2,
} from 'lucide-react';
import type { ComparisonResult } from '../api/types';
import { getReport } from '../api/compareApi';
import { formatDateTime, formatDuration } from '../utils/format';

interface ReportDetailProps {
  reportId: string;
  onBack: () => void;
}

export default function ReportDetail({ reportId, onBack }: ReportDetailProps) {
  const [report, setReport] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getReport(reportId)
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nie udało się pobrać raportu.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft size={16} />
        Wróć do listy raportów
      </button>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          Wczytywanie raportu…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 dark:border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {report && !loading && !error && (
        <>
          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Porównywane adresy</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">Stary adres:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 break-all">{report.old_url}</span>
                {report.old_site.reachable ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={14} /> działa (HTTP {report.old_site.root_status_code ?? '?'})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <XCircle size={14} /> niedostępna ({report.old_site.root_error ?? 'brak odpowiedzi'})
                  </span>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 dark:text-slate-500">Nowy adres:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100 break-all">{report.new_url}</span>
                {report.new_site.reachable ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={14} /> działa (HTTP {report.new_site.root_status_code ?? '?'})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                    <XCircle size={14} /> niedostępna ({report.new_site.root_error ?? 'brak odpowiedzi'})
                  </span>
                )}
              </p>
            </div>

            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {report.both_reachable
                ? `Obie strony odpowiadają. Przeszukano ${report.old_site.page_count} podstron starego adresu i ${report.new_site.page_count} podstron nowego adresu w ${formatDuration(report.duration_ms)}.`
                : 'Co najmniej jedna ze stron jest niedostępna, więc pełne porównanie podstron nie zostało wykonane.'}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Wygenerowano: {formatDateTime(report.generated_at)}
            </p>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 text-center shadow-lg shadow-slate-200/50 dark:shadow-black/20">
              <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{report.unchanged_paths.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">podstron bez zmian</p>
            </div>
            <div className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 text-center shadow-lg shadow-slate-200/50 dark:shadow-black/20">
              <p className="text-2xl font-semibold text-rose-600 dark:text-rose-400">{report.missing_in_new.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">brakuje na nowym adresie</p>
            </div>
            <div className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 text-center shadow-lg shadow-slate-200/50 dark:shadow-black/20">
              <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{report.extra_in_new.length}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">zbędnych na nowym adresie</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <FileX size={16} className="text-rose-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Podstrony, których brakuje na nowym adresie ({report.missing_in_new.length})
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto p-4">
              {report.missing_in_new.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Brak — wszystkie podstrony ze starego adresu istnieją na nowym.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.missing_in_new.map((entry) => (
                    <li key={entry.path} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-500/5 px-3 py-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200 break-all">{entry.path}</span>
                      <span className="text-xs text-rose-600 dark:text-rose-400">{entry.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <FilePlus size={16} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Podstrony zbędne — tylko na nowym adresie ({report.extra_in_new.length})
              </h3>
            </div>
            <div className="max-h-80 overflow-y-auto p-4">
              {report.extra_in_new.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Brak — nowy adres nie ma dodatkowych podstron względem starego.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {report.extra_in_new.map((entry) => (
                    <li key={entry.path} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/5 px-3 py-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200 break-all">{entry.path}</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400">{entry.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Podstrony bez zmian ({report.unchanged_paths.length})
              </h3>
            </div>
            <div className="max-h-60 overflow-y-auto p-4">
              {report.unchanged_paths.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Brak wspólnych podstron.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {report.unchanged_paths.map((path) => (
                    <span
                      key={path}
                      className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                    >
                      {path}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
