/* セーブデータの読み書き。壊れた保存は初期値で続行する。 */
import { CREAMS, TOPPINGS } from './creams';

export interface SaveData {
  unlocked: number;
  stars: Record<string, number>;
  best: Record<string, number>;
  coins: number;
  ownedCreams: string[];
  ownedToppings: string[];
  cream: string;
  topping: string;
  muted: boolean;
}

const KEY = 'kanpekiCream3d.v2';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function defaultSave(): SaveData {
  return {
    unlocked: 1,
    stars: {},
    best: {},
    coins: 0,
    ownedCreams: ['vanilla'],
    ownedToppings: ['sprinkle'],
    cream: 'vanilla',
    topping: 'sprinkle',
    muted: false
  };
}

export function loadSave(): SaveData {
  const d = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<SaveData>;
    if (!p || typeof p !== 'object') return d;
    d.unlocked = clamp(Number.parseInt(String(p.unlocked ?? 1), 10) || 1, 1, 10);
    d.coins = Math.max(0, Number.parseInt(String(p.coins ?? 0), 10) || 0);
    if (p.stars && typeof p.stars === 'object') {
      for (const [k, v] of Object.entries(p.stars)) {
        d.stars[k] = clamp(Number.parseInt(String(v), 10) || 0, 0, 3);
      }
    }
    if (p.best && typeof p.best === 'object') {
      for (const [k, v] of Object.entries(p.best)) {
        d.best[k] = Math.max(0, Number.parseInt(String(v), 10) || 0);
      }
    }
    const creamIds = new Set(CREAMS.map((c) => c.id));
    const toppingIds = new Set(TOPPINGS.map((t) => t.id));
    if (Array.isArray(p.ownedCreams)) {
      d.ownedCreams = p.ownedCreams.filter((id) => creamIds.has(id));
    }
    if (Array.isArray(p.ownedToppings)) {
      d.ownedToppings = p.ownedToppings.filter((id) => toppingIds.has(id));
    }
    if (!d.ownedCreams.includes('vanilla')) d.ownedCreams.push('vanilla');
    if (!d.ownedToppings.includes('sprinkle')) d.ownedToppings.push('sprinkle');
    if (p.cream && d.ownedCreams.includes(p.cream)) d.cream = p.cream;
    if (p.topping && d.ownedToppings.includes(p.topping)) d.topping = p.topping;
    d.muted = Boolean(p.muted);
  } catch {
    // 壊れた保存は初期値で続行する
  }
  return d;
}

export function persistSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // ストレージが使えない環境では保存しない
  }
}
