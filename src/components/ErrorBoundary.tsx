import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort crash net: without this, ANY single render exception anywhere
 * in the app unmounts the whole tree -> a plain white page with zero message
 * (exactly the "صفحة بيضاء" symptom). With this, the user sees what broke,
 * can reload in one tap, and can copy the message for support.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error.message || String(this.state.error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center">
        <div className="max-w-sm">
          <p className="text-4xl">⚠️</p>
          <p className="mt-3 font-display text-xl font-bold text-white">
            Une erreur est survenue / حدث خطأ
          </p>
          <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-zinc-400 break-words">
            {msg}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
          >
            Recharger / إعادة تحميل
          </button>
        </div>
      </div>
    );
  }
}
