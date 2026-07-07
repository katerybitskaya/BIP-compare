import { X, Info, CheckCircle2, AlertTriangle, FileWarning } from 'lucide-react';
import type { FileComparison } from '../types';
import FileIcon from './FileIcon';
import StatusBadge from './StatusBadge';
import { formatSize } from '../utils/format';

interface FileDetailPanelProps {
  file: FileComparison | null;
  onClose: () => void;
}

function HttpBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-slate-400 dark:text-slate-500">–</span>;
  const ok = code < 400;
  return (
    <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>
      {code} {ok ? 'OK' : ''}
    </span>
  );
}

const NOTE_CONFIG: Record<
  FileComparison['status'],
  { icon: React.ComponentType<{ size?: number; className?: string }>; text: string; tone: string }
> = {
  ok: {
    icon: CheckCircle2,
    text: 'Plik identyczny — rozmiar i zawartość są takie same.',
    tone: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/20',
  },
  different: {
    icon: AlertTriangle,
    text: 'Wykryto różnicę w rozmiarze pliku między starym a nowym systemem.',
    tone: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-400/20',
  },
  error404: {
    icon: FileWarning,
    text: 'Plik jest niedostępny pod nowym adresem (błąd 404). Sprawdź, czy nie został przeniesiony.',
    tone: 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20',
  },
  new: {
    icon: Info,
    text: 'Plik występuje tylko w nowym systemie — brak odpowiednika w starej wersji BIP.',
    tone: 'bg-blue-500/10 text-blue-300 ring-1 ring-blue-400/20',
  },
  removed: {
    icon: Info,
    text: 'Plik istniał w starym systemie, ale nie występuje w nowej wersji BIP.',
    tone: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-1 ring-slate-400/20',
  },
};

export default function FileDetailPanel({ file, onClose }: FileDetailPanelProps) {
  if (!file) {
    return (
      <aside className="hidden w-full shrink-0 rounded-2xl border border-slate-300 dark:border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:flex lg:w-96 lg:flex-col lg:items-center lg:justify-center">
        <div className="text-center text-sm text-slate-400 dark:text-slate-500">
          <Info size={22} className="mx-auto mb-2 text-slate-600" />
          Wybierz plik z listy, aby zobaczyć szczegóły porównania.
        </div>
      </aside>
    );
  }

  const note = NOTE_CONFIG[file.status];
  const NoteIcon = note.icon;

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:w-96">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 p-4">
        <h2 className="text-sm font-semibold text-slate-100">Szczegóły pliku</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:text-slate-200"
          aria-label="Zamknij szczegóły"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex items-start gap-3">
          <FileIcon kind={file.kind} size={20} />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-slate-100">{file.name}</p>
            <p className="mt-0.5 break-all text-xs text-slate-400 dark:text-slate-500">{file.path}</p>
          </div>
          <StatusBadge status={file.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Stary system
            </p>
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Status HTTP</dt>
                <dd className="font-medium"><HttpBadge code={file.oldHttp} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Rozmiar</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-200">{formatSize(file.oldSizeKb)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="shrink-0 text-slate-500 dark:text-slate-400">Typ</dt>
                <dd className="truncate font-medium text-slate-900 dark:text-slate-200" title={file.oldType}>
                  {file.oldType.split('/')[1] ?? file.oldType}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Pobranie</dt>
                <dd className={`font-medium ${file.oldDownloadOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {file.oldDownloadOk ? 'Działa' : 'Niedostępne'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Ostatnia modyfikacja</dt>
                <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-200">{file.oldModified ?? '–'}</dd>
              </div>
            </dl>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Nowy system
            </p>
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Status HTTP</dt>
                <dd className="font-medium"><HttpBadge code={file.newHttp} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Rozmiar</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-200">{formatSize(file.newSizeKb)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="shrink-0 text-slate-500 dark:text-slate-400">Typ</dt>
                <dd className="truncate font-medium text-slate-900 dark:text-slate-200" title={file.newType}>
                  {file.newType.split('/')[1] ?? file.newType}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Pobranie</dt>
                <dd className={`font-medium ${file.newDownloadOk ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {file.newDownloadOk ? 'Działa' : 'Niedostępne'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Ostatnia modyfikacja</dt>
                <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-200">{file.newModified ?? '–'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className={`flex items-start gap-2.5 rounded-xl p-3 text-xs ${note.tone}`}>
          <NoteIcon size={16} className="mt-0.5 shrink-0" />
          <p>{note.text}</p>
        </div>
      </div>
    </aside>
  );
}
