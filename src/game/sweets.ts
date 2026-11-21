/* お菓子モデルのメタ情報。scripts/blender/models.json と対応する。
   creamY は正規化後（半径 1.0）のローカル Y。 */
import meta from '../../scripts/blender/models.json';

export interface SweetMeta {
  id: string;
  name: string;
  creamY: number;
  radius: number;
  height: number;
  tris: number;
}

export const SWEET_META: SweetMeta[] = meta as SweetMeta[];

export function sweetMetaById(id: string): SweetMeta {
  return SWEET_META.find((m) => m.id === id) ?? SWEET_META[0]!;
}

/** モデルの URL（Vite の base に追従） */
export function sweetModelUrl(id: string): string {
  return `${import.meta.env.BASE_URL}models/${id}.glb`;
}
