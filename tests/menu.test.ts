import { expect, it } from 'vitest';
import { trayItems } from '../src/game/menu';
import { STAGES } from '../src/logic/judge';
import models from '../scripts/blender/models.json';

it('introduces bare waffles, then a row of individually playable fruits in the first stage', () => {
  expect(trayItems(0, 0)).toEqual(['waffle']);
  expect(trayItems(0, 1)).toEqual(['waffle']);
  expect(trayItems(0, 2)).toContain('strawberry');
  expect(new Set(trayItems(0, 2)).size).toBeGreaterThanOrEqual(3);
  expect(trayItems(1, 0)).toEqual(['tart_shell']);
});

it('serves every current Blender model and omits the cupcake', () => {
  const served = STAGES.flatMap((_, stage) => Array.from({ length: 8 }, (_, i) => trayItems(stage, i))).flat();
  expect(served).not.toContain('cupcake');
  expect(new Set(served)).toEqual(new Set(models.map(model => model.id)));
});
