import {
  LayoutDashboard,
  Scale,
  PlayCircle,
  BarChart3,
  Settings,
  HelpCircle,
  X,
} from 'lucide-react';
import type { NavKey } from '../types';

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'comparisons', label: 'Porównania', icon: Scale },
  { key: 'runs', label: 'Uruchomienia', icon: PlayCircle },
  { key: 'reports', label: 'Raporty', icon: BarChart3 },
  { key: 'settings', label: 'Ustawienia', icon: Settings },
];

interface SidebarProps {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  open: boolean;
  onClose: () => void;
}

function SidebarContent({ active, onSelect }: Pick<SidebarProps, 'active' | 'onSelect'>) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-500 to-blue-500 text-white shadow-lg shadow-violet-900/40">
          <Scale size={18} strokeWidth={2.4} />
        </div>
        <span className="text-lg font-semibold tracking-tight text-white">BIP Compare</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-violet-500/15 to-blue-500/10 text-violet-200'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-fuchsia-400 to-blue-400" />
              )}
              <Icon size={18} className={isActive ? 'text-violet-300' : 'text-slate-500'} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-white/5 px-3 py-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-slate-100"
        >
          <HelpCircle size={18} className="text-slate-500" />
          Pomoc
        </button>
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-sm font-semibold text-white">
            JK
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">Jan Kowalski</p>
            <p className="truncate text-xs text-slate-500">jan.kowalski@urzad.pl</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ active, onSelect, open, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-white/5 bg-[#0d1120] lg:flex">
        <SidebarContent active={active} onSelect={onSelect} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="relative z-50 flex w-72 max-w-[80%] flex-col bg-[#0d1120] shadow-2xl shadow-black/60">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200"
              aria-label="Zamknij menu"
            >
              <X size={18} />
            </button>
            <SidebarContent
              active={active}
              onSelect={(key) => {
                onSelect(key);
                onClose();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
