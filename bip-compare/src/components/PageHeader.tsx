import { Bell, CalendarClock } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  lastRunLabel: string;
}

export default function PageHeader({ title, subtitle, lastRunLabel }: PageHeaderProps) {
  return (
    <div className="mb-6 hidden items-center justify-between gap-4 lg:flex">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-400 shadow-sm backdrop-blur">
          <CalendarClock size={16} className="text-violet-400" />
          <span className="text-slate-500">Ostatnie uruchomienie</span>
          <span className="font-medium text-slate-200">{lastRunLabel}</span>
        </div>
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 shadow-sm hover:bg-white/10"
          aria-label="Powiadomienia"
        >
          <Bell size={18} />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
        </button>
      </div>
    </div>
  );
}
