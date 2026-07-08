import { useEffect, useState } from 'react';
import {
  X,
  Info,
  Loader2,
  AlertTriangle,
  ExternalLink,
  FileText,
  Link2,
  Paperclip,
  ArrowRight,
} from 'lucide-react';
import type { PageDetail } from '../api/types';
import type { PageRow } from '../utils/pageRows';
import { getPageDetail } from '../api/compareApi';
import { formatBytes, formatPercent } from '../utils/format';
import PageStatusBadge from './PageStatusBadge';

interface PageDetailPanelProps {
  reportId: string;
  row: PageRow | null;
  onClose: () => void;
}

function UrlLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 break-all text-violet-600 hover:underline dark:text-violet-400"
    >
      {href}
      <ExternalLink size={12} className="shrink-0" />
    </a>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
      <Icon size={14} />
      {title}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-xs text-slate-400 dark:text-slate-500">{text}</p>;
}

export default function PageDetailPanel({ reportId, row, onClose }: PageDetailPanelProps) {
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (!row || row.category !== 'unchanged' || !row.hasDetail) return;
    let cancelled = false;
    setLoading(true);
    getPageDetail(reportId, row.path)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Nie udało się pobrać szczegółów podstrony.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, row]);

  if (!row) {
    return (
      <aside className="hidden w-full shrink-0 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:flex lg:w-96 lg:flex-col lg:items-center lg:justify-center">
        <div className="text-center text-sm text-slate-400 dark:text-slate-500">
          <Info size={22} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          Wybierz podstronę z listy, aby zobaczyć szczegóły porównania.
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:w-96">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Szczegóły podstrony</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200"
          aria-label="Zamknij szczegóły"
        >
          <X size={16} />
        </button>
      </div>

      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="break-all text-sm font-medium text-slate-900 dark:text-slate-100">{row.path}</p>
          <PageStatusBadge category={row.category} />
        </div>

        <dl className="space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
            <dt className="w-20 shrink-0 text-slate-400 dark:text-slate-500">Stary adres</dt>
            <dd className="min-w-0 flex-1">
              <UrlLink href={row.oldUrl} />
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="w-20 shrink-0 text-slate-400 dark:text-slate-500">Nowy adres</dt>
            <dd className="min-w-0 flex-1">
              <UrlLink href={row.newUrl} />
            </dd>
          </div>
        </dl>

        {row.reason && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 ring-1 ring-amber-400/20 dark:text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{row.reason}</p>
          </div>
        )}

        {row.category === 'unchanged' && !row.hasDetail && (
          <EmptyNote text="Dla tej podstrony nie wygenerowano szczegółowego porównania (przekroczono limit stron ze szczegółami w tym raporcie, albo żaden zakres nie był zaznaczony przy uruchomieniu)." />
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 size={16} className="animate-spin" />
            Wczytywanie szczegółów…
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-700 ring-1 ring-rose-400/20 dark:text-rose-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {detail && !loading && !error && (
          <>
            {/* --- Zawartość --- */}
            <div className="space-y-2 border-t border-slate-200 dark:border-white/5 pt-4">
              <SectionHeader icon={FileText} title="Zawartość" />
              {detail.content_diff === null ? (
                <EmptyNote text="Nie sprawdzano w tym porównaniu." />
              ) : !detail.content_diff.changed ? (
                <EmptyNote text="Treść identyczna po obu stronach." />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Podobieństwo tekstu: <span className="font-medium text-slate-800 dark:text-slate-200">{formatPercent(detail.content_diff.similarity)}</span>
                  </p>
                  <div className="space-y-1.5">
                    {detail.content_diff.changes.slice(0, 15).map((change, idx) => (
                      <div key={idx} className="rounded-lg bg-slate-100 dark:bg-slate-900/60 p-2 text-xs">
                        <span className="mb-1 inline-block rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          {change.type === 'added' ? 'dodano' : change.type === 'removed' ? 'usunięto' : 'zmieniono'}
                        </span>
                        {change.old_text && (
                          <p className="text-rose-600 line-through dark:text-rose-400">{change.old_text}</p>
                        )}
                        {change.new_text && <p className="text-emerald-700 dark:text-emerald-400">{change.new_text}</p>}
                      </div>
                    ))}
                    {detail.content_diff.changes.length > 15 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        …i {detail.content_diff.changes.length - 15} więcej zmian
                        {detail.content_diff.truncated ? ' (lista skrócona)' : ''}.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* --- Linki --- */}
            <div className="space-y-2 border-t border-slate-200 dark:border-white/5 pt-4">
              <SectionHeader icon={Link2} title="Linki" />
              {detail.links_diff === null ? (
                <EmptyNote text="Nie sprawdzano w tym porównaniu." />
              ) : detail.links_diff.missing_links.length === 0 &&
                detail.links_diff.extra_links.length === 0 &&
                detail.links_diff.broken_links_old.length === 0 &&
                detail.links_diff.broken_links_new.length === 0 ? (
                <EmptyNote text="Brak różnic — te same linki działają po obu stronach." />
              ) : (
                <div className="space-y-2 text-xs">
                  {detail.links_diff.missing_links.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-rose-600 dark:text-rose-400">
                        Zniknęły ({detail.links_diff.missing_links.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.links_diff.missing_links.map((l) => (
                          <li key={l} className="break-all text-slate-600 dark:text-slate-300">{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.links_diff.extra_links.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-amber-600 dark:text-amber-400">
                        Nowe ({detail.links_diff.extra_links.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.links_diff.extra_links.map((l) => (
                          <li key={l} className="break-all text-slate-600 dark:text-slate-300">{l}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.links_diff.broken_links_old.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-rose-600 dark:text-rose-400">
                        Niedziałające na starej stronie ({detail.links_diff.broken_links_old.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.links_diff.broken_links_old.map((l) => (
                          <li key={l.href} className="break-all text-slate-600 dark:text-slate-300">
                            {l.href} <span className="text-rose-500">({l.status_code ?? 'brak odpowiedzi'})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.links_diff.broken_links_new.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-rose-600 dark:text-rose-400">
                        Niedziałające na nowej stronie ({detail.links_diff.broken_links_new.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.links_diff.broken_links_new.map((l) => (
                          <li key={l.href} className="break-all text-slate-600 dark:text-slate-300">
                            {l.href} <span className="text-rose-500">({l.status_code ?? 'brak odpowiedzi'})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* --- Załączniki --- */}
            <div className="space-y-2 border-t border-slate-200 dark:border-white/5 pt-4">
              <SectionHeader icon={Paperclip} title="Załączniki" />
              {detail.attachments_diff === null ? (
                <EmptyNote text="Nie sprawdzano w tym porównaniu." />
              ) : detail.attachments_diff.missing_files.length === 0 &&
                detail.attachments_diff.extra_files.length === 0 &&
                detail.attachments_diff.changed_size.length === 0 &&
                !detail.attachments_diff.order_changed ? (
                <EmptyNote text="Brak różnic w załączonych plikach." />
              ) : (
                <div className="space-y-2 text-xs">
                  {detail.attachments_diff.missing_files.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-rose-600 dark:text-rose-400">
                        Zniknęły ({detail.attachments_diff.missing_files.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.attachments_diff.missing_files.map((f) => (
                          <li key={f.href} className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                            <span className="truncate">{f.filename}</span>
                            <span className="shrink-0 text-slate-400 dark:text-slate-500">{formatBytes(f.size_bytes)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.attachments_diff.extra_files.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-amber-600 dark:text-amber-400">
                        Nowe ({detail.attachments_diff.extra_files.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.attachments_diff.extra_files.map((f) => (
                          <li key={f.href} className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                            <span className="truncate">{f.filename}</span>
                            <span className="shrink-0 text-slate-400 dark:text-slate-500">{formatBytes(f.size_bytes)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.attachments_diff.changed_size.length > 0 && (
                    <div>
                      <p className="mb-1 font-medium text-blue-600 dark:text-blue-400">
                        Zmieniony rozmiar ({detail.attachments_diff.changed_size.length}):
                      </p>
                      <ul className="space-y-0.5">
                        {detail.attachments_diff.changed_size.map((f) => (
                          <li key={f.filename} className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                            <span className="truncate">{f.filename}</span>
                            <span className="flex shrink-0 items-center gap-1 text-slate-400 dark:text-slate-500">
                              {formatBytes(f.old_size_bytes)} <ArrowRight size={10} /> {formatBytes(f.new_size_bytes)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.attachments_diff.order_changed && (
                    <p className="text-slate-500 dark:text-slate-400">Kolejność załączników na stronie się zmieniła.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
