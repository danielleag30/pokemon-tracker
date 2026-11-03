import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS of pokemontracker.app, the domain the auth layer already uses
  // for synthetic emails. Internal TestFlight only, so this never needs to be
  // claimed on the App Store.
  appId: 'app.pokemontracker.family',

  // ASCII only: Capacitor uses appName for the Xcode project and target names,
  // and the accented form belongs in CFBundleDisplayName instead.
  appName: 'PokeTracker',

  // Vite's build output.
  webDir: 'dist',

  ios: {
    // Let the web layout own the safe areas rather than having WKWebView
    // inset the whole scroll view; the app already handles its own padding.
    contentInset: 'never',
  },
};

export default config;
