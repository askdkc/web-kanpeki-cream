import { describe, expect, it } from 'vitest';
import {
  STAGES,
  candyScore,
  creamState,
  createCream,
  deposit,
  judgeCream,
  starsFor
} from '../src/logic/judge';

/** お菓子が -6 から +6 まで等速で流れ、その間ずっと絞った場合の塗り */
function passThrough(opts: {
  speed: number;
  k: number;
  halfX: number;
  from?: number;
  to?: number;
  stage?: number;
}): ReturnType<typeof creamState> {
  const { speed, k, halfX, from = -1, to = 1, stage = 0 } = opts;
  const cream = createCream({ halfX, halfZ: halfX });
  const dt = 1 / 120;
  let x = -6;
  while (x < 6) {
    x += speed * dt;
    if (Math.abs(x) > halfX * 1.1) continue;
    const u = -x / halfX;
    if (u < from || u > to) continue;
    deposit(cream, u, speed * dt * k);
  }
  void STAGES[stage];
  return creamState(cream);
}

describe('creamState / judgeCream', () => {
  it('何も盛らなければ miss で、クリームが乗っていないと報告する', () => {
    const st = creamState(createCream({ halfX: 1.2, halfZ: 1.2 }));
    const res = judgeCream(st, STAGES[0]);
    expect(res.rank).toBe('miss');
    expect(res.reason).toBe('short');
    expect(res.amount).toBe(0);
  });

  it('通過中ずっと絞れば cover 1.0・perfect', () => {
    const st = passThrough({ speed: 2.4, k: 0.42, halfX: 1.2 });
    const res = judgeCream(st, STAGES[0]);
    expect(st.cover).toBe(1);
    expect(st.startCovered).toBe(true);
    expect(st.endCovered).toBe(true);
    expect(res.rank).toBe('perfect');
    expect(res.total).toBeGreaterThan(80);
  });

  it('終盤だけ絞ると端が欠けて edge 理由で減点される', () => {
    const st = passThrough({ speed: 2.4, k: 0.42, halfX: 1.2, from: -0.45 });
    const res = judgeCream(st, STAGES[0]);
    expect(st.startCovered).toBe(false);
    expect(res.rank).not.toBe('perfect');
    expect(res.penalty).toBeGreaterThan(0);
    expect(res.total).toBeLessThan(80);
  });

  it('出しすぎると spill か overflow で減点される', () => {
    const st = passThrough({ speed: 2.4, k: 1.4, halfX: 1.2 });
    const res = judgeCream(st, STAGES[0]);
    expect(res.penalty).toBeGreaterThan(0);
    expect(res.total).toBeLessThan(100);
    expect(st.spill > 0 || st.thickness > 1.9 || st.amount > 1.55).toBe(true);
  });

  it('profile は区間ごとの密度で、合計が量に比例する', () => {
    const cream = createCream({ halfX: 1, halfZ: 1 });
    deposit(cream, 0, 0.5);
    const st = creamState(cream);
    expect(st.profile).toHaveLength(21);
    expect(st.profile.every((p) => p >= 0)).toBe(true);
    const sum = st.profile.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
  });
});

describe('得点と星', () => {
  it('コンボ倍率は上限 1.5', () => {
    const st = passThrough({ speed: 2.6, k: 0.44, halfX: 1.2 });
    const res = judgeCream(st, STAGES[1]);
    const sc = candyScore(res, 40, 8);
    expect(sc.mult).toBeCloseTo(1.5, 5);
    expect(sc.bonus).toBe(64);
  });

  it('クリア基準に応じて星が増える', () => {
    expect(starsFor(99, 100)).toBe(0);
    expect(starsFor(100, 100)).toBe(1);
    expect(starsFor(124, 100)).toBe(1);
    expect(starsFor(125, 100)).toBe(2);
    expect(starsFor(155, 100)).toBe(3);
  });
});

it('keeps cream off the pastry when the nozzle is outside its edge', () => {
  const cream = createCream();
  deposit(cream, 1.02, 0.1);
  expect(cream.amount).toBe(0);
  expect(cream.spill).toBeCloseTo(0.1);
});

it('refuses perfect for an uninterrupted stroke across the belt', () => {
  const st = passThrough({speed: 2.4, k: 0.42, halfX: 1.2});
  expect(judgeCream({...st, offTarget: true}).rank).toBe('miss');
});
