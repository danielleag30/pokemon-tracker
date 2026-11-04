/**
 * In-app replacement for window.confirm().
 *
 * The browser dialog is headed with the site's domain -- in the app it reads
 * "pokemon-tracker-sable.vercel.app says…" -- which is the most obviously
 * "this is a website" thing on screen. This draws our own sheet instead:
 * slides up from the bottom on a phone, sits centred on a wider screen.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Remove card?', confirmLabel: 'Remove', destructive: true }))) return;
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second request while one is open cancels the first rather than
    // leaving its promise hanging forever.
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    // Capture phase on window runs before the card lightbox's own Escape
    // listener on document, so Escape cancels this sheet without also
    // closing the lightbox underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [options, finish]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 animate-fade-in"
          onClick={() => finish(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="sheet-up w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber, the iOS cue that this is a sheet. Phone only. */}
            <div className="sm:hidden mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
            <h2 id="confirm-title" className="text-lg font-bold text-gray-900 text-center">
              {options.title}
            </h2>
            {options.message && (
              <p className="mt-1.5 text-sm text-gray-500 text-center">{options.message}</p>
            )}
            <div className="mt-5 space-y-2">
              <button
                type="button"
                autoFocus
                onClick={() => finish(true)}
                className={`w-full py-3.5 rounded-2xl font-bold text-base ${
                  options.destructive
                    ? 'bg-red-500 text-white'
                    : 'bg-pokemon-yellow text-pokemon-dark'
                }`}
              >
                {options.confirmLabel ?? 'OK'}
              </button>
              <button
                type="button"
                onClick={() => finish(false)}
                className="w-full py-3.5 rounded-2xl font-semibold text-base bg-gray-100 text-gray-700"
              >
                {options.cancelLabel ?? 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
