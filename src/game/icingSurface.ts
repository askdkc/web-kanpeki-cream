import shapes from '../../scripts/blender/icing-surfaces.json';

export interface IcingSurface {
  halfX: number;
  halfZ: number;
  rows: number[][];
}
export const icingSurfaces: Record<string, IcingSurface> = shapes;

export function surfaceRow(surface: IcingSurface, u: number): number[] {
  const row = Math.round((Math.max(-1, Math.min(1, u)) + 1) * (surface.rows.length - 1) / 2);
  return surface.rows[row];
}
