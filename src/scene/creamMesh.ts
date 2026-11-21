import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { CreamDef } from '../game/creams';
import type { CreamState } from '../logic/judge';
import { surfaceRow, type IcingSurface } from '../game/icingSurface';
import outline from '../../scripts/blender/piping-profile.json';

const ROWS = 64;
const SIDES = outline.length;

function creamMaterial(scene: Scene, def: CreamDef): PBRMaterial {
  const mat = new PBRMaterial('whippedCream', scene);
  mat.albedoColor = Color3.FromHexString(def.c.main).toLinearSpace();
  mat.emissiveColor = Color3.FromHexString(def.c.light).scale(0.035);
  mat.metallic = 0;
  mat.roughness = def.style === 'soft' ? 0.58 : 0.49;
  mat.environmentIntensity = 0.55;
  mat.backFaceCulling = false;
  return mat;
}

function makeTube(mesh: Mesh, rows: number, positions: Float32Array): VertexData {
  const indices: number[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + (j + 1) % SIDES;
      indices.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
    }
  }
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, data.normals, { useRightHandedSystem: true });
  data.applyToMesh(mesh, true);
  mesh.isPickable = false;
  return data;
}

/** From the narrow die opening to the relaxed, slightly bent strand on the belt. */
export function createCreamStream(scene: Scene, def: CreamDef, radius: number): Mesh {
  const rows = 16;
  const positions = new Float32Array((rows + 1) * SIDES * 3);
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const r = radius * (0.92 + 0.28 * t + 0.65 * t ** 4);
    const bend = 0.12 * t ** 5;
    for (let j = 0; j < SIDES; j++) {
      const [x, z] = outline[j];
      positions.set([r * x + bend, 0.5 - t, -r * z], (i * SIDES + j) * 3);
    }
  }
  const stream = new Mesh('stream', scene);
  makeTube(stream, rows, positions);
  stream.material = creamMaterial(scene, def);
  return stream;
}

function localRadius(st: CreamState, u: number): number {
  const bin = (u + 1) * 0.5 * (st.profile.length - 1);
  const left = Math.floor(bin);
  const d = st.profile[left] + (bin - left) * (st.profile[Math.min(left + 1, st.profile.length - 1)] - st.profile[left]);
  const fill = Math.min(1.35, Math.sqrt(Math.max(0, d - 0.06)));
  return fill * Math.sqrt(Math.max(0, 1 - u ** 12));
}

export class CreamMesh {
  readonly mesh: Mesh;
  private readonly mat: PBRMaterial;
  private readonly positions = new Float32Array((ROWS + 1) * SIDES * 3);
  private readonly tube: VertexData;
  private previousDrops = -1;

  constructor(scene: Scene, def: CreamDef, private readonly surface?: IcingSurface) {
    this.mesh = new Mesh('cream', scene);
    this.mat = creamMaterial(scene, def);
    this.mesh.material = this.mat;
    this.tube = makeTube(this.mesh, ROWS, this.positions);
    this.mesh.isVisible = false;
    this.mesh.receiveShadows = true;
  }

  update(st: CreamState, halfX: number, halfZ: number, style: CreamDef['style'], phase: number): void {
    if (this.previousDrops === st.drops) return;
    this.previousDrops = st.drops;
    const twist = style === 'swirl' ? 2.8 : style === 'cloud' ? 1.9 : 1.1;
    for (let i = 0; i <= ROWS; i++) {
      const u = 2 * i / ROWS - 1;
      const fill = localRadius(st, u);
      const [available, base] = this.surface ? surfaceRow(this.surface, u) : [halfZ, 0];
      const width = Math.min(available, fill * halfZ * 0.44);
      const angle = twist * u + phase;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (let j = 0; j < SIDES; j++) {
        const [a, b] = outline[j];
        const z = a * cos - b * sin;
        const y = a * sin + b * cos;
        const k = 3 * (i * SIDES + j);
        this.positions[k] = halfX * u;
        this.positions[k + 1] = base + Math.min(fill, available * 2) * (0.22 + y * 0.28);
        this.positions[k + 2] = width * z;
      }
    }
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions, true);
    VertexData.ComputeNormals(this.positions, this.tube.indices!, this.tube.normals!, { useRightHandedSystem: true });
    this.mesh.updateVerticesData(VertexBuffer.NormalKind, this.tube.normals!);
    this.mesh.isVisible = st.amount > 0.005;
  }

  /** Intersect the actual fluted cross-section for the icing contact and sprinkles. */
  heightAt(u: number, z: number): number {
    const row = Math.round((Math.max(-1, Math.min(1, u)) + 1) * ROWS / 2);
    let top = 0;
    for (let j = 0; j < SIDES; j++) {
      const a = 3 * (row * SIDES + j);
      const b = 3 * (row * SIDES + (j + 1) % SIDES);
      const za = this.positions[a + 2];
      const zb = this.positions[b + 2];
      if (za === zb || (z - za) * (z - zb) > 0) continue;
      const t = (z - za) / (zb - za);
      top = Math.max(top, this.positions[a + 1] + t * (this.positions[b + 1] - this.positions[a + 1]));
    }
    return top;
  }

  dispose(): void {
    this.mesh.dispose();
    this.mat.dispose();
  }
}
