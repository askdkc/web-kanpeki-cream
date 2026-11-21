/* クリームの盛り付け状態 — DOM / エンジン非依存の純粋ロジック
 *
 * 座標系はお菓子のローカル座標。
 *   u = 長さ方向（ベルトの流れ方向）の正規化位置。 -1 が後端、+1 が先端。
 *   v = 幅方向（レーンを横切る方向）の正規化位置。 -1..1。
 * 判定は u 方向を BINS 個の区間に分け、各区間の密度で被覆率を出す。
 * 1 本ぶんの理想量 IDEAL は「通過 1 回ぶん均一に塗った量」。
 */

export const DURATION = 60;
export const IDEAL = 1.0;
export const BINS = 21;
export const COVER_LEVEL = 0.5;
export const SPREAD = 0.1;
export const EDGE_BOOST = 1.9;
export const GRACE = 1;

export interface SweetSpec {
  /** お菓子の半長（ワールド単位） */
  halfX: number;
  /** お菓子の半幅（ワールド単位） */
  halfZ: number;
  /** クリーム面の高さ（お菓子のローカル Y） */
  creamY?: number;
  supported?: boolean[];
}

export interface Cream {
  spec: Required<Pick<SweetSpec, 'halfX' | 'halfZ'>> & { creamY: number };
  bins: number[];
  supported?: boolean[];
  offTarget: boolean;
  /** お菓子上に乗った量 */
  amount: number;
  /** 土台の外へ落ちた量 */
  spill: number;
  /** 絞ったフレーム数 */
  drops: number;
}

export interface CreamState {
  spec: Cream['spec'];
  offTarget: boolean;
  amount: number;
  drops: number;
  /** 被覆率 0..1 */
  cover: number;
  coveredBins: number;
  gaps: number;
  innerGaps: number;
  startCovered: boolean;
  endCovered: boolean;
  headMissing: number;
  tailMissing: number;
  /** 塗れている範囲の中心（-1..1） */
  mid: number;
  /** 塗れている範囲の半長（0..1） */
  spanHalf: number;
  /** 一番盛れた区間の密度（理想の均一塗り = 1.0） */
  thickness: number;
  overflow: number;
  spill: number;
  /** 区間ごとの密度（描画用） */
  profile: number[];
}

export type Rank = 'perfect' | 'great' | 'good' | 'miss';

export interface StageConfig {
  n: number;
  name: string;
  /** ベルト速度 (units/秒) */
  speed: number;
  /** 出現間隔 (秒) */
  gap: number;
  /** 被覆率の許容（perfect, great, good） */
  cover: [number, number, number];
  /** はみ出し量の許容 */
  spill: number;
  /** クリアに必要な得点 */
  quota: number;
}

export interface RankDef {
  label: string;
  emoji: string;
  base: number;
  color: string;
}

export interface JudgeResult {
  rank: Rank;
  reason: 'ok' | 'short' | 'spill' | 'edge';
  detail: string;
  label: string;
  emoji: string;
  color: string;
  base: number;
  earned: number;
  penalty: number;
  total: number;
  amount: number;
  cover: number;
  spill: number;
}

export const STAGES: StageConfig[] = [
  { n: 1, name: 'はじめてのシュガー', speed: 2.4, gap: 2.9, cover: [0.97, 0.88, 0.66], spill: 0.55, quota: 900 },
  { n: 2, name: 'ミルキーウェイ', speed: 2.6, gap: 2.85, cover: [0.97, 0.88, 0.66], spill: 0.55, quota: 980 },
  { n: 3, name: 'いちご畑', speed: 2.8, gap: 2.75, cover: [0.97, 0.87, 0.65], spill: 0.52, quota: 1060 },
  { n: 4, name: 'ショコラ通り', speed: 3.1, gap: 2.65, cover: [0.97, 0.87, 0.64], spill: 0.5, quota: 1150 },
  { n: 5, name: 'キャラメル坂', speed: 3.3, gap: 2.55, cover: [0.96, 0.86, 0.63], spill: 0.48, quota: 1240 },
  { n: 6, name: 'バニラ雲海', speed: 3.6, gap: 2.45, cover: [0.96, 0.86, 0.62], spill: 0.46, quota: 1330 },
  { n: 7, name: 'マロン迷路', speed: 3.8, gap: 2.35, cover: [0.96, 0.85, 0.61], spill: 0.44, quota: 1420 },
  { n: 8, name: 'レモン峠', speed: 4.0, gap: 2.25, cover: [0.95, 0.84, 0.6], spill: 0.42, quota: 1510 },
  { n: 9, name: 'ラズベリー渓谷', speed: 4.2, gap: 2.15, cover: [0.95, 0.83, 0.59], spill: 0.4, quota: 1600 },
  { n: 10, name: '完璧の頂', speed: 4.4, gap: 2.05, cover: [0.95, 0.82, 0.58], spill: 0.38, quota: 1700 }
];

export const RANKS: Record<Rank, RankDef> = {
  perfect: { label: 'かんぺき', emoji: '😍', base: 100, color: '#ef6f97' },
  great: { label: 'いいかんじ', emoji: '😆', base: 65, color: '#f0a03b' },
  good: { label: 'まあまあ', emoji: '😌', base: 35, color: '#4fb39b' },
  miss: { label: 'ざんねん', emoji: '😵', base: 0, color: '#9b8d84' }
};

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createCream(spec?: Partial<SweetSpec>): Cream {
  const halfX = spec && spec.halfX && spec.halfX > 0 ? spec.halfX : 0.8;
  const halfZ = spec && spec.halfZ && spec.halfZ > 0 ? spec.halfZ : 0.62;
  const creamY = spec && typeof spec.creamY === 'number' ? spec.creamY : 0;
  const bins: number[] = [];
  for (let i = 0; i < BINS; i++) bins.push(0);
  return {
    spec: { halfX, halfZ, creamY },
    bins,
    supported: spec?.supported,
    offTarget: false,
    amount: 0,
    spill: 0,
    drops: 0
  };
}

/** クリームを 1 回ぶん着地させる。u は長さ方向、dv は盛り量（IDEAL 基準）。 */
export function deposit(cream: Cream, u: number, dv: number): Cream {
  if (!(dv > 0)) return cream;
  const uu = u;
  if (Math.abs(u) > 1 || cream.supported?.[Math.round((u + 1) * (BINS - 1) / 2)] === false) {
    cream.spill += dv;
    return cream;
  }
  cream.drops += 1;

  const weights: number[] = [];
  let wsum = 0;
  for (let i = 0; i < BINS; i++) {
    const x = -1 + (2 * i) / (BINS - 1);
    let w = Math.exp(-((x - uu) * (x - uu)) / (2 * SPREAD * SPREAD));
    if (w < 1e-4 || cream.supported?.[i] === false) w = 0;
    weights.push(w);
    wsum += w;
  }
  if (wsum > 0) {
    for (let i = 0; i < BINS; i++) {
      const w = weights[i] ?? 0;
      if (w > 0) cream.bins[i] = (cream.bins[i] ?? 0) + (dv * w) / wsum;
    }
  } else {
    const i = uu < 0 ? 0 : BINS - 1;
    cream.bins[i] = (cream.bins[i] ?? 0) + dv;
  }
  cream.amount += dv;
  return cream;
}

export function creamState(cream: Cream): CreamState {
  const n = BINS;
  const target = IDEAL / n;
  let amount = 0;
  let covered = 0;
  let first = -1;
  let last = -1;
  let gaps = 0;
  const density: number[] = [];
  const profile: number[] = [];

  for (let i = 0; i < n; i++) {
    const raw = (cream.bins[i] ?? 0) / target;
    let d = raw;
    // 端の区間は片側からしかクリームを受け取らないので、その分を補正する
    if (i === 0 || i === n - 1) d *= EDGE_BOOST;
    density.push(d);
    profile.push(raw);
    amount += cream.bins[i] ?? 0;
    if (d >= COVER_LEVEL) {
      covered++;
      if (first < 0) first = i;
      last = i;
    } else {
      gaps++;
    }
  }

  const startD = density[0] ?? 0;
  const endD = density[n - 1] ?? 0;
  const cover = covered / Math.max(1, cream.supported?.filter(Boolean).length ?? n);
  const spanHalf = first < 0 ? 0 : (last - first) / (n - 1);
  const mid = first < 0 ? 0 : (first + last) / (n - 1) - 1;

  let innerGaps = 0;
  if (first >= 0) {
    for (let i = first; i <= last; i++) if ((density[i] ?? 0) < COVER_LEVEL) innerGaps++;
  }

  let peak = 0;
  for (let i = 1; i < n - 1; i++) {
    const d = density[i] ?? 0;
    if (d > peak) peak = d;
  }
  const overflow = Math.max(0, peak - 1.75) * 0.5;
  const spill = cream.spill + overflow * 0.45;

  return {
    spec: cream.spec,
    offTarget: cream.offTarget,
    amount,
    drops: cream.drops,
    cover,
    coveredBins: covered,
    gaps,
    innerGaps,
    startCovered: startD >= COVER_LEVEL,
    endCovered: endD >= COVER_LEVEL,
    headMissing: first < 0 ? n : first,
    tailMissing: first < 0 ? n : n - 1 - last,
    mid,
    spanHalf,
    thickness: peak,
    overflow,
    spill,
    profile
  };
}

export function judgeCream(state: CreamState, stage?: StageConfig): JudgeResult {
  const t = stage ?? STAGES[0]!;
  const edges = (state.startCovered ? 1 : 0) + (state.endCovered ? 1 : 0);
  let rank: Rank;
  let reason: JudgeResult['reason'];
  let detail: string;

  if (state.amount < 0.12) {
    rank = 'miss';
    reason = 'short';
    detail = 'クリームが乗っていない';
  } else if (state.offTarget || state.spill > t.spill || state.amount > 1.55 || state.thickness > 1.9) {
    rank = 'miss';
    reason = 'spill';
    detail = 'お菓子からはみ出した';
  } else if (state.cover >= t.cover[0] && edges === 2) {
    rank = 'perfect';
    reason = 'ok';
    detail = 'はしまでかんぺき!';
  } else if (state.cover >= t.cover[1]) {
    rank = 'great';
    reason = 'ok';
    detail = 'いいかんじ';
  } else if (state.cover >= t.cover[2]) {
    rank = 'good';
    reason = 'ok';
    detail = 'もうすこし';
  } else {
    rank = 'miss';
    if (edges < 2 && state.cover >= t.cover[2] * 0.8) {
      reason = 'edge';
      detail = 'はしが塗れていない';
    } else {
      reason = 'short';
      detail = '塗り残しがある';
    }
  }

  const base = RANKS[rank];
  const earned = Math.round(base.base * (0.62 + 0.38 * state.cover));
  const lack = Math.round(48 * (1 - state.cover));
  const edgePenalty = (2 - edges) * 14;
  const spillPenalty = Math.round(55 * Math.min(1, state.spill / 0.6));
  const peakPenalty = state.thickness > 1.9 ? Math.round((state.thickness - 1.9) * 40) : 0;
  const overPenalty = state.amount > 1.55 ? Math.round((state.amount - 1.55) * 45) : 0;
  const penalty = lack + edgePenalty + spillPenalty + peakPenalty + overPenalty;

  return {
    rank,
    reason,
    detail,
    label: base.label,
    emoji: base.emoji,
    color: base.color,
    base: base.base,
    earned,
    penalty,
    total: earned - penalty,
    amount: state.amount,
    cover: state.cover,
    spill: state.spill
  };
}

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(Math.max(combo, 0), 10) * 0.05;
}

export interface CandyScore {
  base: number;
  bonus: number;
  total: number;
  mult: number;
}

export function candyScore(judge: JudgeResult, combo: number, toppings: number): CandyScore {
  const mult = comboMultiplier(combo);
  const base = judge.total > 0 ? Math.round(judge.total * mult) : Math.round(judge.total);
  const bonus = judge.rank === 'miss' ? 0 : Math.round(toppings) * 8;
  return { base, bonus, total: base + bonus, mult };
}

export function starsFor(score: number, quota: number): number {
  if (!(quota > 0)) return 0;
  const r = score / quota;
  if (r >= 1.55) return 3;
  if (r >= 1.25) return 2;
  if (r >= 1) return 1;
  return 0;
}

export function stageConfig(index: number): StageConfig {
  return STAGES[clamp(index | 0, 0, STAGES.length - 1)]!;
}
