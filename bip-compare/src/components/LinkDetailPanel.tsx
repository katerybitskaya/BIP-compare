import { X, Info, CheckCircle2, AlertTriangle, Link2Off } from 'lucide-react';
import type { LinkComparison, LinkStatus } from '../types';
import LinkStatusBadge from './LinkStatusBadge';

interface LinkDetailPanelProps {
  link: LinkComparison | null;
  onClose: () => void;
}

function HttpBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-slate-400 dark:text-slate-500">–</span>;
  const ok = code < 400;
  return (
    <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
      {code} {ok ? 'OK' : ''}
    </span>
  );
}

const NOTE_CONFIG: Record<
  LinkStatus,
  { icon: React.ComponentType<{ size?: number; className?: string }>; text: string; tone: string }
> = {
  ok: {
    icon: CheckCircle2,
    text: 'Link działa tak samo w obu wersjach.',
    tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-400/20',
  },
  broken: {
    icon: AlertTriangle,
    text: 'Link jest uszkodzony w nowej wersji (nie odpowiada albo zwraca błąd).',
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-400/20',
  },
  new: {
    icon: Info,
    text: 'Link występuje tylko w nowej wersji — brak odpowiednika w starym BIP.',
    tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400/20',
  },
  removed: {
    icon: Link2Off,
    text: 'Link istniał w starej wersji, ale nie występuje już w nowym BIP.',
    tone: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-1 ring-slate-400/20',
  },
};

export default function LinkDetailPanel({ link, onClose }: LinkDetailPanelProps) {
  if (!link) {
    return (
      <aside className="hidden w-full shrink-0 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:flex lg:w-96 lg:flex-col lg:items-center lg:justify-center">
        <div className="text-center text-sm text-slate-400 dark:text-slate-500">
          <Info size={22} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          Wybierz link z listy, aby zobaczyć szczegóły porównania.
        </div>
      </aside>
    );
  }

  const note = NOTE_CONFIG[link.status];
  const NoteIcon = note.icon;

  return (
    <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-lg shadow-slate-200/50 dark:shadow-black/20 backdrop-blur lg:w-96">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 p-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Szczegóły linku</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200"
          aria-label="Zamknij szczegóły"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">{link.text}</p>
            <p className="mt-0.5 break-all text-xs text-slate-400 dark:text-slate-500">{link.path}</p>
          </div>
          <LinkStatusBadge status={link.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
              Stary system
            </p>
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Status HTTP</dt>
                <dd className="font-medium"><HttpBadge code={link.oldHttp} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Działa</dt>
                <dd className={`font-medium ${link.oldWorks ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {link.oldHref ? (link.oldWorks ? 'Tak' : 'Nie') : '–'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Znaleziony na</dt>
                <dd className="mt-0.5 break-all font-medium text-slate-900 dark:text-slate-200">{link.oldSourcePath ?? '–'}</dd>
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
                <dd className="font-medium"><HttpBadge code={link.newHttp} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Działa</dt>
                <dd className={`font-medium ${link.newWorks ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {link.newHref ? (link.newWorks ? 'Tak' : 'Nie') : '–'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Znaleziony na</dt>
                <dd className="mt-0.5 break-all font-medium text-slate-900 dark:text-slate-200">{link.newSourcePath ?? '–'}</dd>
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
