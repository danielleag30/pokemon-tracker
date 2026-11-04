/**
 * The app's pop-up container.
 *
 * Phone: a sheet that slides up from the bottom with a grabber, and can be
 * dragged down to close, the way iOS sheets work. Wider screens: a centred
 * card, as before. Replaces the per-modal "fixed inset-0 … items-center"
 * wrappers, which on a phone floated a desktop-style dialog mid-screen.
 *
 * The sheet owns the backdrop, sizing, safe areas, Escape, and the drag.
 * Callers render their own header/body/footer inside it; anything marked
 * `data-sheet-handle` (the grabber always is) also starts a drag, so a
 * sheet's title bar can be pulled down too.
 */
import { useEffect, useRef, type ReactNode, type PointerEvent } from 'react';

const WIDTHS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
} as const;

interface Props {
  onClose: () => void;
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  /** Let the whole panel scroll (simple sheets). Off when the caller lays
   *  out its own fixed header/footer with a scrolling middle. */
  scroll?: boolean;
  label?: string;
}

const DISMISS_DISTANCE = 110;

export function Sheet({ onClose, children, width = 'md', scroll = false, label }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; dy: number; id: number } | null>(null);

  // Escape closes; the background page stops scrolling while a sheet is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-sheet-handle]')) return;
    if (target.closest('button, a, input, select, textarea')) return;
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    drag.current = { startY: e.clientY, dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !panelRef.current) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    panelRef.current.style.transition = 'none';
    panelRef.current.style.transform = `translateY(${d.dy}px)`;
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!d || d.id !== e.pointerId || !panel) return;
    if (d.dy > DISMISS_DISTANCE) {
      panel.style.transition = 'transform 180ms ease-in';
      panel.style.transform = 'translateY(100%)';
      setTimeout(onClose, 170);
    } else {
      panel.style.transition = 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      panel.style.transform = '';
    }
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/60 sm:p-4 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`sheet-up relative w-full ${WIDTHS[width]} bg-white shadow-2xl
          rounded-t-3xl sm:rounded-2xl
          max-h-[92dvh] sm:max-h-[90vh] flex flex-col
          pb-[env(safe-area-inset-bottom)] sm:pb-0
          ${scroll ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}`}
      >
        {/* Grabber: phone only, and the main drag target. */}
        <div
          data-sheet-handle
          className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0 touch-none"
          aria-hidden="true"
        >
          <div className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>
        {children}
      </div>
    </div>
  );
}
