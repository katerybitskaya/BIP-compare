import { CheckCircle2, FileX, FilePlus } from 'lucide-react';
import type { PageCategory } from '../utils/pageRows';

const CONFIG: Record<PageCategory, { label: string; className: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  unchanged: {
    label: 'Bez zmian',
    className: 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-400/20 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  missing: {
    label: 'Brakuje',
    className: 'bg-rose-500/15 text-rose-600 ring-1 ring-rose-400/20 dark:text-rose-400',
    Icon: FileX,
  },
  extra: {
    label: 'Zbędna',
    className: 'bg-amber-500/15 text-amber-600 ring-1 ring-amber-400/20 dark:text-amber-400',
    Icon: FilePlus,
  },
};

export default function PageStatusBadge({ category }: { category: PageCategory }) {
  const { label, className, Icon } = CONFIG[category];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      <Icon size={12} /> {label}
    </span>
  );
}
