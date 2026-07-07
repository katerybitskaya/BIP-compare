import { FileText, FileSpreadsheet, FileImage, File } from 'lucide-react';
import type { FileKind } from '../types';

const KIND_STYLES: Record<FileKind, { icon: React.ComponentType<{ size?: number }>; bg: string; text: string }> = {
  pdf: { icon: FileText, bg: 'bg-rose-500/15', text: 'text-rose-400' },
  doc: { icon: FileText, bg: 'bg-blue-500/15', text: 'text-blue-400' },
  xls: { icon: FileSpreadsheet, bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  image: { icon: FileImage, bg: 'bg-violet-500/15', text: 'text-violet-400' },
  other: { icon: File, bg: 'bg-slate-500/15', text: 'text-slate-500 dark:text-slate-400' },
};

export default function FileIcon({ kind, size = 18 }: { kind: FileKind; size?: number }) {
  const { icon: Icon, bg, text } = KIND_STYLES[kind];
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg} ${text}`}>
      <Icon size={size} />
    </div>
  );
}
