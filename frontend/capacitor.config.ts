import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS of pokemontracker.app, the domain the auth layer already uses
  // for synthetic emails. Internal TestFlight only, so this never needs to be
  // claimed on the App Store.
  appId: 'app.pokemontracker.family',

  // ASCII only: Capacitor uses appName for the Xcode project and target names,
  // and the accented form belongs in CFBundleDisplayName instead.
  appName: 'PokeTracker',

  // Still required. With server.url set it is no longer what the app renders,
  // but it is the bundle the error page is loaded from, and `cap sync` needs
  // somewhere to copy assets.
  webDir: 'dist',

  server: {
    // The app renders the live site rather than a copy of the web build frozen
    // into the bundle at compile time. Without this, every web deploy left the
    // installed app behind until someone rebuilt it over a cable -- the two
    // drifted apart immediately and silently.
    //
    // Vercel serves index.html as `max-age=0, must-revalidate`, so a relaunch
    // picks up the newest deploy; /assets/* are content-hashed and immutable,
    // so nothing stale is reused.
    //
    // Offline capability is not lost here: there was none. Every card, image
    // and collection read already comes from the network, and nothing is
    // persisted client-side, so a bundled build with no connection showed an
    // empty shell anyway.
    url: 'https://pokemon-tracker-sable.vercel.app',
    cleartext: false,
    // Shown instead of WKWebView's raw failure page when the site cannot be
    // reached. Served from the bundle, so it works with no network.
    errorPath: 'offline.html',
  },

  ios: {
    // Let the web layout own the safe areas rather than having WKWebView
    // inset the whole scroll view; the app already handles its own padding.
    contentInset: 'never',
  },
};

export default config;
