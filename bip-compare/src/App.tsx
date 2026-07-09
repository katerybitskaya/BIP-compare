import { useEffect, useMemo, useState } from 'react';
import { Globe } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PageHeader from './components/PageHeader';
import ComparisonForm from './components/ComparisonForm';
import StatCards from './components/StatCards';
import CategoryOverviewTable from './components/CategoryOverviewTable';
import CategoryDetailPanel from './components/CategoryDetailPanel';
import SettingsTab from './components/SettingsTab';
import ReportsTab from './components/ReportsTab';
import ErrorBoundary from './components/ErrorBoundary';
import { runCompare, listReports, getReport, ApiError } from './api/compareApi';
import type { CompareScope, ComparisonResult } from './api/types';
import { buildOverviewStatItems, buildCategoryOverview } from './utils/overviewRows';
import { formatDateTime } from './utils/format';
import type { CategoryId, CategoryOverviewRow, NavKey } from './types';

function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Form state lifted here so it survives tab switches
  const [oldUrl, setOldUrl] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [scope, setScope] = useState<CompareScope>({
    content: true,
    links: true,
    attachments: true,
  });

  const [currentReport, setCurrentReport] = useState<ComparisonResult | null>(null);
  const [loadingInitialReport, setLoadingInitialReport] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load the most recently saved report on first mount, so the Dashboard
  // shows real results even before the user runs anything this session.
  useEffect(() => {
    let cancelled = false;
    listReports()
      .then((reports) => (reports.length > 0 ? getReport(reports[0].id) : null))
      .then((result) => {
        if (!cancelled && result) setCurrentReport(result);
      })
      .catch(() => {
        // No saved reports yet (or backend unreachable) — Dashboard just
        // shows its empty state, no need to surface an error for this.
      })
      .finally(() => {
        if (!cancelled) setLoadingInitialReport(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const overviewStatItems = useMemo(() => (currentReport ? buildOverviewStatItems(currentReport) : []), [currentReport]);
  const categoryEntries = useMemo(() => (currentReport ? buildCategoryOverview(currentReport) : []), [currentReport]);
  const categoryRows: CategoryOverviewRow[] = useMemo(() => categoryEntries.map((e) => e.row), [categoryEntries]);
  const selectedCategoryEntry = useMemo(
    () => categoryEntries.find((e) => e.row.id === selectedCategory) ?? null,
    [categoryEntries, selectedCategory]
  );
  const lastRunLabel = currentReport ? formatDateTime(currentReport.generated_at) : 'Brak dotychczasowych porównań';

  function handleSelectCategory(row: CategoryOverviewRow) {
    setSelectedCategory(row.id);
  }

  function handleViewFullReport() {
    if (!currentReport) return;
    setSelectedReportId(currentReport.id);
    setActiveNav('reports');
  }

  async function handleRun(oldUrl: string, newUrl: string, scope: CompareScope) {
    setIsRunning(true);
    setRunError(null);
    try {
      const result = await runCompare({ old_url: oldUrl, new_url: newUrl, scope });
      setCurrentReport(result);
      setSelectedCategory(null);
      setReportsRefreshKey((k) => k + 1);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Nie udało się uruchomić porównania.');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-slate-50 dark:bg-[#0b0e18] text-slate-900 dark:text-slate-200">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <Sidebar
        active={activeNav}
        onSelect={setActiveNav}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setSidebarOpen(true)} lastRunLabel={lastRunLabel} />

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <PageHeader
            title={
              activeNav === 'settings' ? 'Ustawienia' :
              activeNav === 'dashboard' ? 'Dashboard' :
              activeNav === 'reports' ? 'Raporty' :
              'W budowie'
            }
            subtitle={
              activeNav === 'settings' ? 'Zarządzaj ustawieniami aplikacji i preferencjami.' :
              activeNav === 'dashboard' ? 'Porównaj starą i nową wersję Biuletynu Informacji Publicznej.' :
              activeNav === 'reports' ? 'Przeglądaj wyniki wcześniej uruchomionych porównań.' :
              'Funkcjonalność w trakcie realizacji.'
            }
            lastRunLabel={lastRunLabel}
          />

          <div className="space-y-6">
            {activeNav === 'dashboard' && (
              <>
                <ComparisonForm
                  oldUrl={oldUrl}
                  newUrl={newUrl}
                  scope={scope}
                  onOldUrlChange={setOldUrl}
                  onNewUrlChange={setNewUrl}
                  onScopeChange={setScope}
                  onRun={handleRun}
                  isRunning={isRunning}
                  error={runError}
                />

                <ErrorBoundary what="wyników ostatniego porównania">
                  {currentReport && !currentReport.both_reachable && (
                    <div className="flex items-start gap-2.5 rounded-2xl border border-rose-300 dark:border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
                      Co najmniej jedna ze stron jest niedostępna, więc pełne porównanie nie zostało wykonane. Zobacz pełny raport, aby sprawdzić szczegóły.
                    </div>
                  )}

                  {currentReport && currentReport.both_reachable && (
                    <div className="space-y-6">
                      {/* Liczba podstron – stary i nowy adres */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="flex items-center gap-4 rounded-2xl border border-violet-300/40 dark:border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-purple-400/5 p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-400/10 text-violet-600 dark:text-violet-300 shadow-[0_0_20px_-4px_rgba(139,92,246,0.5)] ring-1 ring-violet-400/20">
                            <Globe size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-500 dark:text-slate-400">Stary adres BIP</p>
                            <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                              {currentReport.old_site.page_count}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">podstron znalezionych</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 rounded-2xl border border-blue-300/40 dark:border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-400/10 text-blue-600 dark:text-blue-300 shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)] ring-1 ring-blue-400/20">
                            <Globe size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-500 dark:text-slate-400">Nowy adres BIP</p>
                            <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                              {currentReport.new_site.page_count}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">podstron znalezionych</p>
                          </div>
                        </div>
                      </div>

                      <StatCards items={overviewStatItems} />

                      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                        <CategoryOverviewTable
                          rows={categoryRows}
                          selectedId={selectedCategory}
                          onSelect={handleSelectCategory}
                        />
                        <CategoryDetailPanel entry={selectedCategoryEntry} onViewFullReport={handleViewFullReport} />
                      </div>
                    </div>
                  )}

                  {!currentReport && !loadingInitialReport && !isRunning && (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-12 text-center text-sm text-slate-400 dark:text-slate-500">
                      Brak jeszcze żadnego porównania. Uruchom pierwsze powyżej, aby zobaczyć wyniki.
                    </div>
                  )}
                </ErrorBoundary>
              </>
            )}

            {activeNav === 'reports' && (
              <ReportsTab
                refreshKey={reportsRefreshKey}
                selectedId={selectedReportId}
                onSelect={setSelectedReportId}
              />
            )}

            {activeNav === 'settings' && (
              <SettingsTab theme={theme} onThemeChange={setTheme} />
            )}

            {activeNav !== 'dashboard' && activeNav !== 'settings' && activeNav !== 'reports' && (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20">
                <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200">Ta sekcja jest w budowie</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Zapraszamy wkrótce.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
