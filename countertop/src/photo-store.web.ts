// Web storage: projects and photos live in this browser's IndexedDB.
// Same API as photo-store.ts; Metro picks this file for the web build.
import { ID_PATTERN, isProject, newPhotoFile, newProjectId, Photo, Project, ProjectList, slabObj } from './model';

export type { Photo, Project, ProjectList } from './model';

const DB_NAME = 'counterform';
const PROJECTS = 'projects';
const PHOTOS = 'photos';
const photoKey = (projectId: string, file: string) => `${projectId}/${file}`;

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not support local storage for projects.'));
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECTS);
      request.result.createObjectStore(PHOTOS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = null; reject(request.error ?? new Error('Could not open browser storage.')); };
  });
  return dbPromise;
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Browser storage failed. It may be full.'));
});
const result = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Object URLs for stored photo blobs, so photoUri can stay synchronous like the native version.
const urls = new Map<string, string>();
const remember = (key: string, blob: Blob) => {
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.set(key, URL.createObjectURL(blob));
};
const forget = (key: string) => {
  const url = urls.get(key);
  if (url) URL.revokeObjectURL(url);
  urls.delete(key);
};

export const photoUri = (project: Project, photo: Photo) => urls.get(photoKey(project.id, photo.file)) ?? '';

async function putProject(project: Project, photo?: { key: string; blob: Blob }) {
  if (!ID_PATTERN.test(project.id)) throw new Error('Invalid project identifier.');
  const tx = (await db()).transaction([PROJECTS, PHOTOS], 'readwrite');
  tx.objectStore(PROJECTS).put(project, project.id);
  if (photo) tx.objectStore(PHOTOS).put(photo.blob, photo.key);
  await done(tx);
}

/** Loads every readable project. Damaged entries are skipped and counted instead of failing the whole list. */
export async function listProjects(): Promise<ProjectList> {
  const database = await db();
  const tx = database.transaction([PROJECTS, PHOTOS], 'readonly');
  const [keys, values] = await Promise.all([
    result(tx.objectStore(PROJECTS).getAllKeys()),
    result(tx.objectStore(PROJECTS).getAll()),
  ]);
  const projects: Project[] = [];
  let skipped = 0;
  keys.forEach((key, i) => {
    if (isProject(values[i], String(key))) projects.push(values[i]);
    else skipped++;
  });
  const photos = tx.objectStore(PHOTOS);
  await Promise.all(projects.flatMap(project => project.photos.map(async photo => {
    const key = photoKey(project.id, photo.file);
    const blob = await result(photos.get(key)) as Blob | undefined;
    if (blob) remember(key, blob);
  })));
  return { projects: projects.sort((a, b) => b.date.localeCompare(a.date)), skipped };
}

export async function createProject(dimensions: number[]): Promise<Project> {
  const project: Project = { id: newProjectId(), date: new Date().toISOString(), dimensions, photos: [] };
  await putProject(project);
  return project;
}

export async function deleteProject(project: Project) {
  const tx = (await db()).transaction([PROJECTS, PHOTOS], 'readwrite');
  tx.objectStore(PROJECTS).delete(project.id);
  for (const photo of project.photos) tx.objectStore(PHOTOS).delete(photoKey(project.id, photo.file));
  await done(tx);
  project.photos.forEach(photo => forget(photoKey(project.id, photo.file)));
}

/** On web the camera returns a data: or blob: URL; the image is stored as a Blob. */
export async function addPhoto(project: Project, temporaryUri: string): Promise<Project> {
  const blob = await (await fetch(temporaryUri)).blob();
  const photo = { file: newPhotoFile(), date: new Date().toISOString() };
  const key = photoKey(project.id, photo.file);
  const updated = { ...project, photos: [...project.photos, photo] };
  await putProject(updated, { key, blob });
  remember(key, blob);
  return updated;
}

export async function deletePhoto(project: Project, photo: Photo): Promise<Project> {
  const updated = { ...project, photos: project.photos.filter(item => item.file !== photo.file) };
  const key = photoKey(project.id, photo.file);
  const tx = (await db()).transaction([PROJECTS, PHOTOS], 'readwrite');
  tx.objectStore(PROJECTS).put(updated, updated.id);
  tx.objectStore(PHOTOS).delete(key);
  await done(tx);
  forget(key);
  return updated;
}

/** Returns a temporary object URL for the OBJ; the caller downloads it. */
export async function exportModel(project: Project): Promise<string> {
  return URL.createObjectURL(new Blob([slabObj(project.dimensions)], { type: 'model/obj' }));
}
