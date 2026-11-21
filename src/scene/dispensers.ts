import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { CONFIG } from '../game/config';

export class Dispensers {
  readonly shaker: TransformNode;
  private valve!: AbstractMesh;
  private valveAngle = 0;
  private openingTime = 0;
  private tipY = CONFIG.nozzleTipY as number;

  constructor(private readonly scene: Scene, private readonly nozzle: Mesh) {
    this.shaker = new TransformNode('toppingStation', scene);
    this.shaker.position.x = CONFIG.stationX;
    this.shaker.setEnabled(false);
  }

  async load(): Promise<void> {
    const model = await ImportMeshAsync(import.meta.env.BASE_URL + 'models/topping-station.glb', this.scene);
    model.meshes[0].parent = this.shaker;
    const valve = model.meshes.find(mesh => mesh.name === 'MeteringValve');
    if (!valve) throw new Error('トッピング計量弁がありません');
    this.valve = valve;
    if (valve.rotationQuaternion) {
      valve.rotationQuaternion.toEulerAnglesToRef(valve.rotation);
      valve.rotationQuaternion = null;
    }
    for (const mesh of model.meshes) {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
    }
  }

  updateNozzle(held: boolean, surface: number, time: number, dt: number): number {
    const target = held ? Math.min(CONFIG.nozzleTipY, surface + 0.33 + 0.045 * Math.sin(time * 18)) : CONFIG.nozzleTipY;
    this.tipY += (target - this.tipY) * (1 - Math.exp(-dt * 18));
    this.tipY = Math.max(this.tipY, surface + 0.07);
    this.nozzle.position.y = this.tipY + 0.19 * this.nozzle.scaling.y;
    this.nozzle.rotation.y = held ? 0.13 * Math.sin(time * 18) : 0;
    return this.tipY;
  }

  showShaker(): void {
    this.openingTime = 0;
    this.valveAngle = 0;
    this.valve.rotation.x = 0;
    this.shaker.setEnabled(true);
  }

  updateShaker(dt: number): boolean {
    this.openingTime = Math.max(0, this.openingTime - dt);
    const target = this.openingTime > 0 ? Math.PI / 2 : 0;
    this.valveAngle += Math.sign(target - this.valveAngle) * Math.min(Math.abs(target - this.valveAngle), dt * 20);
    this.valve.rotation.x = this.valveAngle;
    return this.valveAngle >= Math.PI * .47;
  }

  shakeShaker(): void {
    this.openingTime = .24;
  }

  outlet(): Vector3 {
    return new Vector3(CONFIG.stationX + (Math.random() - .5) * .12, 2.48, (Math.random() - .5) * .12);
  }

  reset(): void {
    this.shaker.setEnabled(false);
    this.tipY = CONFIG.nozzleTipY;
    this.updateNozzle(false, 0, 0, 0);
  }
}
