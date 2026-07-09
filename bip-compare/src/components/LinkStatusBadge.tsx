import type { LinkStatus } from '../types';

const STATUS_CONFIG: Record<LinkStatus, { label: string; bg: string; text: string; ring: string }> = {
  ok: { label: 'OK', bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-1 ring-emerald-400/20' },
  broken: { label: 'Uszkodzony', bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-1 ring-rose-400/20' },
  new: { label: 'Nowy link', bg: 'bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-1 ring-blue-400/20' },
  removed: { label: 'Usunięty', bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-1 ring-slate-400/20' },
};

export default function LinkStatusBadge({ status }: { status: LinkStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      {cfg.label}
    </span>
  );
}
