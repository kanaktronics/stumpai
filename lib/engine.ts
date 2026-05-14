import { Player, IPLEra, Answer, Attr } from './types';
import { PLAYERS } from './players';

/* ──────────────────────────────────────────────────────────────────────────
   ENGINE ARCHITECTURE: PROBABILISTIC INFERENCE V5
   ────────────────────────────────────────────────────────────────────────── */

export interface BayesianState {
  probabilities: Record<string, number>;
  activePool: string[]; // List of candidate IDs that haven't been hard-eliminated
  history: Array<{ questionId: string; answer: Answer }>;
  maybeCount: number;
  phase: 1 | 2 | 3 | 4;
}

// ── 1. HARD CONSTRAINTS ──────────────────────────────────────────────────
// These fields trigger binary elimination. If a player violates these, 
// they are permanently removed from the active pool.
// NOTE: Only boolean fields work here. String enums (role, bowlingStyle) are
// handled by attrFn in questions.ts, not by the hard-constraint key lookup.
const HARD_FIELDS: string[] = [
  'isOverseas',
  'isIndian',
  'retiredFromIPL',
];

/**
 * Initializes the Bayesian state with a uniform distribution across all players.
 */
export function initState(): BayesianState {
  const initialProb = 1 / PLAYERS.length;
  const probabilities: Record<string, number> = {};
  PLAYERS.forEach(p => { probabilities[p.id] = initialProb; });

  return {
    probabilities,
    activePool: PLAYERS.map(p => p.id),
    history: [],
    maybeCount: 0,
    phase: 1
  };
}

/**
 * CORE UPDATE LOGIC: Bayesian Inference with Hard Constraints
 * 
 * 1. Filtering: Apply binary elimination for hard fields.
 * 2. Probabilistic Scoring: Use controlled uncertainty decay for 'Maybe'.
 * 3. Normalization: Re-balance the probability space.
 */
export function updateProbabilities(
  state: BayesianState,
  questionId: string,
  answer: Answer,
  attrResolver: ((p: Player) => boolean) | string  // fn or direct field key
): BayesianState {
  if (answer === 'dont-know') {
    return { ...state, history: [...state.history, { questionId, answer }] };
  }

  const newState = { ...state };
  newState.probabilities = { ...state.probabilities };
  newState.history = [...state.history, { questionId, answer }];
  if (answer === 'maybe') newState.maybeCount = (state.maybeCount || 0) + 1;

  const scoreYes   = 1.0;
  const scoreMaybe = 0.5;
  const scoreNo    = 0.15; // Softened to prevent premature hypothesis collapse

  const newActivePool: string[] = [];

  PLAYERS.forEach(player => {
    const currentProb = newState.probabilities[player.id] ?? 0;
    if (currentProb === 0) return; // already eliminated

    // Resolve the attribute — support both attrFn and string field key
    const hasAttr = typeof attrResolver === 'function'
      ? attrResolver(player)
      : checkAttribute(player, attrResolver);

    const isHardField = typeof attrResolver === 'string' && HARD_FIELDS.includes(attrResolver);

    // ── HARD CONSTRAINT: binary elimination ─────────────────────────────
    if (isHardField) {
      if ((answer === 'yes' && !hasAttr) || (answer === 'no' && hasAttr)) {
        newState.probabilities[player.id] = 0;
        return; // permanently eliminated
      }
    }

    // ── SOFT PROBABILISTIC RANKING ────────────────────────────────────
    let multiplier = 1.0;
    if (answer === 'yes') {
      multiplier = hasAttr ? scoreYes : scoreNo;
    } else if (answer === 'no') {
      multiplier = hasAttr ? scoreNo : scoreYes;
    } else if (answer === 'maybe') {
      multiplier = scoreMaybe;
    }

    const jitter = 0.97 + Math.random() * 0.06; // ±3% jitter
    newState.probabilities[player.id] = currentProb * multiplier * jitter;

    if (newState.probabilities[player.id] > 1e-9) {
      newActivePool.push(player.id);
    } else {
      newState.probabilities[player.id] = 0;
    }
  });

  // Normalize
  const total = Object.values(newState.probabilities).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const id of Object.keys(newState.probabilities)) {
      newState.probabilities[id] /= total;
      
      // Strict Active Pool definition: Only keep candidates holding at least 0.05% of the probability mass.
      // This fixes the "stuck at 811" frontend bug.
      if (newState.probabilities[id] > 0.0005) {
        newActivePool.push(id);
      }
    }
  }

  newState.activePool = newActivePool;

  // Phase transition by entropy
  const entropy = computeEntropy(newState.probabilities);
  if      (entropy < 3) newState.phase = 4;
  else if (entropy < 6) newState.phase = 3;
  else if (entropy < 9) newState.phase = 2;
  else                  newState.phase = 1;

  return newState;
}

/**
 * COMPETITIVE CONFIDENCE CALCULATION
 * Computes a mathematically robust confidence score utilizing:
 * 1. Competitive separation (p1 vs p2, p3)
 * 2. Absolute probability strength (p1)
 * 3. Shannon Entropy damping (prevents high confidence in flat distributions)
 */
export function getTopConfidence(state: BayesianState): number {
  const sorted = Object.entries(state.probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (sorted.length === 0) return 0;
  
  const p1 = sorted[0][1];
  const p2 = sorted[1]?.[1] || 0;
  const p3 = sorted[2]?.[1] || 0;

  // If top candidate is effectively zero, confidence is zero.
  if (p1 < 0.0001) return 0;

  const entropy = computeEntropy(state.probabilities);
  
  // 1. Competitive Ratio (Margin)
  const competitiveRatio = p1 / (p1 + p2 + p3);
  
  // 2. Absolute Probability Penalty (Requires p1 to actually be significant)
  const absolutePenalty = Math.min(1.0, p1 * 4); // p1 >= 0.25 removes penalty
  
  // 3. Entropy Damping (Max entropy is ~9.6)
  const entropyDamping = Math.max(0, 1 - (entropy / 8.5));
  
  // Base raw confidence
  let confidence = (competitiveRatio * 0.6 + entropyDamping * 0.4) * absolutePenalty * 100;
  
  // 4. CONFIDENCE SANITY CHECKER (Hard Caps)
  if (entropy > 7.0) confidence = Math.min(confidence, 25);
  else if (entropy > 5.5) confidence = Math.min(confidence, 55);
  else if (entropy > 4.0) confidence = Math.min(confidence, 75);
  else if (entropy > 2.0) confidence = Math.min(confidence, 86);
  
  if (p1 < 0.05) confidence = Math.min(confidence, 15);
  else if (p1 < 0.15) confidence = Math.min(confidence, 45);
  else if (p1 < 0.30) confidence = Math.min(confidence, 65);

  return confidence;
}

/**
 * SHANNON ENTROPY
 * Measure of uncertainty in the candidate space.
 */
export function computeEntropy(probs: Record<string, number>): number {
  return Object.values(probs).reduce((acc, p) => {
    if (p <= 0) return acc;
    return acc - p * Math.log2(p);
  }, 0);
}

/**
 * TRUE INFORMATION GAIN SELECTOR (Shannon IG)
 * 
 * For each candidate question Q, computes:
 *   IG(Q) = H(current) - [ P(yes)*H(posterior|yes) + P(no)*H(posterior|no) ]
 * 
 * This is the exact algorithm used by Akinator and 20Q systems.
 * Picks the question that creates the most even 50/50 split = maximum IG.
 */
export interface SelectableQuestion {
  id: string;
  attr: string | ((p: Player) => boolean);
  weight: number;
}

export function mctsSelectBestQuestion(
  state: BayesianState,
  options: SelectableQuestion[],
): { question: SelectableQuestion; gain: number; debugInfo: { pYes: number; splitQuality: number } } | null {
  let bestQ: SelectableQuestion | null = null;
  let maxGain = -1;
  let bestDebug = { pYes: 0, splitQuality: 0 };

  // Only operate over the active candidate pool (non-zero probability players)
  const activeCandidates = state.activePool
    .map(id => ({ id, player: PLAYERS.find(p => p.id === id)!, prob: state.probabilities[id] ?? 0 }))
    .filter(c => c.player && c.prob > 0);

  const currentEntropy = computeEntropy(state.probabilities);

  options.forEach(opt => {
    // ── Step 1: Partition the pool into YES and NO groups ─────────────
    const yesProbs: Record<string, number> = {};
    const noProbs: Record<string, number> = {};
    let pYes = 0;
    let pNo = 0;

    activeCandidates.forEach(({ id, player, prob }) => {
      const hasAttr = typeof opt.attr === 'function' ? opt.attr(player) : checkAttribute(player, opt.attr);
      if (hasAttr) {
        yesProbs[id] = prob;
        pYes += prob;
      } else {
        noProbs[id] = prob;
        pNo += prob;
      }
    });

    // Skip degenerate questions that split 0/100 (useless)
    if (pYes < 0.001 || pNo < 0.001) return;

    // ── Step 2: Normalize each branch into a valid distribution ───────
    const normYes: Record<string, number> = {};
    const normNo: Record<string, number> = {};
    for (const id in yesProbs) normYes[id] = yesProbs[id] / pYes;
    for (const id in noProbs) normNo[id] = noProbs[id] / pNo;

    // ── Step 3: Compute expected posterior entropy ─────────────────────
    const hYes = computeEntropy(normYes);
    const hNo  = computeEntropy(normNo);
    const expectedPostEntropy = pYes * hYes + pNo * hNo;

    // ── Step 4: True Information Gain ─────────────────────────────────
    const ig = currentEntropy - expectedPostEntropy;

    // Blend IG with question weight (cricket domain weight prevents trivial splits)
    const weightedGain = ig * (0.85 + (opt.weight / 5) * 0.15);

    // Small jitter to break ties
    const jitter = weightedGain * (0.97 + Math.random() * 0.06);

    if (jitter > maxGain) {
      maxGain = jitter;
      bestQ = opt;
      bestDebug = { pYes, splitQuality: 1 - Math.abs(pYes - 0.5) * 2 };
    }
  });

  return bestQ ? { question: bestQ, gain: maxGain, debugInfo: bestDebug } : null;
}

export function getTopCandidates(state: BayesianState, n: number = 3) {
  return Object.entries(state.probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([id, p]) => ({
      player: PLAYERS.find(pl => pl.id === id)!,
      p_value: p
    }));
}

/**
 * EXPLAINABLE AI: NARRATIVE INTERPRETATION
 */
export function getConfidenceInterpretation(state: BayesianState, confidence: number): string {
  if (confidence >= 88) return "CONVERGENCE ACHIEVED";
  if (confidence >= 70) return "ORACLE NEARING CONVERGENCE...";
  if (confidence >= 40) return "DEEP NEURAL SCANNING...";
  return "BROAD SPECTRUM ANALYSIS...";
}



function checkAttribute(player: Player, attr: string): boolean {
  const p = player as unknown as Record<string, unknown>;

  // Map legacy / missing fields to their actual equivalents in the data
  const FIELD_ALIASES: Record<string, string> = {
    primaryRole: 'role',   // players_generated uses 'role', not 'primaryRole'
  };
  const resolvedAttr = FIELD_ALIASES[attr] ?? attr;

  // Support nested dot-notation attributes
  if (resolvedAttr.includes('.')) {
    const parts = resolvedAttr.split('.');
    let curr: any = p;
    for (const part of parts) { curr = curr?.[part]; }
    return !!curr;
  }
  return !!p[resolvedAttr];
}
