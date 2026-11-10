// Native dialogs and sharing. The web build uses platform-ui.web.ts instead.
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

export type ShareOptions = { mimeType: string; UTI: string; filename: string };

export const notify = (title: string, message: string) => Alert.alert(title, message);

export const confirmAsync = (title: string, message: string, action: string) => new Promise<boolean>(resolve =>
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: action, style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));

export const cameraDenied = () => Alert.alert('Camera permission needed', 'Allow camera access for Expo Go in your phone Settings.', [
  { text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings() },
]);

/** Opens the system share sheet (Save to Files, AirDrop, Mail, ...). */
export async function shareFile(uri: string, { mimeType, UTI }: ShareOptions) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, { mimeType, UTI });
}

export const shareLabels = { model: 'Export slab as OBJ', photoHint: 'Tap a photo to share or save it to Files.' };
