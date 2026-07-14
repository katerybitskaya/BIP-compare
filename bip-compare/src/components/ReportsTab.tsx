import { useEffect, useState } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import type { ReportSummary } from '../api/types';
import { clearAllReports, listReports } from '../api/compareApi';
import ReportCard from './ReportCard';
import ReportDetail from './ReportDetail';
import ConfirmDialog from './ConfirmDialog';
import ErrorBoundary from './ErrorBoundary';

interface ReportsTabProps {
  refreshKey: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCleared?: () => void;
}

export default function ReportsTab({ refreshKey, selectedId, onSelect, onCleared }: ReportsTabProps) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listReports()
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Nie udało się pobrać listy raportów.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function handleClearAll() {
    setClearing(true);
    setClearError(null);
    try {
      await clearAllReports();
      setConfirmOpen(false);
      onSelect(null);
      load();
      if (onCleared) onCleared();
    } catch (err) {
      setClearError(err instanceof Error ? err.message : 'Nie udało się wyczyścić raportów.');
    } finally {
      setClearing(false);
    }
  }

  if (selectedId) {
    return (
      <ErrorBoundary what="tego raportu" onBack={() => onSelect(null)} backLabel="Wróć do listy raportów">
        <ReportDetail reportId={selectedId} onBack={() => onSelect(null)} />
      </ErrorBoundary>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Zapisane porównania {reports.length > 0 && `(${reports.length})`}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/10 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <RefreshCw size={14} />
            Odśwież
          </button>
          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-500/30 px-3 py-1.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
            >
              <Trash2 size={14} />
              Wyczyść wszystkie
            </button>
          )}
        </div>
      </div>

      {clearError && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 dark:border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{clearError}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-10 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          Wczytywanie raportów…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 dark:border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-12 text-center text-sm text-slate-400 dark:text-slate-500">
          <Inbox size={28} className="text-slate-300 dark:text-slate-600" />
          Brak zapisanych porównań. Uruchom pierwsze na Dashboardzie.
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} onClick={() => onSelect(report.id)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Wyczyścić wszystkie raporty?"
        message={`Ta operacja usunie trwale wszystkie ${reports.length} zapisane porównanie/porównania wraz ze szczegółami podstron. Nie da się tego cofnąć.`}
        confirmLabel="Usuń wszystkie"
        busy={clearing}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
