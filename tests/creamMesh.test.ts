import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { CreamMesh } from '../src/scene/creamMesh';
import { creamById } from '../src/game/creams';
import { createCream, deposit, creamState } from '../src/logic/cream';

it('leaves the bare end of a partly iced cake uncovered', () => {
  const engine = new NullEngine();
  try {
    const cream = createCream();
    deposit(cream, 0.75, 0.4);
    const surface = new CreamMesh(new Scene(engine), creamById('vanilla'));
    surface.update(creamState(cream), 1, 1, 'swirl', 0);
    const xyz = surface.mesh.getVerticesData('position')!;
    let icedWidth = 0;
    let bareWidth = 0;
    for (let i = 0; i < xyz.length; i += 3) {
      if (xyz[i]! < -0.5) bareWidth = Math.max(bareWidth, Math.abs(xyz[i + 2]!));
      if (xyz[i]! > 0.5) icedWidth = Math.max(icedWidth, Math.abs(xyz[i + 2]!));
    }
    expect(icedWidth).toBeGreaterThan(0.2);
    expect(bareWidth).toBe(0);
  } finally {
    engine.dispose();
  }
});

it('keeps an earlier ridge still when cream is added at the other end', () => {
  const engine = new NullEngine();
  try {
    const cream = createCream();
    const surface = new CreamMesh(new Scene(engine), creamById('blueberry'));
    const leftSide = () => {
      const positions = surface.mesh.getVerticesData('position')!;
      const points = [];
      for (let i = 0; i < positions.length; i += 3) {
        if (positions[i]! < -0.45) points.push(positions[i + 1], positions[i + 2]);
      }
      return points;
    };
    deposit(cream, -0.7, 0.25);
    surface.update(creamState(cream), 1, 1, 'cloud', 0);
    const before = leftSide();
    deposit(cream, 0.75, 0.45);
    surface.update(creamState(cream), 1, 1, 'cloud', 0);
    expect(leftSide()).toEqual(before);
  } finally {
    engine.dispose();
  }
});

it('bounds even an overfilled ribbon by the baked footprint, leaving the doughnut hole bare', async () => {
  const { icingSurfaces } = await import('../src/game/icingSurface');
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    for (const shape of Object.values(icingSurfaces)) {
      const cream = createCream();
      for (let i = 0; i <= 40; i++) deposit(cream, i / 20 - 1, 0.08);
      const mesh = new CreamMesh(scene, creamById('vanilla'), shape);
      mesh.update(creamState(cream), shape.halfX, shape.halfZ, 'swirl', 1);
      const p = mesh.mesh.getVerticesData('position')!;
      let overhang = 0;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i];
        const row = Math.round((x / shape.halfX + 1) * (shape.rows.length - 1) / 2);
        overhang = Math.max(overhang, Math.abs(x) - shape.halfX, Math.abs(p[i + 2]) - shape.rows[row][0]);
      }
      expect(overhang).toBeLessThan(1e-6);
      mesh.dispose();
    }
    expect(icingSurfaces.donut.rows[32][0]).toBe(0);
  } finally {
    engine.dispose();
  }
});
