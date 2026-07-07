import { FileStack, Scale, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { StatDefinition } from '../types';

const ICONS = {
  files: FileStack,
  diff: Scale,
  check: CheckCircle2,
  alert: AlertTriangle,
};

const TONE_STYLES: Record<StatDefinition['tone'], { bg: string; text: string; glow: string; ring: string }> = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-500/20 to-cyan-400/10',
    text: 'text-blue-600 dark:text-blue-300',
    glow: 'shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)]',
    ring: 'ring-1 ring-blue-400/20',
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-500/20 to-orange-400/10',
    text: 'text-amber-600 dark:text-amber-300',
    glow: 'shadow-[0_0_20px_-4px_rgba(245,158,11,0.5)]',
    ring: 'ring-1 ring-amber-400/20',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-500/20 to-teal-400/10',
    text: 'text-emerald-600 dark:text-emerald-300',
    glow: 'shadow-[0_0_20px_-4px_rgba(16,185,129,0.5)]',
    ring: 'ring-1 ring-emerald-400/20',
  },
  red: {
    bg: 'bg-gradient-to-br from-rose-500/20 to-pink-400/10',
    text: 'text-rose-600 dark:text-rose-300',
    glow: 'shadow-[0_0_20px_-4px_rgba(244,63,94,0.5)]',
    ring: 'ring-1 ring-rose-400/20',
  },
};

export default function StatCards({ items }: { items: StatDefinition[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((stat) => {
        const Icon = ICONS[stat.icon];
        const tone = TONE_STYLES[stat.tone];
        return (
          <div
            key={stat.id}
            className="flex items-start gap-4 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur transition-colors hover:border-slate-400 dark:hover:border-white/20"
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.bg} ${tone.text} ${tone.glow} ${tone.ring}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {stat.value}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{stat.helper}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
