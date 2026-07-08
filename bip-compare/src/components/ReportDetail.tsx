import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileText,
  Link2,
  Paperclip,
  Camera,
  Info,
} from 'lucide-react';
import type { ComparisonResult } from '../api/types';
import { getReport } from '../api/compareApi';
import { formatDateTime, formatDuration } from '../utils/format';
import { buildPageRows, buildStatItems } from '../utils/pageRows';
import type { PageRow } from '../utils/pageRows';
import StatCards from './StatCards';
import PageResultsTable from './PageResultsTable';
import PageDetailPanel from './PageDetailPanel';

interface ReportDetailProps {
  reportId: string;
  onBack: () => void;
}

function ScopeBadge({ active, label, Icon }: { active: boolean; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-400/20 dark:text-emerald-400'
          : 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-400/10 dark:text-slate-500'
      }`}
    >
      <Icon size={12} />
      {label}
      {active ? ' — sprawdzano' : ' — pominięto'}
    </span>
  );
}

export default function ReportDetail({ reportId, onBack }: ReportDetailProps) {
  const [report, setReport] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<PageRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedRow(null);
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

            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 dark:border-white/5 pt-4">
              <ScopeBadge active={report.scope?.content ?? false} label="Zawartość" Icon={FileText} />
              <ScopeBadge active={report.scope?.links ?? false} label="Linki" Icon={Link2} />
              <ScopeBadge active={report.scope?.attachments ?? false} label="Pliki" Icon={Paperclip} />
              <ScopeBadge active={false} label="Zrzuty ekranu (wkrótce)" Icon={Camera} />
            </div>
          </section>

          <section className="flex items-start gap-2.5 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 text-xs text-slate-500 dark:text-slate-400 shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <Info size={16} className="mt-0.5 shrink-0 text-violet-400" />
            <p>
              Ten raport porównuje: <strong className="text-slate-700 dark:text-slate-300">listę podstron</strong> (brakujące/zbędne/bez
              zmian — zawsze sprawdzane), <strong className="text-slate-700 dark:text-slate-300">zawartość</strong> (tekst i struktura
              HTML), <strong className="text-slate-700 dark:text-slate-300">linki</strong> (brakujące/dodatkowe/niedziałające) oraz{' '}
              <strong className="text-slate-700 dark:text-slate-300">załączone pliki</strong> (brakujące/dodatkowe/zmiana rozmiaru) — w
              zależności od zakresu wybranego przy uruchomieniu (patrz odznaki powyżej). Dla każdej podstrony można przejść bezpośrednio do
              starego i nowego adresu z panelu szczegółów poniżej. Zrzuty ekranu (porównanie wizualne) będą dodane w kolejnym etapie.
            </p>
          </section>

          <StatCards items={buildStatItems(report)} />

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <PageResultsTable
              rows={buildPageRows(report)}
              selectedPath={selectedRow?.path ?? null}
              onSelect={setSelectedRow}
            />
            <PageDetailPanel reportId={report.id} row={selectedRow} onClose={() => setSelectedRow(null)} />
          </div>
        </>
      )}
    </div>
  );
}
