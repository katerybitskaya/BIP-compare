import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label shown in the fallback message, e.g. "raportu". */
  what?: string;
  /** Optional secondary action, e.g. navigating back to a list, shown
   * alongside "Spróbuj ponownie" so the user isn't stuck on a dead end. */
  onBack?: () => void;
  backLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render-time crashes (e.g. an unexpected/older report shape) so a
 * single bad report shows a readable error instead of unmounting the whole
 * app to a blank screen. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('UI error while rendering', this.props.what ?? 'contentu', ':', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-300 dark:border-rose-500/20 bg-rose-500/10 p-8 text-center text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={24} />
          <p>
            Nie udało się wyświetlić {this.props.what ?? 'tej zawartości'}. Prawdopodobnie dane raportu mają
            nieoczekiwany kształt (np. raport wygenerowany starszą wersją backendu).
          </p>
          <div className="flex items-center gap-2">
            {this.props.onBack && (
              <button
                type="button"
                onClick={this.props.onBack}
                className="flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-500/30 px-3 py-1.5 text-sm font-medium hover:bg-rose-500/10"
              >
                <ArrowLeft size={14} />
                {this.props.backLabel ?? 'Wróć'}
              </button>
            )}
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-500/30 px-3 py-1.5 text-sm font-medium hover:bg-rose-500/10"
            >
              <RefreshCw size={14} />
              Spróbuj ponownie
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
