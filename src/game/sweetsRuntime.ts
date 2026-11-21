/* お菓子のロードと配置。GLB は Blender で生成したものを使い、寸法は実測してレーンに合わせる。 */
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF/2.0';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { icingSurfaces, surfaceRow, type IcingSurface } from './icingSurface';
import { BINS } from '../logic/judge';
import { fruitRadii } from './menu';
import { CONFIG } from './config';
import { SWEET_META, sweetMetaById, sweetModelUrl, type SweetMeta } from './sweets';
import { createCream, type Cream } from '../logic/judge';

export interface LoadedSweet {
  meta: SweetMeta;
  template: TransformNode;
}

const cache = new Map<string, LoadedSweet>();

export async function preloadSweets(scene: Scene, onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  await Promise.all(
    SWEET_META.map(async (meta) => {
      if (cache.has(meta.id)) return;
      const result = await ImportMeshAsync(sweetModelUrl(meta.id), scene, { pluginExtension: '.glb' });
      const root = result.meshes[0];
      if (!root) throw new Error(`モデルが見つからない: ${meta.id}`);
      root.name = 'sweet_root_' + meta.id;
      root.setEnabled(false);
      // 影とマテリアルの設定
      for (const m of result.meshes) {
        const mesh = m as AbstractMesh;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        mesh.useVertexColors = true;
        const mat = mesh.material;
        if (mat instanceof PBRMaterial) {
          mat.environmentIntensity = 1.0;
          mat.usePhysicalLightFalloff = false;
        }
        mesh.setEnabled(false);
      }
      cache.set(meta.id, { meta, template: root });
      done++;
      onProgress?.(done, SWEET_META.length);
    })
  );
}

export function sweetTemplate(id: string): LoadedSweet {
  const hit = cache.get(id);
  if (!hit) throw new Error(`未ロードのモデル: ${id}`);
  return hit;
}

export interface SweetInstance {
  id: string;
  meta: SweetMeta;
  node: TransformNode;
  /** レーン座標（X が流れ方向） */
  beltX: number;
  /** レーン上の横位置 */
  beltZ: number;
  z0: number;
  /** モデルのスケール */
  scale: number;
  /** ワールド単位の半長・半幅 */
  halfX: number;
  halfZ: number;
  surface: IcingSurface;
  cream: Cream;
  judged: boolean;
  judgedRank: string | null;
  judgedReason: string | null;
  phase: number;
  decor: AbstractMesh[];
  isFinal: boolean;
}

export function spawnSweet(shadows: ShadowGenerator, id?: string): SweetInstance {
  const meta = id ? sweetMetaById(id) : SWEET_META[Math.floor(Math.random() * SWEET_META.length)]!;
  const tpl = sweetTemplate(meta.id);
  // テンプレートは無効化したまま複製し、複製側だけ有効にする
  const node = tpl.template.clone('sweet_' + meta.id, null, false);
  if (!node) throw new Error('お菓子の複製に失敗した: ' + meta.id);
  node.setEnabled(true);
  for (const child of node.getChildMeshes()) {
    child.setEnabled(true);
    shadows.addShadowCaster(child);
  }
  // 元テンプレートは再び閉じる（clone が共有状態を持ち込むため）
  tpl.template.setEnabled(false);
  for (const child of tpl.template.getChildMeshes()) child.setEnabled(false);

  // 実寸を測る。半径 1.0 に正規化済みなので、スケールはレーン幅と高さの上限から決まる
  const radiusFit = Math.min(CONFIG.sweetRadius, CONFIG.laneHalf - CONFIG.railSize);
  const heightFit = tpl.meta.height > 0 ? CONFIG.sweetHeight / tpl.meta.height : radiusFit;
  const scale = fruitRadii[meta.id] ?? Math.max(0.6, Math.min(radiusFit, heightFit));
  const lengthScale = meta.id === 'waffle' ? 1.58 : 1;
  const surface = icingSurfaces[meta.id];
  const halfX = surface.halfX * scale * lengthScale;
  const halfZ = surface.halfZ * scale;
  const z = 0;
  const supported = Array.from({ length: BINS }, (_, i) => surfaceRow(surface, 2*i/(BINS - 1)-1)[0] > 0);

  node.scaling.set(scale * lengthScale, scale, scale);
  node.position.set(CONFIG.spawnX, CONFIG.beltY, z);

  return {
    id: meta.id,
    meta,
    node,
    beltX: CONFIG.spawnX,
    beltZ: z,
    z0: z,
    scale,
    halfX,
    halfZ,
    surface,
    cream: createCream({ halfX, halfZ, supported, creamY: meta.creamY * scale }),
    judged: false,
    judgedRank: null,
    judgedReason: null,
    phase: Math.random() * Math.PI * 2,
    decor: [],
    isFinal: false
  };
}

export function placeSweet(sweet: SweetInstance): void {
  sweet.node.position.set(sweet.beltX, CONFIG.beltY, sweet.beltZ);
}

export function sweetWorldPosition(sweet: SweetInstance): Vector3 {
  return new Vector3(sweet.beltX, CONFIG.beltY, sweet.beltZ);
}
