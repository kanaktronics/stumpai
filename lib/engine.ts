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
  const scoreMaybe = 0.45;
  const scoreNo    = 0.001;

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
 * Formula: C = p1 / (p1 + p2 + p3)
 * Ensures certainty only when the top candidate truly separates from the pack.
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

  const confidence = p1 / (p1 + p2 + p3);
  return confidence * 100;
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
 * INFORMATION GAIN MCTS
 * Selects the question that maximizes the expected reduction in entropy.
 */
export interface SelectableQuestion {
  id: string;
  attr: string | ((p: Player) => boolean);
  weight: number;
}

export function mctsSelectBestQuestion(
  state: BayesianState,
  options: SelectableQuestion[],
  sampleSize: number = 5
): { question: SelectableQuestion; gain: number } | null {
  let bestQ: SelectableQuestion | null = null;
  let maxGain = -1;

  // Use a subset of candidates to estimate gain (speed)
  const topCandidates = getTopCandidates(state, 50).map(c => c.player.id);
  const currentEntropy = computeEntropy(state.probabilities);

  options.forEach(opt => {
    // Calculate P(Yes) vs P(No) for this question
    let pYes = 0;
    topCandidates.forEach(id => {
      const p = PLAYERS.find(pl => pl.id === id)!;
      const match = typeof opt.attr === 'function' ? opt.attr(p) : checkAttribute(p, opt.attr);
      if (match) pYes += state.probabilities[id];
    });

    const pNo = 1 - pYes;
    
    // Expected Entropy: IG(Q) = H(S) - [pYes * H(S|Yes) + pNo * H(S|No)]
    // We simplify: optimal questions split the pool 50/50.
    const splitQuality = 1 - Math.abs(pYes - 0.5) * 2; // 1.0 is perfect 50/50 split
    const gain = splitQuality * (opt.weight / 5);

    // Add small randomization to break ties and ensure variety
    const jitter = gain * (0.9 + Math.random() * 0.2);

    if (jitter > maxGain) {
      maxGain = jitter;
      bestQ = opt;
    }
  });

  return bestQ ? { question: bestQ, gain: maxGain } : null;
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
