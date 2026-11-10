// Platform-independent project types and slab geometry, shared by the native and web stores.

export type Photo = { file: string; date: string };
export type Project = { id: string; date: string; dimensions: number[]; photos: Photo[] };
export type ProjectList = { projects: Project[]; skipped: number };

export const ID_PATTERN = /^[a-z0-9-]+$/;
export const newProjectId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const newPhotoFile = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;

export const isProject = (value: unknown, id: string): value is Project => {
  const p = value as Project;
  return !!p && p.id === id && typeof p.date === 'string' && Array.isArray(p.photos)
    && Array.isArray(p.dimensions) && p.dimensions.length === 3
    && p.dimensions.every(d => typeof d === 'number' && Number.isFinite(d) && d > 0);
};

/**
 * Parses a centimeter value typed by the user. Accepts "12", "12.5" or "12,5".
 * Rejects thousands separators such as "1,000" or "1.000" because they are ambiguous.
 */
export function parseCentimeters(input: string): number {
  const value = input.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(value) || /^[1-9]\d{0,2}[.,]\d{3}$/.test(value)) return NaN;
  return Number(value.replace(',', '.'));
}

// A dimension-based rectangular slab, not geometry reconstructed from photos.
export const slabFaces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
export function slabVertices([width, depth, thickness]: number[]): number[][] {
  const x = width / 200, z = depth / 200, y = thickness / 100;
  return [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z], [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]];
}
const formatMeters = (n: number) => Number(n.toFixed(6)).toString();
export function slabObj(dimensions: number[]): string {
  return '# Manual rectangular countertop model; NOT a photo reconstruction\n# Units: meters. Y up.\no Countertop\n'
    + slabVertices(dimensions).map(v => `v ${v.map(formatMeters).join(' ')}`).join('\n') + '\n'
    + slabFaces.flatMap(([a, b, c, d]) => [`f ${a + 1} ${b + 1} ${c + 1}`, `f ${a + 1} ${c + 1} ${d + 1}`]).join('\n') + '\n';
}
export const modelFileName = (project: Project) => `countertop-${project.dimensions.join('x')}cm.obj`;
