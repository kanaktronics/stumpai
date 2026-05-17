'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from '../page.module.css';
import RevealCard from '../../components/RevealCard';
import { Player } from '../../lib/types';

interface TurnResponse {
  turn_metadata: {
    question_index: number;
    active_pool_size: number;
    confidence_percentage: number;
    eliminated_count?: number;
    shannon_entropy_score?: number;
  };
  oracle_output: {
    question: string;
    flavor_text: string;
    contextual_hint?: string;
    next_question_id: string;
    is_stumped?: boolean;
  };
  inference_leaderboard: Array<{
    player_id: string;
    player_name: string;
    p_value: string;
    reason: string;
  }>;
  system_state: {
    trigger_final_guess: boolean;
    final_guess_payload: (Player & { reasoning?: string }) | null;
    is_stumped?: boolean;
  };
  updated_state: any;
}

interface Snapshot {
  turnData: TurnResponse;
  bayesState: any;
  currentQuestionId: string;
  history: Array<{ questionId: string; answer: string }>;
}

type GamePhase = 'intro' | 'playing' | 'reveal' | 'victory' | 'wrong';

async function callOracle(payload: {
  state?: any;
  history?: any[];
  questionId?: string;
  answer?: string;
}): Promise<TurnResponse> {
  const res = await fetch('/api/oracle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

function GameContent() {
  const [phase, setPhase]                         = useState<GamePhase>('intro');
  const [turnData, setTurnData]                   = useState<TurnResponse | null>(null);
  const [bayesState, setBayesState]               = useState<any>(null);
  const [history, setHistory]                     = useState<Array<{ questionId: string; answer: string }>>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<string>('');
  const [loading, setLoading]                     = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [undoStack, setUndoStack]                 = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack]                 = useState<Snapshot[]>([]);

  const currentSnapshot = useCallback((): Snapshot | null => {
    if (!turnData) return null;
    return { turnData, bayesState, currentQuestionId, history };
  }, [turnData, bayesState, currentQuestionId, history]);

  const applySnapshot = (snap: Snapshot) => {
    setTurnData(snap.turnData);
    setBayesState(snap.bayesState);
    setCurrentQuestionId(snap.currentQuestionId);
    setHistory(snap.history);
    setPhase('playing');
    setError(null);
  };

  const startGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHistory([]);
    setBayesState(null);
    setTurnData(null);
    setUndoStack([]);
    setRedoStack([]);
    try {
      const data = await callOracle({ history: [] });
      setTurnData(data);
      setBayesState(data.updated_state);
      setCurrentQuestionId(data.oracle_output.next_question_id);
      setPhase('playing');
    } catch (e: any) {
      setError(e.message);
      setPhase('intro');
    } finally {
      setLoading(false);
    }
  }, []);

  // AUTOSTART logic
  useEffect(() => {
    if (searchParams.get('autostart') === 'true' && phase === 'intro') {
      startGame();
    }
  }, [searchParams, phase, startGame]);

  const handleAnswer = useCallback(async (answer: string) => {
    if (loading || !turnData || !currentQuestionId) return;
    const snap = currentSnapshot();
    if (snap) { setUndoStack(prev => [...prev, snap]); setRedoStack([]); }
    setLoading(true);
    setError(null);
    const newHistory = [...history, { questionId: currentQuestionId, answer }];
    setHistory(newHistory);
    try {
      const data = await callOracle({ state: bayesState, history: newHistory, questionId: currentQuestionId, answer });
      setTurnData(data);
      setBayesState(data.updated_state);
      if (data.system_state.trigger_final_guess) { setPhase('reveal'); return; }
      if (data.system_state.is_stumped) { setPhase('wrong'); return; }
      setCurrentQuestionId(data.oracle_output.next_question_id);
    } catch (e: any) {
      setError(e.message);
      setHistory(history);
    } finally {
      setLoading(false);
    }
  }, [loading, turnData, currentQuestionId, history, bayesState, currentSnapshot]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || loading) return;
    const snap = currentSnapshot();
    if (snap) setRedoStack(prev => [...prev, snap]);
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    applySnapshot(prev);
  }, [undoStack, loading, currentSnapshot]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || loading) return;
    const snap = currentSnapshot();
    if (snap) setUndoStack(prev => [...prev, snap]);
    const next = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    applySnapshot(next);
  }, [redoStack, loading, currentSnapshot]);

  const handleRestart = useCallback(() => {
    setPhase('intro');
    setTurnData(null);
    setBayesState(null);
    setHistory([]);
    setCurrentQuestionId('');
    setUndoStack([]);
    setRedoStack([]);
    setError(null);
  }, []);

  const confidence  = turnData?.turn_metadata?.confidence_percentage ?? 0;
  const poolSize    = turnData?.turn_metadata?.active_pool_size ?? 0;
  const eliminated  = turnData?.turn_metadata?.eliminated_count ?? 0;
  const entropy     = turnData?.turn_metadata?.shannon_entropy_score ?? 0;
  const qIndex      = turnData?.turn_metadata?.question_index ?? 0;
  const leaderboard = turnData?.inference_leaderboard ?? [];
  const canUndo     = undoStack.length > 0 && !loading;
  const canRedo     = redoStack.length > 0 && !loading;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>🏏</span>
            <h1 className={styles.logoName}>Stump<span className={styles.logoAi}>.AI</span></h1>
          </a>
        </div>
        <nav className={styles.nav}>
          <a href="/" className={styles.navLink}>Home</a>
          <a href="/app" className={`${styles.navLink} ${styles.navLinkActive}`}>Play</a>
        </nav>
        <div className={styles.headerActions}>
          <button className={styles.loginBtn} onClick={handleRestart}>🔄 New Game</button>
        </div>
      </header>

      <div className={styles.badge}>⚡ Built for GDG Build with AI Hackathon</div>

      {/* INTRO */}
      {phase === 'intro' && (
        <section className={styles.hero}>
          <h2 className={styles.heroTitle}>Think of an IPL Player.<br /><span>I&apos;ll Guess Who.</span></h2>
          <p className={styles.heroDesc}>The Oracle uses Bayesian inference to identify any IPL player in ~8 questions. Think of someone and let&apos;s go.</p>
          <button className={styles.startBtn} onClick={startGame} disabled={loading} id="btn-start">
            {loading ? '⏳ Initializing Oracle...' : '🚀 Start Game'}
          </button>
          {error && <p className={styles.errorText}>⚠️ {error}</p>}
        </section>
      )}

      {/* LOADING */}
      {phase === 'playing' && !turnData && loading && (
        <section className={styles.hero}>
          <div className={styles.loadingSpinner}>⏳</div>
          <p className={styles.heroDesc}>Initializing Bayesian inference engine...</p>
        </section>
      )}

      {/* PLAYING */}
      {phase === 'playing' && turnData && (
        <section className={styles.gameContainer}>
          <div className={styles.questionCard}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${Math.min((qIndex / 8) * 100, 100)}%` }} />
            </div>
            <div className={styles.cardHeader}>
              <div className={styles.navArrows}>
                <button className={`${styles.arrowBtn} ${!canUndo ? styles.arrowDisabled : ''}`} onClick={handleUndo} disabled={!canUndo} title={canUndo ? `Undo (${undoStack.length} available)` : 'Nothing to undo'} id="btn-back">← Back</button>
                <div className={styles.qLabel}>🤖 Q{qIndex + 1} / 8</div>
                <button className={`${styles.arrowBtn} ${!canRedo ? styles.arrowDisabled : ''}`} onClick={handleRedo} disabled={!canRedo} title={canRedo ? `Redo (${redoStack.length} available)` : 'Nothing to redo'} id="btn-forward">Next →</button>
              </div>
              <div className={styles.totalGuessed}>Pool: <strong>{poolSize}</strong></div>
            </div>
            <div className={styles.cardBody}>
              {eliminated > 0 && <div className={styles.eliminatedBanner}>🛡️ {eliminated} candidates eliminated</div>}
              <div className={styles.qBubble}>
                <div className={styles.aiAvatar}>🧠</div>
                <div className={styles.qText}>{loading ? '⏳ Thinking...' : turnData.oracle_output.question}</div>
              </div>
              <div className={styles.actionsGrid}>
                <button className={`${styles.ansBtn} ${styles.btnYes}`} onClick={() => handleAnswer('yes')} disabled={loading} id="btn-yes"><span className={styles.btnIcon}>✔</span>Yes</button>
                <button className={`${styles.ansBtn} ${styles.btnNo}`} onClick={() => handleAnswer('no')} disabled={loading} id="btn-no"><span className={styles.btnIcon}>✖</span>No</button>
                <button className={`${styles.ansBtn} ${styles.btnMaybe}`} onClick={() => handleAnswer('dont-know')} disabled={loading} id="btn-dontknow"><span className={styles.btnIcon}>❓</span>Don&apos;t Know</button>
                <button className={`${styles.ansBtn} ${styles.btnProbYes}`} onClick={() => handleAnswer('probably')} disabled={loading} id="btn-probably"><span className={styles.btnIcon}>👍</span>Probably</button>
                <button className={`${styles.ansBtn} ${styles.btnProbNo}`} onClick={() => handleAnswer('probably-not')} disabled={loading} id="btn-probnot"><span className={styles.btnIcon}>👎</span>Prob. Not</button>
              </div>
              {(canUndo || canRedo) && <p className={styles.undoHint}>{canUndo && `← ${undoStack.length} to undo`}{canUndo && canRedo && '  ·  '}{canRedo && `${redoStack.length} to redo →`}</p>}
              {turnData.oracle_output.contextual_hint && <p className={styles.hintText}>💡 {turnData.oracle_output.contextual_hint}</p>}
              {error && <p className={styles.errorText}>⚠️ {error}</p>}
            </div>
          </div>

          <aside className={styles.statsPanel}>
            <div className={styles.poolSection}>
              <span className={styles.panelLabel}>Candidate Pool</span>
              <div className={styles.poolValue}>{poolSize}</div>
            </div>
            <div className={styles.confSection}>
              <div className={styles.confHeader}>
                <span className={styles.panelLabel}>Confidence Tensor</span>
                <span className={styles.confPct}>{confidence.toFixed(1)}%</span>
              </div>
              <div className={styles.confTrack}><div className={styles.confFill} style={{ width: `${Math.min(confidence, 100)}%` }} /></div>
              <p className={styles.flavorText}>{turnData.oracle_output.flavor_text.toUpperCase()}</p>
            </div>
            <div className={styles.gridSection}>
              <div className={styles.gridHeader}><span>⚡</span> LIVE INFERENCE GRID</div>
              <div className={styles.inferenceList}>
                {leaderboard.length === 0 ? (
                  <div className={styles.inferenceRow}><span className={styles.pMeta}>Initializing...</span></div>
                ) : leaderboard.slice(0, 3).map((c, i) => (
                  <div key={c.player_id} className={styles.inferenceRow}>
                    <div className={styles.rankBadge}>{i + 1}</div>
                    <div className={styles.pInfo}>
                      <span className={styles.pName}>{c.player_name}</span>
                      <span className={styles.pMeta}>{c.reason?.slice(0, 38)}...</span>
                    </div>
                    <div className={styles.pProb}>{(parseFloat(c.p_value) * 100).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.bottomStats}>
              <div className={styles.bStat}><span className={styles.bStatVal}>{poolSize}</span><span className={styles.bStatLabel}>Survivors</span></div>
              <div className={styles.bStat}><span className={styles.bStatVal}>{entropy > 0 ? entropy.toFixed(2) : '—'}</span><span className={styles.bStatLabel}>Entropy</span></div>
              <div className={styles.bStat}><span className={styles.bStatVal}>{qIndex}/8</span><span className={styles.bStatLabel}>Turn</span></div>
            </div>
            <p className={styles.panelHint}>Optimal convergence in ~{Math.max(0, 8 - qIndex)} more questions</p>
          </aside>
        </section>
      )}

      {/* REVEAL */}
      {phase === 'reveal' && turnData?.system_state.final_guess_payload && (
        <section className={styles.revealSection}>
          <div className={styles.revealBorder}><div className={styles.revealInner}>
            <RevealCard player={turnData.system_state.final_guess_payload} confidence={confidence} reasoning={(turnData.system_state.final_guess_payload as any).reasoning} onRestart={handleRestart} onCorrect={() => setPhase('victory')} onWrong={() => setPhase('wrong')} />
          </div></div>
        </section>
      )}

      {/* VICTORY */}
      {phase === 'victory' && (
        <section className={styles.hero} style={{ padding: '80px 20px' }}>
          <div style={{ fontSize: 80, marginBottom: 24 }}>🏆</div>
          <h2 className={styles.heroTitle}>Oracle <span>Triumphant!</span></h2>
          <p className={styles.heroDesc}>Identified in <strong>{history.length}</strong> questions with <strong>{confidence.toFixed(1)}%</strong> confidence.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32 }}>
            <button className={styles.startBtn} onClick={handleRestart}>🔄 Play Again</button>
          </div>
        </section>
      )}

      {/* WRONG */}
      {phase === 'wrong' && (
        <section className={styles.hero} style={{ padding: '80px 20px' }}>
          <div style={{ fontSize: 80, marginBottom: 24 }}>🤔</div>
          <h2 className={styles.heroTitle}>The Oracle <span>Learns...</span></h2>
          <p className={styles.heroDesc}>Every failure is a learning signal for the Bayesian engine.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 32 }}>
            <button className={styles.startBtn} onClick={handleRestart}>🔄 Try Again</button>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <div className={styles.footerCopyright}>© 2024 <strong>Stump.AI</strong>. Built for GDG Build with AI Hackathon</div>
        <div className={styles.footerLinks}>
          <a href="/">Home</a>
          <a href="https://gdg.community.dev/gdg-ranchi/" target="_blank" rel="noopener noreferrer">GDG Ranchi</a>
        </div>
        <div className={styles.footerBrand}>Stump.AI</div>
      </footer>
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.loadingSpinner}>⏳</div>
          <p className={styles.heroDesc}>Loading Oracle systems...</p>
        </section>
      </main>
    }>
      <GameContent />
    </Suspense>
  );
}
