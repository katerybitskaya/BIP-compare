import { useState } from 'react';
import { Link2, Play, Loader2 } from 'lucide-react';

interface ScopeOption {
  key: string;
  label: string;
}

const SCOPE_OPTIONS: ScopeOption[] = [
  { key: 'pages', label: 'Strony' },
  { key: 'links', label: 'Linki' },
  { key: 'files', label: 'Pliki' },
  { key: 'screenshots', label: 'Zrzuty ekranów' },
];

interface ComparisonFormProps {
  onRun: () => void;
  isRunning: boolean;
}

export default function ComparisonForm({ onRun, isRunning }: ComparisonFormProps) {
  const [oldUrl, setOldUrl] = useState('https://bip.staryurzad.pl');
  const [newUrl, setNewUrl] = useState('https://bip.nowyurzad.pl');
  const [scope, setScope] = useState<Record<string, boolean>>({
    pages: true,
    links: true,
    files: true,
    screenshots: false,
  });

  const toggleScope = (key: string) =>
    setScope((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <section className="rounded-2xl border border-slate-300 dark:border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur sm:p-6">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Stary adres BIP
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-3 py-2.5 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20">
            <Link2 size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
            <input
              value={oldUrl}
              onChange={(e) => setOldUrl(e.target.value)}
              type="text"
              placeholder="https://bip.staryurzad.pl"
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-600"
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
              onChange={(e) => setNewUrl(e.target.value)}
              type="text"
              placeholder="https://bip.nowyurzad.pl"
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-600"
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
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500/40 focus:ring-offset-0"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white shadow-lg shadow-violet-900/40 transition-transform hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {isRunning ? 'Porównywanie…' : 'Uruchom porównanie'}
        </button>
      </div>
    </section>
  );
}
