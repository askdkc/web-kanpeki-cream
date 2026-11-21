/* トッピングの形状（Babylon のプリミティブで近似） */
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ToppingDef } from '../game/creams';

export const SPRINKLE_COLORS = ['#ffd660', '#f583a1', '#8be4d7', '#ab91d8', '#fffcdb'];

export function makeTopping(scene: Scene, def: ToppingDef): Mesh {
  const size = 0.1;
  let mesh: Mesh;
  switch (def.geo) {
    case 'sprinkle':
      mesh = MeshBuilder.CreateCapsule('t', { radius: 0.028, height: 0.16, tessellation: 8 }, scene);
      mesh.rotation.z = Math.PI / 2;
      break;
    case 'chip':
      mesh = MeshBuilder.CreatePolyhedron('t', { type: 1, size: size * 0.9 }, scene);
      break;
    case 'star':
      mesh = MeshBuilder.CreatePolyhedron('t', { type: 3, size: size * 1.1 }, scene);
      break;
    case 'heart':
      mesh = MeshBuilder.CreateSphere('t', { diameter: size * 1.9, segments: 8 }, scene);
      mesh.scaling.set(1.15, 1, 1.15);
      break;
    case 'berry':
      mesh = MeshBuilder.CreateIcoSphere('t', { radius: size * 1.15, subdivisions: 1 }, scene);
      break;
    case 'nut':
      mesh = MeshBuilder.CreateSphere('t', { diameter: size * 1.9, segments: 8 }, scene);
      mesh.scaling.set(0.74, 1.24, 0.74);
      break;
    case 'leaf':
      mesh = MeshBuilder.CreateCylinder('t', { height: 0.2, diameterTop: 0.02, diameterBottom: 0.15, tessellation: 4 }, scene);
      break;
    case 'pearl':
      mesh = MeshBuilder.CreateSphere('t', { diameter: size * 1.9, segments: 12 }, scene);
      break;
    case 'gold':
      mesh = MeshBuilder.CreateCylinder('t', { height: 0.016, diameter: 0.22, tessellation: 5 }, scene);
      break;
    case 'cherry':
    default:
      mesh = MeshBuilder.CreateSphere('t', { diameter: size * 2.1, segments: 12 }, scene);
      break;
  }
  const mat = new PBRMaterial('toppingMat', scene);
  const shiny = def.id === 'pearl' || def.id === 'gold';
  const color = def.geo === 'sprinkle' ? SPRINKLE_COLORS[Math.floor(Math.random() * SPRINKLE_COLORS.length)] : def.color;
  mat.albedoColor = Color3.FromHexString(color).toLinearSpace();
  mat.metallic = def.id === 'gold' ? 0.85 : shiny ? 0.3 : 0.02;
  mat.roughness = shiny ? 0.18 : 0.5;
  mat.environmentIntensity = 1.2;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.scaling.scaleInPlace(0.001);
  mesh.metadata = { pop: 0 };
  return mesh;
}
