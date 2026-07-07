import { Moon, Sun } from 'lucide-react';

interface SettingsTabProps {
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export default function SettingsTab({ theme, onThemeChange }: SettingsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur">
        <div className="border-b border-slate-200 dark:border-white/5 p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Wygląd</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Dostosuj wygląd interfejsu aplikacji.
          </p>
        </div>
        
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-200">Tryb jasny / ciemny</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Wybierz motyw, który najlepiej odpowiada Twoim preferencjom.
              </p>
            </div>
            
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-black/20 p-1 border border-slate-200 dark:border-white/5">
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Sun size={16} className={theme === 'light' ? 'text-amber-500' : ''} />
                Jasny
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  theme === 'dark'
                    ? 'bg-[#1a2133] text-white shadow-sm ring-1 ring-white/10'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Moon size={16} className={theme === 'dark' ? 'text-violet-400' : ''} />
                Ciemny
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
