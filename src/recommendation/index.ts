export { computeRecommendation } from './computeRecommendation.ts';
export type { ComputeRecommendationInput } from './computeRecommendation.ts';
export { useRecommendation } from './useRecommendation.ts';
export { generateTargetedDrill } from './targetedDrill.ts';
export type { TargetedDrill, TargetedDrillOptions } from './targetedDrill.ts';
export { applyHysteresis, recommendationsEqual } from './hysteresis.ts';
export {
  readPersistedRecommendation,
  writePersistedRecommendation,
  clearPersistedRecommendation,
} from './persistence.ts';
export type { Recommendation } from './types.ts';
