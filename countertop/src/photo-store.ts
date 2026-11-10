// Native (iOS/Android) storage: projects and photos live in the app's document directory.
// The web build uses photo-store.web.ts instead.
import * as FS from 'expo-file-system/legacy';
import { ID_PATTERN, isProject, newPhotoFile, newProjectId, Photo, Project, ProjectList, slabObj } from './model';

export type { Photo, Project, ProjectList } from './model';

const root = () => {
  if (!FS.documentDirectory) throw new Error('Local storage is unavailable on this device.');
  return `${FS.documentDirectory}photo-projects/`;
};
const projectDirectory = (id: string) => {
  if (!ID_PATTERN.test(id)) throw new Error('Invalid project identifier.');
  return `${root()}${id}/`;
};
export const photoUri = (project: Project, photo: Photo) => `${projectDirectory(project.id)}${photo.file}`;

async function saveProject(project: Project) {
  const dir = projectDirectory(project.id);
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  const temporary = `${dir}project.tmp`;
  const target = `${dir}project.json`;
  await FS.writeAsStringAsync(temporary, JSON.stringify(project));
  try {
    await FS.moveAsync({ from: temporary, to: target });
  } catch {
    // Some platforms refuse to move onto an existing file; replace it explicitly.
    await FS.deleteAsync(target, { idempotent: true });
    await FS.moveAsync({ from: temporary, to: target });
  }
}

/** Loads every readable project. Damaged entries are skipped and counted instead of failing the whole list. */
export async function listProjects(): Promise<ProjectList> {
  await FS.makeDirectoryAsync(root(), { intermediates: true });
  const projects: Project[] = [];
  let skipped = 0;
  for (const id of await FS.readDirectoryAsync(root())) {
    if (!ID_PATTERN.test(id)) continue;
    const file = `${projectDirectory(id)}project.json`;
    try {
      if (!(await FS.getInfoAsync(file)).exists) continue;
      const project: unknown = JSON.parse(await FS.readAsStringAsync(file));
      if (isProject(project, id)) projects.push(project);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { projects: projects.sort((a, b) => b.date.localeCompare(a.date)), skipped };
}

export async function createProject(dimensions: number[]): Promise<Project> {
  const project: Project = { id: newProjectId(), date: new Date().toISOString(), dimensions, photos: [] };
  await saveProject(project);
  return project;
}

export async function deleteProject(project: Project) {
  await FS.deleteAsync(projectDirectory(project.id), { idempotent: true });
}

export async function addPhoto(project: Project, temporaryUri: string): Promise<Project> {
  const photo = { file: newPhotoFile(), date: new Date().toISOString() };
  const destination = photoUri(project, photo);
  await FS.copyAsync({ from: temporaryUri, to: destination });
  // The camera's copy lives in the cache; it is no longer needed.
  await FS.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
  const updated = { ...project, photos: [...project.photos, photo] };
  try { await saveProject(updated); }
  catch (error) { await FS.deleteAsync(destination, { idempotent: true }); throw error; }
  return updated;
}

export async function deletePhoto(project: Project, photo: Photo): Promise<Project> {
  const updated = { ...project, photos: project.photos.filter(item => item.file !== photo.file) };
  await saveProject(updated);
  await FS.deleteAsync(photoUri(project, photo), { idempotent: true });
  return updated;
}

/** Writes the OBJ next to the project and returns its file URI. */
export async function exportModel(project: Project): Promise<string> {
  const uri = `${projectDirectory(project.id)}countertop.obj`;
  await FS.writeAsStringAsync(uri, slabObj(project.dimensions));
  return uri;
}
