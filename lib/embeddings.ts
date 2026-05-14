/**
 * PLAYER EMBEDDING ENGINE — Representation Learning Layer
 *
 * Converts every player into a dense numeric feature vector using:
 *   - identityDNA fields (17 continuous dimensions)
 *   - auraEmbedding fields (5 continuous dimensions)
 *   - Key boolean attributes (encoded as 0/1)
 *
 * This enables:
 *   1. Cosine similarity between players (Jadeja ≈ Axar, etc.)
 *   2. Similarity-weighted Bayesian updates (avoids eliminating "twins")
 *   3. Cluster-aware convergence penalties
 */

import { Player } from './types';

export type EmbeddingVector = number[];

/** Extract a dense float vector from a player's full attribute profile. */
export function playerToVector(p: Player): EmbeddingVector {
  const dna = (p as any).identityDNA ?? {};
  const aura = (p as any).auraEmbedding ?? {};

  // ── DIMENSION 1–17: Identity DNA ─────────────────────────────────
  const dnaVec = [
    dna.finisher         ?? 0,
    dna.anchor           ?? 0,
    dna.powerHitter      ?? 0,
    dna.strokeMaker      ?? 0,
    dna.opener           ?? 0,
    dna.deathBowler      ?? 0,
    dna.spinWizard       ?? 0,
    dna.paceAggressor    ?? 0,
    dna.economySpecialist?? 0,
    dna.clutchPlayer     ?? 0,
    dna.captainAura      ?? 0,
    dna.memeFactor       ?? 0,
    dna.fanbaseIntensity ?? 0,
    dna.underdog         ?? 0,
    dna.longevity        ?? 0,
    dna.oneSeasonWonder  ?? 0,
    dna.consistent       ?? 0,
  ];

  // ── DIMENSION 18–22: Aura Embedding ──────────────────────────────
  const auraVec = [
    aura.composed     ?? 0,
    aura.aggressive   ?? 0,
    aura.explosive    ?? 0,
    aura.innovative   ?? 0,
    aura.captainLike  ?? 0,
  ];

  // ── DIMENSION 23–40+: Key Boolean Attributes ─────────────────────
  const boolVec = [
    p.isIndian            ? 1 : 0,
    p.isOverseas          ? 1 : 0,
    p.iplCaptain          ? 1 : 0,
    p.internationalCaptain? 1 : 0,
    p.orangeCap           ? 1 : 0,
    p.purpleCap           ? 1 : 0,
    p.centuries           ? 1 : 0,
    p.fiveWickets         ? 1 : 0,
    p.strikeRateAbove150  ? 1 : 0,
    p.economyBelow7       ? 1 : 0,
    p.retiredFromIPL      ? 1 : 0,
    (p as any).playedBefore2012 ? 1 : 0,
    (p as any).playedAfter2018  ? 1 : 0,
    (p as any).matchesAbove100  ? 1 : 0,
    (p as any).wicketsAbove100  ? 1 : 0,
    (p as any).runsAbove2000    ? 1 : 0,
    (p as any).singleTeamLoyal  ? 1 : 0,
    (p as any).multipleTeams    ? 1 : 0,
    // Role encoding (one-hot)
    p.role === 'batsman'         ? 1 : 0,
    p.role === 'bowler'          ? 1 : 0,
    p.role === 'allrounder'     ? 1 : 0,
    p.role === 'wicketkeeper'    ? 1 : 0,
    // Era encoding (one-hot)
    (p as any).era === 'early'   ? 1 : 0,
    (p as any).era === 'middle'  ? 1 : 0,
    (p as any).era === 'modern'  ? 1 : 0,
  ];

  return [...dnaVec, ...auraVec, ...boolVec];
}

/** Cosine similarity between two vectors. Returns 0–1. */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── CACHE: Pre-compute all vectors once at startup ────────────────────────
let _cache: Map<string, EmbeddingVector> | null = null;

export function getEmbeddingCache(players: Player[]): Map<string, EmbeddingVector> {
  if (_cache) return _cache;
  _cache = new Map();
  for (const p of players) {
    _cache.set(p.id, playerToVector(p));
  }
  return _cache;
}

/**
 * SIMILARITY BONUS
 * Given the current top candidate, return a map of similarity scores (0–1)
 * for all players in the candidate pool. Players in the same "archetype cluster"
 * as the top candidate get a small probability boost, preventing their premature
 * elimination when we're actually converging on their archetype.
 */
export function computeSimilarityScores(
  topPlayerId: string,
  candidateIds: string[],
  players: Player[]
): Record<string, number> {
  const cache = getEmbeddingCache(players);
  const topVec = cache.get(topPlayerId);
  if (!topVec) return {};

  const scores: Record<string, number> = {};
  for (const id of candidateIds) {
    const vec = cache.get(id);
    if (vec) scores[id] = cosineSimilarity(topVec, vec);
  }
  return scores;
}
