import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { modelFileName, parseCentimeters } from './src/model';
import { addPhoto, createProject, deletePhoto, deleteProject, exportModel, listProjects, Photo, photoUri, Project } from './src/photo-store';
import { cameraDenied, confirmAsync, notify, shareFile, shareLabels } from './src/platform-ui';
import SlabPreview from './src/SlabPreview';
import { s } from './src/styles';

const FIELDS = ['Width', 'Depth', 'Thickness'] as const;
const LIMITS = [1000, 1000, 100];
const GUIDES = [
  'Take an overview from above.',
  'Move along the front edge with overlapping views.',
  'Capture the left side and corners.',
  'Capture the back edge where accessible.',
  'Capture the right side and corners.',
  'Add close views of edges and openings.',
];
const isWeb = Platform.OS === 'web';
const COPY = isWeb ? {
  eyebrow: 'COUNTERFORM / WEB',
  badge: 'Runs in your browser. Nothing is uploaded.',
  scanNote: 'Photos are reference images; this app does not reconstruct a 3D mesh from them. The model has no sink cutouts or L-shaped sections.',
  footer: 'Projects and photos are stored in this browser on this device. Clearing site data or using a private window removes them. Download important work.',
} : {
  eyebrow: 'COUNTERFORM / EXPO GO',
  badge: 'No Apple Developer account required',
  scanNote: 'Expo Go does not provide LiDAR scanning here. Photos are reference images; this app does not reconstruct a 3D mesh from them. The model has no sink cutouts or L-shaped sections.',
  footer: 'Photos stay in the storage for this Expo Go project until you share them. Export important work: deleting Expo Go or clearing its data can remove your projects.',
};
const formatDimensions = (d: number[]) => `${d.join(' × ')} cm`;

export default function App() {
  const [dimensions, setDimensions] = useState(['300', '65', '3']);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const operation = useRef(false);

  useEffect(() => {
    let mounted = true;
    listProjects()
      .then(({ projects: records, skipped }) => {
        if (!mounted) return;
        setProjects(records);
        if (skipped) setLoadMessage(`${skipped} saved project${skipped === 1 ? '' : 's'} could not be read and ${skipped === 1 ? 'was' : 'were'} skipped.`);
      })
      .catch((error: unknown) => {
        if (mounted) setLoadMessage(`Could not load saved projects${error instanceof Error ? `: ${error.message}` : '.'} Reload to retry.`);
      })
      .finally(() => { if (mounted) setLoading(false); });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { setCapturing(false); setCameraReady(false); }
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const perform = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    try { await action(); }
    catch (error) { notify('Counterform', error instanceof Error ? error.message : String(error)); }
    finally { operation.current = false; setBusy(false); }
  };
  const update = (project: Project) => {
    setSelected(project);
    setProjects(previous => [project, ...previous.filter(item => item.id !== project.id)]);
  };

  const start = () => void perform(async () => {
    const values = dimensions.map(parseCentimeters);
    const invalid = values.findIndex((value, i) => !Number.isFinite(value) || value <= 0 || value > LIMITS[i]);
    if (invalid !== -1) {
      notify('Check measurements', `${FIELDS[invalid]}: enter a positive number of centimeters, like 65 or 3.5 (no thousands separators). Maximum width/depth: 1000 cm; thickness: 100 cm.`);
      return;
    }
    update(await createProject(values));
  });

  const removeProject = (project: Project) => void perform(async () => {
    if (!(await confirmAsync('Delete project?', `${formatDimensions(project.dimensions)} and its ${project.photos.length} photos will be removed from this device. Export anything you need first.`, 'Delete'))) return;
    await deleteProject(project);
    setProjects(previous => previous.filter(item => item.id !== project.id));
    setSelected(null);
  });

  const removePhoto = (project: Project, photo: Photo) => void perform(async () => {
    if (!(await confirmAsync('Delete photo?', 'This photo will be removed from the project.', 'Delete'))) return;
    update(await deletePhoto(project, photo));
  });

  const openCamera = () => void perform(async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) { cameraDenied(); return; }
    setCameraReady(false); setCapturing(true);
  });

  const takePhoto = () => void perform(async () => {
    if (!selected || !camera.current || !cameraReady) return;
    const photo = await camera.current.takePictureAsync({ quality: .9 });
    if (!photo?.uri) throw new Error('The camera did not return a photo. Try again.');
    update(await addPhoto(selected, photo.uri));
  });

  const sharePhoto = (project: Project, photo: Photo) => void perform(() =>
    shareFile(photoUri(project, photo), { mimeType: 'image/jpeg', UTI: 'public.jpeg', filename: photo.file }));
  const shareModel = () => void perform(async () => {
    if (selected) await shareFile(await exportModel(selected), { mimeType: 'model/obj', UTI: 'public.data', filename: modelFileName(selected) });
  });

  const createDisabled = busy || loading;
  const photoCount = selected?.photos.length ?? 0;

  return <SafeAreaProvider><SafeAreaView style={s.root}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.eyebrow}>{COPY.eyebrow}</Text>
      <Text style={s.title}>Capture the details.{'\n'}Shape your model.</Text>
      <Text style={s.subtitle}>Photograph your counter and create a rectangular 3D slab using measurements you enter.</Text>
      <Text style={s.badge}>{COPY.badge}</Text>
      <Text style={s.hint}>{COPY.scanNote}</Text>

      {!selected ? <>
        <View style={s.card}>
          <Text style={s.step}>01 / ENTER MEASUREMENTS</Text>
          <Text style={s.cardTitle}>Your countertop in centimeters</Text>
          <View style={s.fields}>{FIELDS.map((label, index) => <View key={label} style={s.field}>
            <Text style={s.label}>{label} / cm</Text>
            <TextInput accessibilityLabel={`${label} in centimeters`} style={s.input} keyboardType="decimal-pad" inputMode="decimal" value={dimensions[index]}
              onChangeText={value => setDimensions(previous => previous.map((old, i) => i === index ? value : old))}
              onSubmitEditing={start} editable={!busy} maxLength={7} />
          </View>)}</View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: createDisabled }} disabled={createDisabled} style={[s.primary, createDisabled && s.disabled]} onPress={start}>
            <Text style={s.primaryText}>Create project</Text>
          </Pressable>
        </View>

        <Text style={s.cardTitle}>Saved projects</Text>
        {loading && <ActivityIndicator color="#a2e5c8" />}
        {!!loadMessage && <Text style={s.body}>{loadMessage}</Text>}
        {!loading && projects.length === 0 && <Text style={s.body}>Your photos and dimension-based models will appear here.</Text>}
        {projects.map(project => <Pressable key={project.id} accessibilityRole="button" disabled={busy} style={s.card} onPress={() => setSelected(project)}>
          <Text style={s.cardTitle}>{formatDimensions(project.dimensions)}</Text>
          <Text style={s.body}>{new Date(project.date).toLocaleString()} / {project.photos.length} photos</Text>
        </Pressable>)}
      </> : <>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setSelected(null)}><Text style={s.link}>← All projects</Text></Pressable>
        <View style={s.card}>
          <Text style={s.cardTitle}>{formatDimensions(selected.dimensions)}</Text>
          <Text style={s.step}>DIMENSION-BASED MODEL / DRAG TO ROTATE</Text>
          <SlabPreview dimensions={selected.dimensions} />
          <Text style={s.hint}>Rectangular slab made from your entered measurements. This is not a scanned surface. OBJ units are meters, Y up.</Text>
          <Pressable accessibilityRole="button" disabled={busy} style={[s.secondary, busy && s.disabled]} onPress={shareModel}><Text style={s.link}>{shareLabels.model}</Text></Pressable>
        </View>
        <View style={s.card}>
          <Text style={s.step}>02 / CAPTURE REFERENCE PHOTOS</Text>
          <Text style={s.body}>Clear the counter. Use even light and overlap neighboring views. Keep the same camera distance and avoid blur. Aim for 20–40 varied photos; the count does not guarantee complete coverage.</Text>
          <Pressable accessibilityRole="button" disabled={busy} style={[s.primary, busy && s.disabled]} onPress={openCamera}>
            <Text style={s.primaryText}>Open camera / {selected.photos.length} photos</Text>
          </Pressable>
        </View>
        {selected.photos.length > 0 && <Text style={s.hint}>{shareLabels.photoHint} Press and hold to delete it. Photos stay separate from the OBJ model.</Text>}
        <View style={s.thumbs}>{selected.photos.map((photo, i) => <Pressable key={photo.file} accessibilityRole="button"
          accessibilityLabel={`Photo ${i + 1}. Tap to share, hold to delete.`} disabled={busy}
          onPress={() => sharePhoto(selected, photo)} onLongPress={() => removePhoto(selected, photo)}>
          <Image source={{ uri: photoUri(selected, photo) }} style={s.thumb} resizeMethod="resize" />
        </Pressable>)}</View>
        <Pressable accessibilityRole="button" disabled={busy} style={[s.danger, busy && s.disabled]} onPress={() => removeProject(selected)}>
          <Text style={s.dangerText}>Delete project</Text>
        </Pressable>
      </>}

      {busy && !capturing && <ActivityIndicator color="#a2e5c8" />}
      <Text style={s.footer}>{COPY.footer}</Text>
    </ScrollView>

    <Modal visible={capturing} animationType="slide" onRequestClose={() => { if (!busy) setCapturing(false); }}>
      <SafeAreaView style={s.root}>
        {capturing && permission?.granted && <CameraView ref={camera} style={s.camera} facing="back" mode="picture"
          onCameraReady={() => setCameraReady(true)}
          onMountError={event => { setCapturing(false); notify('Camera unavailable', event.message); }} />}
        <View style={s.content}>
          <Text style={s.body}>{GUIDES[Math.floor(photoCount / 4) % GUIDES.length]}</Text>
          <Text style={s.hint}>{photoCount} reference photos saved. No automatic mesh reconstruction.</Text>
          <View style={s.row}>
            <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => setCapturing(false)}><Text style={s.link}>Done</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={!cameraReady || busy} style={[s.primary, s.grow, (!cameraReady || busy) && s.disabled]} onPress={takePhoto}>
              {busy ? <ActivityIndicator color="#082321" /> : <Text style={s.primaryText}>Take photo</Text>}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  </SafeAreaView></SafeAreaProvider>;
}
