/* ゲーム全体のチューニング値をここへ集める。 */
export const CONFIG = {
  toppingSeconds: 5,
  /** レーンの半幅。お菓子はこの内側にほぼいっぱいに乗る */
  laneHalf: 1.14,
  /** レール（縁）の太さ */
  railSize: 0.12,
  /** ベルト上面の高さ */
  beltY: 0.55,
  /** ベルトの長さ（見える範囲） */
  beltLength: 60,
  /** ノズル直下（盛り付け位置） */
  stationX: 0,
  /** お菓子が流れ始める位置 */
  spawnX: -8.5,
  /** ここを通り過ぎたら採点 */
  judgeX: 2.0,
  /** ここまで流れたら消す */
  exitX: 11,
  /** お菓子の最大半径（スケール後） */
  sweetRadius: 1.02,
  /** お菓子の高さの上限（スケール後）。縦に長いモデルはここで縮める */
  sweetHeight: 1.7,
  /** 押しているあいだの連続絞り量。速度 1 あたり毎秒の盛り量 */
  flowK: 0.44,
  /** 毎秒の絞り量の上限 */
  flowMax: 3.2,
  /** お菓子がないときに垂らす間隔（秒） */
  dripInterval: 0.22,
  /** ノズル先端の高さ */
  nozzleTipY: 2.58,
  /** クリームの帯の太さ */
  streamRadius: 0.1,
  /** 同時に存在できるお菓子の数 */
  maxSweets: 5,
  /** 通過 1 回で理想量になる速度の基準 */
  referenceSpeed: 2.4
} as const;

export const COLORS = {
  sky: '#59c96a',
  skyTop: '#8fe08a',
  grass: '#5fd06d',
  beltTop: '#efe6ff',
  beltSide: '#c9b4ee',
  rail: '#ffffff',
  creamPink: '#ff9dc0'
} as const;
