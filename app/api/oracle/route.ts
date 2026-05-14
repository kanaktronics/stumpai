import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  BayesianState,
  initState,
  updateProbabilities,
  computeEntropy,
  getTopCandidates,
  getTopConfidence,
  getConfidenceInterpretation,
  mctsSelectBestQuestion,
  SelectableQuestion,
} from '@/lib/engine';
import { QUESTION_BANK, getPhaseQuestions } from '@/lib/questions';
import { Player, Answer } from '@/lib/types';
import { PLAYERS } from '@/lib/players';

const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const gemini = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/* ─── NLG: Gemini flavour-wraps the Bayesian question ────────────────────── */
async function generateLoreQuestion(
  rawQuestion: string,
  hint: string,
  topCandidates: { player: Player; p_value: number }[],
  questionIndex: number
): Promise<{ question: string; hint: string }> {
  const candidateCtx = topCandidates
    .map(c => `${c.player.name} (${(c.p_value * 100).toFixed(1)}%)`)
    .join(', ');

  const prompt = `You are the IPL Oracle — a legendary analyst. 
Based on the current suspects: ${candidateCtx},
CREATE a unique, lore-rich YES/NO question that targets this concept: "${rawQuestion}".

Do NOT just rephrase. SYNTHESIZE a question that feels like it was handwritten for this specific duel. 
If the concept is "wicketkeeper", you might ask: "Does he stand behind the stumps, watching the game like a hawk for every edge?"
If the concept is "IPL Captain", you might ask: "Has he carried the weight of leadership for an IPL franchise?"

Keep the YES/NO meaning identical to "${rawQuestion}".
Question #${questionIndex + 1}

Respond ONLY with valid JSON: {"question":"<created question>","hint":"${hint.replace(/"/g, "'")}"}`;

  try {
    const result = await gemini.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
    });
    const text = result.response.text().trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    if (parsed.question) return { question: parsed.question, hint: parsed.hint ?? hint };
  } catch { /* fall through to raw */ }

  return { question: rawQuestion, hint };
}

/* ─── NLG: Gemini makes final guess from Bayesian top candidate ──────────── */
async function generateFinalGuess(
  topPlayer: Player,
  confidence: number,
  history: Array<{ question: string; answer: string }>
): Promise<{ reasoning: string; famousFor: string }> {
  const qaSummary = history.map((h, i) => `Q${i + 1}: ${h.question} → ${h.answer}`).join('\n');

  const prompt = `You are the IPL Oracle. Based on these Q&A answers, craft a dramatic 1-sentence deduction explaining why the answer is ${topPlayer.name}.

Evidence:
${qaSummary}

Player known for: ${topPlayer.famousFor}
Confidence: ${(confidence).toFixed(1)}%

Respond ONLY with valid JSON: {"reasoning":"<1 dramatic sentence>","famousFor":"${topPlayer.famousFor.replace(/"/g, "'")}"}`;

  try {
    const result = await gemini.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 200 },
    });
    const text = result.response.text().trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    if (parsed.reasoning) return { reasoning: parsed.reasoning, famousFor: parsed.famousFor ?? topPlayer.famousFor };
  } catch { /* fall through */ }

  return { reasoning: `The evidence converges unmistakably on ${topPlayer.name}.`, famousFor: topPlayer.famousFor };
}

/* ─── SEMANTIC RERANKER: LLM re-scores top-N candidates against full Q&A history ─── */
async function semanticRerank(
  candidates: { player: Player; p_value: number }[],
  history: Array<{ question: string; answer: string }>
): Promise<Record<string, number>> {
  const qaSummary = history.map((h, i) => `Q${i + 1}: ${h.question} → ${h.answer.toUpperCase()}`).join('\n');
  const candidateProfiles = candidates.map(c => ({
    name: c.player.name,
    id: c.player.id,
    aura: c.player.auraEmbedding ?? {},
    tags: (c.player.identityTags ?? []).slice(0, 4).join(', '),
    era: c.player.era,
    role: c.player.role,
    teams: c.player.teams.join(', '),
  }));

  const prompt = `You are the IPL Oracle — a legendary analyst with encyclopedic cricket knowledge.

Q&A Evidence from the game:
${qaSummary}

Candidate players remaining:
${candidateProfiles.map((c, i) => {
  const aura = c.aura as unknown as Record<string, number>;
  return `${i + 1}. ${c.name} | Teams: ${c.teams} | Era: ${c.era} | Role: ${c.role} | Tags: ${c.tags} | Aura: composed=${aura.composed ?? '?'}, explosive=${aura.explosive ?? '?'}`;
}).join('\n')}

For each candidate, give a semantic match score (0-100). Rigorously enforce negative constraints.
Respond with ONLY valid JSON array: [{"id":"<player_id>","score":<0-100>}, ...]`;

  try {
    const result = await gemini.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
    });
    const text = result.response.text().trim().replace(/```json|```/g, '').trim();
    const parsed: { id: string; score: number }[] = JSON.parse(text);
    return Object.fromEntries(parsed.map(p => [p.id, p.score / 100]));
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { state: rawState, history: rawHistory = [], questionId, answer } = body;

    let state: BayesianState = rawState ?? initState();
    const prevActiveCount = (state.activePool ?? []).length;

    // Apply Bayesian update for this answer (skip on first call — no questionId yet)
    if (questionId && answer) {
      // Look up the actual question to get its attrFn or attr
      const questionDef = QUESTION_BANK.find(q => q.id === questionId);
      const attrResolver = questionDef?.attrFn
        ?? (questionDef?.attr
          ? (p: Player) => !!(p as any)[questionDef.attr]
          : null);

      if (attrResolver) {
        state = updateProbabilities(state, questionId, answer as Answer, attrResolver);
      }
    }

    // Sync history
    const askedIds = new Set<string>();
    for (const h of (rawHistory as any[])) {
      if (h.questionId) askedIds.add(h.questionId);
    }
    if (questionId) askedIds.add(questionId);

    const eliminatedThisTurn = prevActiveCount - (state.activePool?.length ?? 0);

    // ── 3. Check for early termination (STRICT PDF RULES) ──────────
    const conf = getTopConfidence(state);
    
    // Suggested Cinematic Logic
    let interpretation = "BROAD SPECTRUM ANALYSIS...";
    if (conf >= 88) interpretation = "CONVERGENCE ACHIEVED";
    else if (conf >= 70) interpretation = "ORACLE NEARING CONVERGENCE...";
    else if (conf >= 40) interpretation = "DEEP NEURAL SCANNING...";
    else interpretation = "BROAD SPECTRUM ANALYSIS...";

    // PDF Rule: ≤ 12 total, but Engine Loop says "strict maximum of 8 questions"
    const MAX_QUESTIONS  = 8; 
    const questionsMaxed = rawHistory.length >= MAX_QUESTIONS;
    
    const poolExhausted   = (state.activePool?.length ?? 0) <= 1;

    // ── 4. DECISION ENGINE (Cinematic Hardening) ─────────────────────
    const canGuess = (state.activePool?.length ?? 0) > 0;
    
    // Only guess early if confidence is massive (>= 88%)
    const canEarlyGuess = !questionsMaxed && conf >= 88;
    
    // At max questions, guess if we have reasonable confidence (>= 70%)
    const canMaxGuess = questionsMaxed && conf >= 70;
    
    const shouldGuess = canGuess && (canEarlyGuess || canMaxGuess || poolExhausted);

    // CINEMATIC: If we reach turn 8 but confidence is low, we REFUSE to guess blindly
    const refuseToGuess = questionsMaxed && canGuess && !shouldGuess;

    // Handle Refusal
    if (refuseToGuess) {
      return NextResponse.json({
        turn_metadata: { 
            question_index: rawHistory.length, 
            active_pool_size: state.activePool.length, 
            confidence_percentage: conf,
            eliminated_count: eliminatedThisTurn 
        },
        oracle_output: { 
            question: "My vision is clouded.", 
            flavor_text: "THE ORACLE REFUSES TO GUESS BLINDLY.", 
            is_stumped: true 
        },
        inference_leaderboard: [],
        system_state: { trigger_final_guess: false, final_guess_payload: null, is_stumped: true },
        updated_state: state
      });
    }

    const topCandidates = getTopCandidates(state, 3);


    // If we've hit a dead end (0 survivors) but aren't forced to guess yet,
    // we return the STUMPED state early.
    if (state.activePool.length === 0 && !shouldGuess) {
      return NextResponse.json({
        turn_metadata: { 
            question_index: rawHistory.length, 
            active_pool_size: 0, 
            confidence_percentage: 0,
            eliminated_count: eliminatedThisTurn 
        },
        oracle_output: { question: "I'm stumped!", flavor_text: interpretation, is_stumped: true },
        inference_leaderboard: [],
        system_state: { trigger_final_guess: false, final_guess_payload: null, is_stumped: true },
        updated_state: state
      });
    }

    // ── 5. GUESS LOGIC (Prioritized for final turns) ─────────────────
    if (shouldGuess) {
      // PDF REQ: "AI Reasoning" - Use Gemini to rerank top candidates against history
      const rerankedScores = await semanticRerank(topCandidates, rawHistory);
      
      // Blend reranked scores into candidates
      const finalCandidates = topCandidates.map(c => {
        const rerankedP = rerankedScores[c.player.id];
        return {
          ...c,
          p_value: rerankedP !== undefined ? (c.p_value * 0.7 + rerankedP * 0.3) : c.p_value
        };
      }).sort((a, b) => b.p_value - a.p_value);

      const topPlayer = finalCandidates[0].player;
      const finalConf = finalCandidates[0].p_value * 100;
      const { reasoning, famousFor } = await generateFinalGuess(topPlayer, finalConf, rawHistory);
      
      const payload = { 
        ...topPlayer, 
        reasoning, 
        famousFor, 
        confidence: finalConf / 100,
        is_stumped: state.activePool.length === 0 
      };

      return NextResponse.json({
        turn_metadata: { 
            question_index: rawHistory.length, 
            active_pool_size: state.activePool.length, 
            confidence_percentage: finalConf,
            eliminated_count: eliminatedThisTurn
        },
        oracle_output: { question: '', flavor_text: interpretation },
        inference_leaderboard: finalCandidates.map(c => ({ player_id: c.player.id, player_name: c.player.name, p_value: c.p_value.toFixed(4), reason: c.player.famousFor })),
        system_state: { trigger_final_guess: true, final_guess_payload: payload },
        updated_state: state
      });
    }

    // ── 5. NEXT QUESTION SELECTION ─────────────────────────────────
    const phaseBank = getPhaseQuestions(state.phase);
    const options: SelectableQuestion[] = phaseBank
      .filter(q => !askedIds.has(q.id))
      .map(q => ({ id: q.id, attr: q.attrFn ?? ((p: Player) => !!(p as unknown as Record<string, unknown>)[q.attr]), weight: q.weight ?? 5 }));

    const mctsResult = mctsSelectBestQuestion(state, options, 4);
    const bankQ = QUESTION_BANK.find(q => q.id === mctsResult?.question?.id) ?? QUESTION_BANK[0];

    const { question: loreQuestion, hint: loreHint } = await generateLoreQuestion(
      bankQ.text, bankQ.hint, topCandidates, rawHistory.length
    );

    return NextResponse.json({
      turn_metadata: { 
        question_index: rawHistory.length, 
        active_pool_size: state.activePool?.length ?? 0,
        shannon_entropy_score: parseFloat(computeEntropy(state.probabilities).toFixed(4)),
        confidence_percentage: parseFloat(conf.toFixed(2)),
        eliminated_count: eliminatedThisTurn,
      },
      oracle_output: { 
        question: loreQuestion, 
        contextual_hint: loreHint, 
        next_question_id: bankQ.id, 
        flavor_text: interpretation 
      },
      inference_leaderboard: topCandidates.map(c => ({ 
        player_id: c.player.id, 
        player_name: c.player.name, 
        p_value: c.p_value.toFixed(4), 
        reason: c.player.famousFor 
      })),
      system_state: { trigger_final_guess: false, final_guess_payload: null },
      updated_state: state,
    });

  } catch (err) {
    console.error('[Oracle API] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
