import { initState, updateProbabilities, mctsSelectBestQuestion, getTopCandidates } from '../lib/engine';
import { PLAYERS } from '../lib/players_generated';
import { QUESTION_BANK } from '../lib/questions';
import { Player } from '../lib/types';

// Simple simulator
async function simulate() {
  console.log(`Starting simulation for ${PLAYERS.length} players...`);
  
  let successes = 0;
  let failures = 0;
  let totalQuestions = 0;
  const failureList: string[] = [];

  // Simulate for 100 random players for speed
  const targets = [...PLAYERS].sort(() => 0.5 - Math.random()).slice(0, 100);
  
  for (const target of targets) {
    let state = initState();
    let turnCount = 0;
    const maxTurns = 15;
    let guessed = false;
    // We need to keep track of asked questions
    const askedIds = new Set<string>();

    while (turnCount < maxTurns) {
      // 1. Get next question
      const availableQuestions = QUESTION_BANK.filter(q => !askedIds.has(q.id));
      const nextQObj = mctsSelectBestQuestion(state, availableQuestions as any[]);
      if (!nextQObj) break; // Bank exhausted
      const nextQ = nextQObj.question as any; // Cast for simplicity here
      askedIds.add(nextQ.id);

      // 2. Answer it truthfully based on target's data
      let answer: 'yes' | 'no' = 'no';
      if (nextQ.attrFn) {
        answer = nextQ.attrFn(target) ? 'yes' : 'no';
      } else {
        const val = target[nextQ.attr as keyof Player];
        answer = Boolean(val) ? 'yes' : 'no';
      }

      // 3. Update state
      state = updateProbabilities(state, nextQ.attr, answer, nextQ.id);
      turnCount++;

      // 4. Check if confidence is high enough to guess
      const top = getTopCandidates(state, 1)[0];
      if (top && top.p_value > 0.65) {
        if (top.player.id === target.id) {
          successes++;
          totalQuestions += turnCount;
          guessed = true;
        } else {
          failures++;
          failureList.push(`${target.name} (Guessed ${top.player.name} at conf ${Math.round(top.p_value*100)}% after ${turnCount} turns)`);
        }
        break;
      }
      
      // Stop if effectively one candidate dominates (>95% probability)
      const topCandidates = getTopCandidates(state, 1);
      if (topCandidates.length > 0 && topCandidates[0].p_value > 0.95) {
          const topPlayer = topCandidates[0].player;
          if (topPlayer.id === target.id) {
              successes++;
              totalQuestions += turnCount;
              guessed = true;
          } else {
              failures++;
              failureList.push(`${target.name} (Guessed ${topPlayer.name} implicitly)`);
          }
          break;
      }
    }

    if (!guessed && turnCount >= maxTurns) {
        // Forced guess at end
        const top = getTopCandidates(state, 1)[0];
        if (top && top.player.id === target.id) {
            successes++;
            totalQuestions += turnCount;
        } else {
            failures++;
            failureList.push(`${target.name} (Timeout - Top guess was ${top?.player?.name})`);
        }
    }
  }

  console.log('──────────────────────────────────────────────────');
  console.log(`BENCHMARK RESULTS (Sample size: ${targets.length})`);
  console.log(`Success Rate: ${((successes / targets.length) * 100).toFixed(1)}%`);
  console.log(`Average Questions to Solve: ${(totalQuestions / successes).toFixed(1)}`);
  console.log(`Failures: ${failures}`);
  if (failures > 0) {
      console.log('Failure Log:');
      failureList.forEach(f => console.log(`  - ${f}`));
  }
}

simulate();
