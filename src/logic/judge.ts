/* 判定ロジックの公開入口。実装は cream.ts。 */
export {
  DURATION,
  IDEAL,
  BINS,
  COVER_LEVEL,
  SPREAD,
  EDGE_BOOST,
  GRACE,
  STAGES,
  RANKS,
  clamp,
  createCream,
  deposit,
  creamState,
  judgeCream,
  comboMultiplier,
  candyScore,
  starsFor,
  stageConfig
} from './cream';

export type {
  Cream,
  CreamState,
  SweetSpec,
  StageConfig,
  Rank,
  RankDef,
  JudgeResult,
  CandyScore
} from './cream';
