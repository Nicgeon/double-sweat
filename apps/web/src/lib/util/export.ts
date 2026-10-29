import { currentServer } from '#lib/native/auth-store.ts';
import { NATIVE } from '#lib/native/flag.ts';

/**
 * Startet den Download des Exports. Web: der Browser lädt die Datei. App: Download in den Cache und danach das
 * Teilen-Menü des Geräts (Speichern, Mail, Cloud). Der Link ist ein Einmal-Token und braucht keine Anmeldung.
 */
export async function downloadExport(downloadUrl: string): Promise<void> {
  if (!NATIVE) {
    window.location.assign(downloadUrl);
    return;
  }
  const server = currentServer();
  if (!server) throw new Error('kein Server');
  const [{ Filesystem, Directory }, { FileTransfer }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/file-transfer'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: 'double-sweat-export.zip',
  });
  await FileTransfer.downloadFile({ url: `${server}${downloadUrl}`, path: uri });
  await Share.share({
    title: 'Double Sweat Export',
    files: [uri],
    dialogTitle: 'Export speichern oder teilen',
  });
}
