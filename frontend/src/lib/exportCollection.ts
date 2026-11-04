import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { collectionApi } from '../utils/api';

/**
 * Downloads the signed-in user's collection as a JSON backup. Shared by the
 * Dashboard (desktop) and the Me tab (phone).
 */
export async function exportCollection(): Promise<void> {
  const data = await collectionApi.exportCollection();
  const contents = JSON.stringify(data, null, 2);
  const filename = `pokemon-collection-${new Date().toISOString().slice(0, 10)}.json`;

  // WKWebView ignores the <a download> attribute entirely, so the browser
  // path below is a no-op in the iOS app -- the button would appear to work
  // and produce nothing. Write the file for real and hand it to the system
  // share sheet so it can go to Files, iCloud, Mail, anywhere.
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: contents,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'Pokemon collection backup', url: uri });
    return;
  }

  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
