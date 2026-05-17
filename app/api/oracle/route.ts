import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
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
import { checkRateLimit } from '@/lib/ratelimit';

const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const gemini = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-pro',
  systemInstruction: 'You are the IPL Oracle, a legendary cricket analyst with encyclopedic knowledge of IPL stats, player lore, and specific match moments.'
});

/** Abort a promise after `ms` milliseconds. Falls through to null on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms))
  ]);
}

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
    const result = await withTimeout(
      gemini.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.7, 
          maxOutputTokens: 200,
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              question: { type: SchemaType.STRING },
              hint: { type: SchemaType.STRING }
            },
            required: ["question", "hint"]
          }
        },
      }),
      5000 // 5s timeout — fall back to raw question if Gemini is slow
    );
    if (result) {
      const text = result.response.text();
      const parsed = JSON.parse(text);
      if (parsed.question) return { question: parsed.question, hint: parsed.hint ?? hint };
    }
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
      generationConfig: { 
        temperature: 0.5, 
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            reasoning: { type: SchemaType.STRING },
            famousFor: { type: SchemaType.STRING }
          },
          required: ["reasoning", "famousFor"]
        }
      },
    });
    const text = result.response.text();
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
      generationConfig: { 
        temperature: 0.3, 
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING },
              score: { type: SchemaType.NUMBER }
            },
            required: ["id", "score"]
          }
        }
      },
    });
    const text = result.response.text();
    const parsed: { id: string; score: number }[] = JSON.parse(text);
    return Object.fromEntries(parsed.map(p => [p.id, p.score / 100]));
  } catch {
    return {};
  }
}

async function generateDynamicQuestion(
  topCandidates: { player: Player; p_value: number }[]
): Promise<{ question: string; hint: string; appliesTo: Record<string, boolean> } | null> {
  const candidateProfiles = topCandidates.map(c => {
    return `- ${c.player.name} (${c.player.id}): Teams: ${c.player.teams.join(', ')} | Role: ${c.player.role} | Tags: ${(c.player.identityTags || []).slice(0, 3).join(', ')}`;
  });

  const prompt = `You are the IPL Oracle. We are in the final stages of a player guessing game.
The remaining candidates are:
${candidateProfiles.join('\n')}

INVENT a highly specific, lore-accurate YES/NO question that applies to exactly SOME of these players, but NOT ALL. 
The question should focus on unique traits, signature moments, specific teams they captained, or rare stats.
The goal is to split the candidates perfectly.

Return ONLY a valid JSON object with this exact structure (no markdown, just JSON):
{
  "question": "<the YES/NO question>",
  "hint": "<a short mysterious hint>",
  "appliesTo": [
    { "playerId": "<player_id_1>", "applies": true },
    { "playerId": "<player_id_2>", "applies": false }
  ]
}`;

  try {
    const result = await gemini.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.7, 
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            question: { type: SchemaType.STRING },
            hint: { type: SchemaType.STRING },
            appliesTo: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  playerId: { type: SchemaType.STRING },
                  applies: { type: SchemaType.BOOLEAN }
                },
                required: ["playerId", "applies"]
              }
            }
          },
          required: ["question", "hint", "appliesTo"]
        }
      },
    });
    const text = result.response.text();
    const parsed = JSON.parse(text);
    
    // Convert array back to dictionary
    const appliesToMap: Record<string, boolean> = {};
    for (const item of parsed.appliesTo) {
      appliesToMap[item.playerId] = item.applies;
    }
    
    return { ...parsed, appliesTo: appliesToMap };
  } catch (err) {
    console.error('Dynamic Question Error:', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── RATE LIMITING ──────────────────────────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';

    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. The Oracle needs a moment to recover its vision.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': '20',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
            'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // ── INPUT VALIDATION ─────────────────────────────────────────────
    const rawBody = await req.text();
    if (rawBody.length > 200_000) { // 200KB max body
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }

    let body: any;
    try { body = JSON.parse(rawBody); } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { state: rawState, history: rawHistory = [], questionId, answer } = body;

    // Validate answer field
    const VALID_ANSWERS = ['yes', 'no', 'dont-know', 'probably', 'probably-not'];
    if (answer && !VALID_ANSWERS.includes(answer)) {
      return NextResponse.json({ error: 'Invalid answer value.' }, { status: 400 });
    }

    // Validate questionId is a known question or a dynamic question
    if (questionId && !questionId.startsWith('dyn_') && !QUESTION_BANK.find(q => q.id === questionId)) {
      return NextResponse.json({ error: 'Unknown questionId.' }, { status: 400 });
    }

    // Prevent state injection: cap history length
    if (!Array.isArray(rawHistory) || rawHistory.length > 15) {
      return NextResponse.json({ error: 'Invalid history.' }, { status: 400 });
    }

    let state: BayesianState = rawState ?? initState();
    const prevActiveCount = (state.activePool ?? []).length;

    // Apply Bayesian update for this answer (skip on first call — no questionId yet)
    if (questionId && answer) {
      // Look up the actual question to get its attrFn or attr
      let attrResolver: ((p: Player) => boolean) | null = null;
      if (questionId.startsWith('dyn_')) {
        const dynMap = state.dynamicQuestions?.[questionId];
        if (dynMap) {
          attrResolver = (p: Player) => dynMap[p.id] === true;
        }
      } else {
        const questionDef = QUESTION_BANK.find(q => q.id === questionId);
        attrResolver = questionDef?.attrFn
          ?? (questionDef?.attr
            ? (p: Player) => !!(p as any)[questionDef.attr]
            : null);
      }

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
    const currentEntropy = computeEntropy(state.probabilities);
    const top10 = getTopCandidates(state, 10);
    
    console.log('\n======================================================');
    console.log(`[ORACLE DEBUG] Turn ${rawHistory.length + 1} | Answer: ${answer ?? 'START'}`);
    console.log(`- Active Pool Size: ${state.activePool?.length ?? 0}`);
    console.log(`- Eliminated This Turn: ${eliminatedThisTurn}`);
    console.log(`- Shannon Entropy: ${currentEntropy.toFixed(4)} (Max ~9.6)`);
    console.log(`- Top Confidence: ${conf.toFixed(2)}%`);
    console.log(`- Top 10 Candidates:`);
    top10.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.player.name.padEnd(20)} | P: ${(c.p_value * 100).toFixed(3)}%`);
    });
    console.log('======================================================\n');
    
    // Suggested Cinematic Logic
    let interpretation = "BROAD SPECTRUM ANALYSIS...";
    if (conf >= 88) interpretation = "CONVERGENCE ACHIEVED";
    else if (conf >= 70) interpretation = "ORACLE NEARING CONVERGENCE...";
    else if (conf >= 40) interpretation = "DEEP NEURAL SCANNING...";
    else interpretation = "BROAD SPECTRUM ANALYSIS...";

    // PDF Rule: ≤ 12 total questions
    const MAX_QUESTIONS  = 12; 
    const questionsMaxed = rawHistory.length >= MAX_QUESTIONS;
    
    const poolExhausted   = (state.activePool?.length ?? 0) <= 1;

    // ── 4. DECISION ENGINE (Cinematic Hardening) ─────────────────────
    const canGuess = (state.activePool?.length ?? 0) > 0;
    
    // Only guess early if confidence is massive (>= 88%)
    const canEarlyGuess = !questionsMaxed && conf >= 88;
    
    // At max questions, guess if we have reasonable confidence (>= 70%)
    const canMaxGuess = questionsMaxed && conf >= 70;
    
    const shouldGuess = canGuess && (canEarlyGuess || canMaxGuess || poolExhausted);

    // CINEMATIC: If we are deep into the game (turn 8+) but confidence is low, 
    // the Oracle refuses to guess blindly and DEMANDS more information.
    if (rawHistory.length >= 8 && !shouldGuess) {
      interpretation = "THE ORACLE REFUSES TO GUESS BLINDLY. I MUST DIG DEEPER.";
    }

    const topCandidates = getTopCandidates(state, 3);

    // If we've hit a dead end (0 survivors) or reached absolute max questions without confidence,
    // we return the STUMPED state early.
    if ((state.activePool.length === 0 || (questionsMaxed && !shouldGuess)) && !shouldGuess) {
      return NextResponse.json({
        turn_metadata: { 
            question_index: rawHistory.length, 
            active_pool_size: state.activePool.length, 
            confidence_percentage: conf,
            eliminated_count: eliminatedThisTurn 
        },
        oracle_output: { question: "The vision fades completely.", flavor_text: "THE ORACLE IS TRULY STUMPED.", is_stumped: true },
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
      
      // Calculate final competitive confidence AFTER reranking to match engine logic
      const p1 = finalCandidates[0]?.p_value || 0;
      const p2 = finalCandidates[1]?.p_value || 0;
      const p3 = finalCandidates[2]?.p_value || 0;
      const finalConf = p1 > 0.0001 ? (p1 / (p1 + p2 + p3)) * 100 : 0;
      
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
    let selectedQuestionId = '';
    let loreQuestion = '';
    let loreHint = '';

    // If we have <= 10 candidates, unleash the Hybrid Neuro-Symbolic Engine to invent a perfect dynamic question
    if (state.activePool.length <= 10 && state.activePool.length > 1) {
      const dynResult = await generateDynamicQuestion(topCandidates.slice(0, 10));
      if (dynResult && dynResult.question && dynResult.appliesTo) {
        selectedQuestionId = 'dyn_' + Date.now() + Math.floor(Math.random() * 1000);
        loreQuestion = dynResult.question;
        loreHint = dynResult.hint || '';
        
        if (!state.dynamicQuestions) state.dynamicQuestions = {};
        state.dynamicQuestions[selectedQuestionId] = dynResult.appliesTo;
        console.log(`[ORACLE DYNAMIC] Invented Q: "${loreQuestion}"`);
      }
    }

    // Fallback to standard MCTS selection
    if (!selectedQuestionId) {
      const phaseBank = getPhaseQuestions(state.phase);
      const options: SelectableQuestion[] = phaseBank
        .filter(q => !askedIds.has(q.id))
        .map(q => ({ id: q.id, attr: q.attrFn ?? ((p: Player) => !!(p as unknown as Record<string, unknown>)[q.attr]), weight: q.weight ?? 5 }));

      const mctsResult = mctsSelectBestQuestion(state, options);
      const bankQ = QUESTION_BANK.find(q => q.id === mctsResult?.question?.id) ?? QUESTION_BANK[0];

      console.log(`[ORACLE IG] Selected Q: "${bankQ.id}" | IG Gain: ${mctsResult?.gain?.toFixed(4)} | pYes: ${((mctsResult?.debugInfo?.pYes ?? 0) * 100).toFixed(1)}% | SplitQuality: ${(mctsResult?.debugInfo?.splitQuality ?? 0).toFixed(3)}`);

      const res = await generateLoreQuestion(bankQ.text, bankQ.hint, topCandidates, rawHistory.length);
      loreQuestion = res.question;
      loreHint = res.hint;
      selectedQuestionId = bankQ.id;
    }

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
        next_question_id: selectedQuestionId, 
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
