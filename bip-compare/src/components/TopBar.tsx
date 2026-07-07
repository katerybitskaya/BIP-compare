import { Menu, Bell, Scale, CalendarClock } from 'lucide-react';

interface TopBarProps {
  onMenuClick: () => void;
  lastRunLabel: string;
}

export default function TopBar({ onMenuClick, lastRunLabel }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 bg-[#0b0e18]/90 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          aria-label="Otwórz menu"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-500 to-blue-500 text-slate-900 dark:text-white">
            <Scale size={14} strokeWidth={2.6} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">BIP Compare</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/10 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 sm:flex">
          <CalendarClock size={14} />
          {lastRunLabel}
        </div>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
          aria-label="Powiadomienia"
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
        </button>
      </div>
    </header>
  );
}
