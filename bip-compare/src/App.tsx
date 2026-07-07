import { useMemo, useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import PageHeader from './components/PageHeader';
import ComparisonForm from './components/ComparisonForm';
import StatCards from './components/StatCards';
import FileResultsTable from './components/FileResultsTable';
import FileDetailPanel from './components/FileDetailPanel';
import SettingsTab from './components/SettingsTab';
import { files as mockFiles, stats, lastRunLabel } from './data/mockData';
import type { FileComparison, NavKey } from './types';

function App() {
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileComparison | null>(mockFiles[0] ?? null);
  const [isRunning, setIsRunning] = useState(false);
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

  const files = useMemo(() => mockFiles, []);

  function handleRun() {
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 1400);
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
              'W budowie'
            }
            subtitle={
              activeNav === 'settings' ? 'Zarządzaj ustawieniami aplikacji i preferencjami.' :
              activeNav === 'dashboard' ? 'Porównaj starą i nową wersję Biuletynu Informacji Publicznej.' :
              'Funkcjonalność w trakcie realizacji.'
            }
            lastRunLabel={lastRunLabel}
          />

          <div className="space-y-6">
            {activeNav === 'dashboard' && (
              <>
                <ComparisonForm onRun={handleRun} isRunning={isRunning} />

                <StatCards items={stats} />

                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                  <FileResultsTable
                    files={files}
                    selectedId={selectedFile?.id ?? null}
                    onSelect={setSelectedFile}
                  />
                  <FileDetailPanel file={selectedFile} onClose={() => setSelectedFile(null)} />
                </div>
              </>
            )}

            {activeNav === 'settings' && (
              <SettingsTab theme={theme} onThemeChange={setTheme} />
            )}

            {activeNav !== 'dashboard' && activeNav !== 'settings' && (
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
