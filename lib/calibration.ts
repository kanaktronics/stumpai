import { Player } from './types';

// LAYER 4: Data Completeness Reliability
// Sparse metadata creates false-positive certainty. We penalize players lacking robust profiles.
export function computeReliability(player: Player): number {
  let known = 0;
  const expected = 12; // Base features expected for a confident guess
  
  if (player.role && player.role !== 'unknown' as any) known += 2;
  if (player.battingStyle) known += 1;
  if (player.country) known += 1;
  if ((player.matches ?? 0) > 5) known += 2; // Statistical reality
  if (player.identityDNA) known += 4; // Has rich behavioral embeddings
  if (player.identityTags && player.identityTags.length > 0) known += 1;
  if (player.cluster) known += 1;

  return Math.min(1.0, known / expected);
}

// LAYER 6: Confidence Calibration
export function calibrateConfidence(
  topProbs: number[],
  entropy: number,
  poolSize: number,
  reliability: number
): { confidence: number; isSafeToGuess: boolean; reason: string } {
  // 6. CONFIDENCE IS LYING (True Confidence Formula)
  // confidence = top1Prob / (top1Prob + top2Prob + top3Prob)
  const top1 = topProbs[0] || 0;
  const top2 = topProbs[1] || 0;
  const top3 = topProbs[2] || 0;
  
  const trueCertainty = (top1 + top2 + top3) > 0 ? (top1 / (top1 + top2 + top3)) : 0;
  let calibrated = trueCertainty;
  
  // Penalty for high entropy relative to pool size (Probability mass is scattered)
  const maxEntropy = Math.log2(Math.max(2, poolSize));
  const entropyRatio = entropy / maxEntropy;
  
  if (entropyRatio > 0.6) {
    calibrated *= 0.5; // Severe penalty if graph is noisy
  } else if (entropyRatio > 0.4) {
    calibrated *= 0.8;
  }
  
  // The margin is implicitly handled by the trueCertainty formula!
  const margin = topProbs.length > 1 ? (top1 - top2) : 1.0;

  // Multiply by reliability to damp sparse players
  calibrated *= reliability;

  // Final sanity cap
  calibrated = Math.min(0.999, Math.max(0.01, calibrated));

  const isSafe = calibrated > 0.85;
  
  let reason = "Evidence converging securely.";
  if (!isSafe) {
     if (entropyRatio > 0.6) reason = "High uncertainty: Probability mass is heavily scattered.";
     else if (margin < 0.15) reason = "Collision: Top candidates are mathematically indistinguishable.";
     else if (reliability < 0.8) reason = "Warning: Leading candidate lacks robust metadata.";
     else reason = "Insufficient evidence to guess securely.";
  }

  return {
    confidence: calibrated,
    isSafeToGuess: isSafe,
    reason
  };
}
