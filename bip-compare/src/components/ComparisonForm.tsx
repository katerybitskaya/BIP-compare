import { Link2, Play, Loader2, AlertCircle } from 'lucide-react';
import type { CompareScope } from '../api/types';

interface ScopeOption {
  key: keyof CompareScope;
  label: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { key: 'content', label: 'Zawartość' },
  { key: 'links', label: 'Linki' },
  { key: 'attachments', label: 'Pliki' },
];

interface ComparisonFormProps {
  oldUrl: string;
  newUrl: string;
  scope: CompareScope;
  onOldUrlChange: (value: string) => void;
  onNewUrlChange: (value: string) => void;
  onScopeChange: (scope: CompareScope) => void;
  onRun: (oldUrl: string, newUrl: string, scope: CompareScope) => void;
  isRunning: boolean;
  error?: string | null;
}

export default function ComparisonForm({
  oldUrl,
  newUrl,
  scope,
  onOldUrlChange,
  onNewUrlChange,
  onScopeChange,
  onRun,
  isRunning,
  error,
}: ComparisonFormProps) {
  const toggleScope = (key: keyof CompareScope) =>
    onScopeChange({ ...scope, [key]: !scope[key] });

  const noScopeSelected = !scope.content && !scope.links && !scope.attachments;

  function handleSubmit() {
    const trimmedOld = oldUrl.trim();
    const trimmedNew = newUrl.trim();
    if (!trimmedOld || !trimmedNew) return;
    onRun(trimmedOld, trimmedNew, scope);
  }

  return (
    <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur sm:p-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Stary adres BIP
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-3 py-2.5 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20">
            <Link2 size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              value={oldUrl}
              onChange={(e) => onOldUrlChange(e.target.value)}
              type="text"
              placeholder="https://bip.staryurzad.pl"
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Nowy adres BIP
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-3 py-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
            <Link2 size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              value={newUrl}
              onChange={(e) => onNewUrlChange(e.target.value)}
              type="text"
              placeholder="https://bip.nowyurzad.pl"
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Zakres testu</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SCOPE_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
              >
                <input
                  type="checkbox"
                  checked={scope[opt.key]}
                  onChange={() => toggleScope(opt.key)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-violet-500 focus:ring-violet-500/40 focus:ring-offset-0"
                />
                {opt.label}
              </label>
            ))}
            <label className="flex cursor-not-allowed items-center gap-2 text-sm text-slate-300 dark:text-slate-600">
              <input type="checkbox" checked={false} disabled className="h-4 w-4 rounded border-slate-300 dark:border-slate-600" />
              Zrzuty ekranów (wkrótce)
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isRunning || noScopeSelected}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-transform hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {isRunning ? 'Porównywanie…' : 'Uruchom porównanie'}
        </button>
      </div>

      {noScopeSelected && !isRunning && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 ring-1 ring-amber-400/20 dark:text-amber-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>Wybierz co najmniej jeden element zakresu testu (zawartość, linki lub pliki).</p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-700 ring-1 ring-rose-400/20 dark:text-rose-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Podstrony obu witryn są zawsze w pełni przeszukiwane (żeby wykryć brakujące/zbędne adresy). Zakres testu określa,
        które dodatkowe szczegóły są sprawdzane dla podstron wspólnych dla obu wersji. Zrzuty ekranu to funkcja
        zarezerwowana na przyszłość — checkbox jest na razie tylko informacyjny.
      </p>
    </section>
  );
}

