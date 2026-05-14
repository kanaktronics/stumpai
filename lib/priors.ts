import { Player } from './types';

// Compute prior probability of a player being guessed.
// High-salience legends should have a massively higher prior than obscure players.
export function computePrior(player: Player): number {
  let score = 1.0; // Baseline

  // 1. Longevity & Volume
  if (player.matchesAbove150) score += 30;
  else if (player.matchesAbove100) score += 20;
  else if (player.matchesAbove50) score += 10;

  // 2. Batting Prowess
  if (player.runsAbove4000) score += 40;
  else if (player.runsAbove2000) score += 20;
  else if (player.runsAbove500) score += 5;
  if (player.centuries) score += 15;
  if (player.fifties) score += 5;

  // 3. Bowling Prowess
  if (player.wicketsAbove150) score += 40;
  else if (player.wicketsAbove100) score += 20;
  else if (player.wicketsAbove50) score += 5;

  // 4. Accolades
  if (player.orangeCap) score += 25;
  if (player.purpleCap) score += 25;
  if (player.potmAbove10) score += 30;
  else if (player.potmAbove3) score += 10;
  if (player.iplCaptain) score += 15;
  if (player.titles && player.titles > 2) score += 10;

  // 5. DNA Salience Boosts
  if (player.identityDNA) {
    score += ((player.identityDNA.fanbaseIntensity || 0) * 20);
    score += ((player.identityDNA.memeFactor || 0) * 15);
    score += ((player.identityDNA.captainAura || 0) * 10);
  }

  // 6. Hardcoded Legends (The 0.1% Elite)
  const LEGENDS = new Set(['ms-dhoni', 'virat-kohli', 'rohit-sharma', 'ab-devilliers', 'jasprit-bumrah', 'chris-gayle', 'lasith-malinga', 'suresh-raina']);
  if (LEGENDS.has(player.id)) {
    score *= 3.0;
  }

  return Math.max(0.1, score);
}

export function computeNormalizedPriors(players: Player[]): Record<string, number> {
  const priors: Record<string, number> = {};
  let sum = 0;
  
  for (const p of players) {
    priors[p.id] = computePrior(p);
    sum += priors[p.id];
  }
  
  for (const p of players) {
    priors[p.id] /= sum;
  }
  
  return priors;
}
