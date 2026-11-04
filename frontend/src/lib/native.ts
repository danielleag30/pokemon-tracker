/**
 * Behaviour that only applies inside the iOS app.
 *
 * The app renders the live website, so this file ships to both. Everything
 * here is gated on isNative, and every plugin call is also gated on
 * isPluginAvailable: an installed build older than the one that bundled a
 * plugin still loads this code, and an unguarded call there would reject
 * with "not implemented" on every page.
 */
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();

function has(plugin: string): boolean {
  return isNative && Capacitor.isPluginAvailable(plugin);
}

export function initNative(): void {
  if (!isNative) return;

  // Hooks for the app-only CSS in index.css (long-press menus, text
  // selection).
  document.documentElement.classList.add('native');

  // No pinch zoom in the app. The website keeps it on purpose: some people
  // need it to read. WKWebView honours user-scalable=no (mobile Safari
  // ignores it), so this is enough on its own, and it needs no new build.
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    );

  // Without this, iOS puts a "< > Done" bar above the keyboard, which only
  // web forms have.
  if (has('Keyboard')) {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
  }
}

/**
 * Status bar text colour. 'light' text goes on the navy and blue screens;
 * 'dark' text is for the few pages with a light background at the top.
 */
export function setStatusBarText(color: 'light' | 'dark'): void {
  if (!has('StatusBar')) return;
  // Capacitor names the style after the background it suits, not after the
  // text colour, so a dark background takes Style.Dark.
  StatusBar.setStyle({ style: color === 'light' ? Style.Dark : Style.Light }).catch(() => {});
}

/** A small tap you can feel. 'success' is for adding cards. */
export function haptic(kind: 'tap' | 'success' = 'tap'): void {
  if (!has('Haptics')) return;
  const p = kind === 'success'
    ? Haptics.notification({ type: NotificationType.Success })
    : Haptics.impact({ style: ImpactStyle.Light });
  p.catch(() => {});
}
