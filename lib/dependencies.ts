import { BayesianState } from './engine';

// Define known sets of questions for dependency pruning
const BOWLING_QUESTIONS = new Set([
  'isSpinner', 'isFastBowler', 'isDeathBowlerArchetype', 
  'isMysterySpinnerArchetype', 'isEconomySpecialistArchetype', 'purpleCap'
]);

const BATTING_QUESTIONS = new Set([
  'battingLeft', 'battingRight', 'isFinisherArchetype', 
  'isAnchorArchetype', 'isPowerHitterArchetype', 'isStrokeMakerArchetype', 'orangeCap'
]);

const OVERSEAS_QUESTIONS = new Set([
  'isAustralian', 'isEnglish', 'isSouthAfrican', 'isWestIndian'
]);

const INDIAN_QUESTIONS = new Set([
  'isIndianAnchor', 'isIndianPacer'
]);

/**
 * Validates if a question is logically sound given the current state.
 * If 0, the question is entirely suppressed (redundant or illogical).
 * Returns 1.0 for valid, or 0.0 for invalid.
 */
export function computeLogicalValidity(questionId: string, state: BayesianState): number {
  if (!state.history || state.history.length === 0) return 1.0;

  // 1. Extract explicit knowns
  let isBatter = false, notBatter = false;
  let isBowler = false, notBowler = false;
  let isAllrounder = false, notAllrounder = false;
  let isWk = false, notWk = false;
  let isOverseas = false, notOverseas = false;

  for (const h of state.history) {
    if (h.questionId === 'isPureBatter') { h.answer === 'yes' ? isBatter = true : notBatter = true; }
    if (h.questionId === 'isPureBowler') { h.answer === 'yes' ? isBowler = true : notBowler = true; }
    if (h.questionId === 'isAllrounder') { h.answer === 'yes' ? isAllrounder = true : notAllrounder = true; }
    if (h.questionId === 'isWicketkeeper') { h.answer === 'yes' ? isWk = true : notWk = true; }
    if (h.questionId === 'isOverseas') { h.answer === 'yes' ? isOverseas = true : notOverseas = true; }
  }

  // 2. Mutual Exclusivity (Role Lockout)
  if (isWk && questionId === 'isPureBowler') return 0.0;
  if (isAllrounder && (questionId === 'isPureBatter' || questionId === 'isPureBowler')) return 0.0;
  if (isBatter && (questionId === 'isPureBowler' || questionId === 'isAllrounder')) return 0.0;
  if (isBowler && (questionId === 'isPureBatter' || questionId === 'isAllrounder' || questionId === 'isWicketkeeper')) return 0.0;

  // 3. Sub-type Suppression
  // If explicitly a batter/wk -> suppress all bowling subtypes instantly
  if (isBatter || isWk) {
    if (BOWLING_QUESTIONS.has(questionId)) return 0.0;
  }
  
  // If explicitly a bowler -> suppress all batting subtypes instantly
  if (isBowler) {
    if (BATTING_QUESTIONS.has(questionId)) return 0.0;
  }

  // 4. Nationality Pruning
  if (isOverseas && INDIAN_QUESTIONS.has(questionId)) return 0.0;
  if (notOverseas && OVERSEAS_QUESTIONS.has(questionId)) return 0.0;

  // 5. Redundancy / Duplication (Don't ask questions already answered)
  if (state.history.some(h => h.questionId === questionId)) return 0.0;

  return 1.0;
}

/**
 * Computes a contextual relevance multiplier for a question.
 * Questions that logically follow from recent answers get boosted.
 */
export function computeContextRelevance(questionId: string, state: BayesianState): number {
  if (state.history.length === 0) return 1.0;

  let multiplier = 1.0;
  const isWk = state.history.find(h => h.questionId === 'isWicketkeeper')?.answer === 'yes';
  const isBatter = state.history.find(h => h.questionId === 'isPureBatter')?.answer === 'yes';

  // Wicketkeepers are often finishers, captains, or anchors. Boost these.
  if (isWk && ['iplCaptain', 'isFinisherArchetype', 'battingLeft', 'isAnchorArchetype'].includes(questionId)) {
    multiplier *= 1.5;
  }

  // Pure batters: Handedness and specific roles become crucial
  if (isBatter && ['battingLeft', 'battingRight', 'orangeCap'].includes(questionId)) {
    multiplier *= 1.2;
  }

  return multiplier;
}

/**
 * 2. INFORMATION-GAIN MEMORY DECAY
 * Penalizes questions that are semantically similar to questions already asked.
 */
const SEMANTIC_GROUPS: Record<string, Set<string>> = {
  batting_role: new Set(['isPureBatter', 'isFinisherArchetype', 'isAnchorArchetype', 'isPowerHitterArchetype', 'isStrokeMakerArchetype']),
  bowling_role: new Set(['isPureBowler', 'isSpinner', 'isFastBowler', 'isDeathBowlerArchetype', 'isMysterySpinnerArchetype', 'isEconomySpecialistArchetype']),
  achievements: new Set(['orangeCap', 'purpleCap', 'centuries']),
  demographics: new Set(['isOverseas', 'isAustralian', 'isEnglish', 'isSouthAfrican', 'isWestIndian', 'isIndianAnchor', 'isIndianPacer']),
};

export function computeSemanticDecay(questionId: string, state: BayesianState): number {
  if (state.history.length === 0) return 1.0;
  
  let penalty = 1.0;
  
  // Find which group this question belongs to
  let targetGroup: Set<string> | null = null;
  for (const group of Object.values(SEMANTIC_GROUPS)) {
    if (group.has(questionId)) {
      targetGroup = group;
      break;
    }
  }

  if (targetGroup) {
    // Count how many questions from this same group have already been asked
    let groupCount = 0;
    for (const h of state.history) {
      if (targetGroup.has(h.questionId)) groupCount++;
    }
    
    // Decay multiplier: 1st related = 0.6x, 2nd related = 0.36x, etc.
    if (groupCount > 0) {
      penalty = Math.pow(0.6, groupCount);
    }
  }

  return penalty;
}
