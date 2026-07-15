import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileX,
  FilePlus,
  Loader2,
  FileCode,
  Link2,
  FileStack,
  Globe,
  ExternalLink,
} from 'lucide-react';
import type { ComparisonResult } from '../api/types';
import { getReport } from '../api/compareApi';
import { formatDateTime, formatDuration } from '../utils/format';
import ContentComparisonSection from './ContentComparisonSection';
import LinkResultsTable from './LinkResultsTable';
import LinkDetailPanel from './LinkDetailPanel';
import FileResultsTable from './FileResultsTable';
import FileDetailPanel from './FileDetailPanel';
import StatCards from './StatCards';
import { buildLinkRows, buildLinkStatItems } from '../utils/linkRows';
import { buildFileRows, buildFileStatItems } from '../utils/fileRows';
import { buildContentStatItems } from '../utils/contentStats';
import { buildPageStatItems } from '../utils/pageStats';
import type { FileComparison, LinkComparison } from '../types';

interface ReportDetailProps {
  reportId: string;
  onBack: () => void;
}

function ScopeChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
        active
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
      }`}
    >
      {label}: {active ? 'porównywane' : 'pominięte'}
    </span>
  );
}

export default function ReportDetail({ reportId, onBack }: ReportDetailProps) {
  const [report, setReport] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<LinkComparison | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileComparison | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedLink(null);
    setSelectedFile(null);
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

  const pageStatItems = useMemo(() => (report ? buildPageStatItems(report) : []), [report]);
  const contentStatItems = useMemo(() => (report ? buildContentStatItems(report) : []), [report]);
  // Raw page_count counts every fetch attempt during the crawl (including
  // ones that failed, or turned out to be noise like audit-history pages) --
  // it can be far bigger than what the report actually analyzed. Summing
  // the same fields the tiles below use (unchanged/missing/extra) instead
  // keeps this number consistent with the rest of the report, with no extra
  // data loading since it's all already part of the loaded report.
  const oldAnalyzedCount = useMemo(
    () => (report ? report.unchanged_paths.length + report.missing_in_new.length : 0),
    [report]
  );
  const newAnalyzedCount = useMemo(
    () => (report ? report.unchanged_paths.length + report.extra_in_new.length : 0),
    [report]
  );
  const linkRows = useMemo(() => (report ? buildLinkRows(report) : []), [report]);
  const linkStatItems = useMemo(() => (report ? buildLinkStatItems(report) : []), [report]);
  const fileRows = useMemo(() => (report ? buildFileRows(report) : []), [report]);
  const fileStatItems = useMemo(() => (report ? buildFileStatItems(report) : []), [report]);

  const scopeContent = report?.scope?.content ?? true;
  const scopeLinks = report?.scope?.links ?? true;
  const scopeAttachments = report?.scope?.attachments ?? true;

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
                <a
                  href={report.old_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-900 dark:text-slate-100 break-all underline decoration-slate-400/40 underline-offset-2 hover:text-violet-600 dark:hover:text-violet-400"
                >
                  {report.old_url}
                </a>
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
                <a
                  href={report.new_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-slate-900 dark:text-slate-100 break-all underline decoration-slate-400/40 underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {report.new_url}
                </a>
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
                ? `Obie strony odpowiadają. Przeanalizowano ${oldAnalyzedCount} podstron starego adresu i ${newAnalyzedCount} podstron nowego adresu w ${formatDuration(report.duration_ms)}.`
                : 'Co najmniej jedna ze stron jest niedostępna, więc pełne porównanie podstron nie zostało wykonane.'}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Wygenerowano: {formatDateTime(report.generated_at)}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 dark:border-white/5 pt-3">
              <span className="text-xs text-slate-400 dark:text-slate-500">Zakres porównania:</span>
              <ScopeChip label="Zawartość" active={scopeContent} />
              <ScopeChip label="Linki" active={scopeLinks} />
              <ScopeChip label="Pliki" active={scopeAttachments} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <Globe size={16} className="text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Porównanie podstron</h3>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                <StatCards items={pageStatItems} />

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
                            <a
                              href={entry.reference_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 break-all hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                              title={`Otwórz ${entry.path} na starym adresie`}
                            >
                              {entry.path}
                              <ExternalLink size={13} className="shrink-0 opacity-50" />
                            </a>
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
                            <a
                              href={entry.reference_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 break-all hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                              title={`Otwórz ${entry.path} na nowym adresie`}
                            >
                              {entry.path}
                              <ExternalLink size={13} className="shrink-0 opacity-50" />
                            </a>
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
                        {report.unchanged_paths.map((path) => {
                          const oldBase = report.old_url.replace(/\/$/, '');
                          const newBase = report.new_url.replace(/\/$/, '');
                          return (
                            <span
                              key={path}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                            >
                              {path}
                              <a
                                href={`${oldBase}${path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                                title="Otwórz na starym adresie"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={11} />
                              </a>
                              <a
                                href={`${newBase}${path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="Otwórz na nowym adresie"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={11} />
                              </a>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <FileCode size={16} className="text-sky-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Porównanie zawartości HTML</h3>
            </div>
            <div className="p-4">
              {!scopeContent ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Zawartość (HTML) nie była porównywana dla tego raportu — zakres „Zawartość” był odznaczony przy uruchamianiu porównania.
                </p>
              ) : !report.both_reachable ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Co najmniej jedna ze stron jest niedostępna, więc porównanie zawartości nie jest możliwe.
                </p>
              ) : (
                <div className="space-y-4">
                  <StatCards items={contentStatItems} />
                  <ContentComparisonSection reportId={report.id} report={report} />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <Link2 size={16} className="text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Porównanie linków</h3>
            </div>
            <div className="p-4">
              {!scopeLinks ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Linki nie były porównywane dla tego raportu — zakres „Linki” był odznaczony przy uruchamianiu porównania.
                </p>
              ) : !report.both_reachable ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Co najmniej jedna ze stron jest niedostępna, więc porównanie linków nie jest możliwe.
                </p>
              ) : linkRows.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Nie znaleziono żadnych linków do porównania.</p>
              ) : (
                <div className="space-y-4">
                  <StatCards items={linkStatItems} />
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <LinkResultsTable
                      links={linkRows}
                      selectedId={selectedLink?.id ?? null}
                      onSelect={setSelectedLink}
                    />
                    <LinkDetailPanel link={selectedLink} onClose={() => setSelectedLink(null)} />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/5 p-4">
              <FileStack size={16} className="text-blue-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Porównanie plików</h3>
            </div>
            <div className="p-4">
              {!scopeAttachments ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Pliki nie były porównywane dla tego raportu — zakres „Pliki” był odznaczony przy uruchamianiu porównania.
                </p>
              ) : !report.both_reachable ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Co najmniej jedna ze stron jest niedostępna, więc porównanie plików nie jest możliwe.
                </p>
              ) : fileRows.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Nie znaleziono żadnych plików do porównania.</p>
              ) : (
                <div className="space-y-4">
                  <StatCards items={fileStatItems} />
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <FileResultsTable
                      files={fileRows}
                      selectedId={selectedFile?.id ?? null}
                      onSelect={setSelectedFile}
                    />
                    <FileDetailPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
