/**
 * Offline benchmark for the inference engine.
 *
 * Plays one full game against every player in the dataset, answering every
 * question truthfully from the player's own data, and applies the same rules
 * as app/api/oracle/route.ts:
 *   - questions come from the phase's bank, minus ones already asked
 *   - the next question is the one with the highest information gain
 *   - the engine guesses once confidence >= 88% or one candidate is left
 *   - history is capped at 15 questions; at the cap it guesses its top candidate
 *
 * What this does NOT include: the Gemini-written late-game questions and the
 * Gemini reranker. So it measures the deterministic core on its own.
 *
 * Run: npx tsx scripts/benchmark-engine.ts
 */
import { initState, updateProbabilities, mctsSelectBestQuestion, getTopConfidence, getTopCandidates } from '../lib/engine';
import { PLAYERS } from '../lib/players';
import { QUESTION_BANK, getPhaseQuestions } from '../lib/questions';
import type { Player } from '../lib/types';

// The question selector adds a little random jitter to break ties.
// Seed it so runs are reproducible.
let seed = 42;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const MAX_QUESTIONS = 15;
const truth = (q: (typeof QUESTION_BANK)[number], p: Player) =>
  q.attrFn ? q.attrFn(p) : !!(p as unknown as Record<string, unknown>)[q.attr ?? 'id'];

type Result = { name: string; matches: number; correct: boolean; questions: number; guessedAs: string; reason: 'confident' | 'pool' | 'exhausted' | 'cap' }
const results: Result[] = [];
const started = Date.now();

for (const target of PLAYERS) {
  let state = initState();
  const asked = new Set<string>();
  let reason: Result['reason'] = 'cap';

  while (asked.size < MAX_QUESTIONS) {
    const options = getPhaseQuestions(state.phase)
      .filter((q) => !asked.has(q.id))
      .map((q) => ({ id: q.id, attr: (p: Player) => truth(q, p), weight: q.weight ?? 5 }));
    const pick = mctsSelectBestQuestion(state, options);
    if (!pick) { reason = 'exhausted'; break; }

    const q = QUESTION_BANK.find((b) => b.id === pick.question.id)!;
    asked.add(q.id);
    const answer = truth(q, target) ? 'yes' : 'no';
    const resolver = q.attrFn ?? (q.attr as string);
    state = updateProbabilities(state, q.id, answer, resolver);

    if (getTopConfidence(state) >= 88) { reason = 'confident'; break; }
    if (state.activePool.length <= 1) { reason = 'pool'; break; }
  }

  const top = getTopCandidates(state, 1)[0]?.player;
  results.push({ name: target.name, matches: target.matches ?? 0, correct: top?.id === target.id, questions: asked.size, guessedAs: top?.name ?? '-', reason });
}

const n = results.length;
const pct = (k: number, of = n) => ((k / of) * 100).toFixed(1) + '%';
const count = (f: (r: Result) => boolean, rs = results) => rs.filter(f).length;
const qs = results.map((r) => r.questions).sort((a, b) => a - b);
const at = (p: number) => qs[Math.min(n - 1, Math.floor(p * n))];

// How many players can the 44 bank questions tell apart at all?
const signatures = new Map<string, number>();
for (const p of PLAYERS) {
  const sig = QUESTION_BANK.map((q) => (truth(q, p) ? '1' : '0')).join('');
  signatures.set(sig, (signatures.get(sig) ?? 0) + 1);
}
const uniquelyIdentifiable = [...signatures.values()].filter((c) => c === 1).length;

console.log(`players                         ${n}`);
console.log(`bank questions                  ${QUESTION_BANK.length}`);
console.log(`players with a unique answer set ${uniquelyIdentifiable} (${pct(uniquelyIdentifiable)})`);
console.log(`correct final guess             ${count((r) => r.correct)} (${pct(count((r) => r.correct))})`);
console.log(`stopped: confident ${pct(count((r) => r.reason === 'confident'))} · one left ${pct(count((r) => r.reason === 'pool'))} · out of useful questions ${pct(count((r) => r.reason === 'exhausted'))} · 15-question cap ${pct(count((r) => r.reason === 'cap'))}`);
const conf = results.filter((r) => r.reason === 'confident');
console.log(`confident but wrong             ${count((r) => !r.correct, conf)} of ${conf.length} (${pct(count((r) => !r.correct, conf), conf.length)})`);
console.log(`questions  mean ${(qs.reduce((a, b) => a + b, 0) / n).toFixed(1)}  median ${at(0.5)}  p90 ${at(0.9)}`);

const byFame = [...results].sort((a, b) => b.matches - a.matches);
for (const k of [25, 100]) {
  const top = byFame.slice(0, k);
  const ok = top.filter((r) => r.correct);
  const meanQ = ok.reduce((a, r) => a + r.questions, 0) / Math.max(1, ok.length);
  console.log(`top ${String(k).padEnd(3)} by IPL matches   correct ${pct(ok.length, k)}  mean questions when correct ${meanQ.toFixed(1)}`);
}
console.log(`ran in ${((Date.now() - started) / 1000).toFixed(1)}s`);
