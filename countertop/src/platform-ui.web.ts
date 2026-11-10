// Web dialogs and downloads. React Native's Alert does nothing on web, so use the browser's own dialogs.
import type { ShareOptions } from './platform-ui';

export type { ShareOptions } from './platform-ui';

export const notify = (title: string, message: string) => window.alert(`${title}\n\n${message}`);

export const confirmAsync = async (title: string, message: string, _action: string) => window.confirm(`${title}\n\n${message}`);

export const cameraDenied = () => notify('Camera permission needed', 'Allow camera access for this site in your browser (usually the camera icon in the address bar), then try again.');

/** Downloads the file. Object URLs created for the OBJ are released afterwards. */
export async function shareFile(uri: string, { filename }: ShareOptions) {
  const link = document.createElement('a');
  link.href = uri;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (uri.startsWith('blob:') && filename.endsWith('.obj')) setTimeout(() => URL.revokeObjectURL(uri), 10_000);
}

export const shareLabels = { model: 'Download slab as OBJ', photoHint: 'Click a photo to download it.' };
