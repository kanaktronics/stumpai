'use client';
import styles from './QuestionCard.module.css';

interface EliminationPct {
  expected: number;
  if_yes: number;
  if_no: number;
}

interface Props {
  question: string;
  hint: string;
  questionIndex: number;
  activePoolSize: number;
  phase?: 1 | 2 | 3 | 4;
  eliminationPct?: EliminationPct;
  onAnswer: (answer: 'yes' | 'no' | 'maybe' | 'dont-know') => void;
  loading: boolean;
}

const PHASE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Broad Scan',       color: '#60A5FA' },
  2: { label: 'Identity Lock',    color: '#A78BFA' },
  3: { label: 'Final Duel',       color: '#F59E0B' },
  4: { label: 'Ambiguity Reset',  color: '#F472B6' },
};

export default function QuestionCard({
  question, hint, questionIndex, activePoolSize,
  phase = 1, eliminationPct, onAnswer, loading
}: Props) {
  const phaseInfo = PHASE_LABELS[phase] || PHASE_LABELS[1];
  const elimPct   = eliminationPct?.expected ?? 0;

  // Colour the elimination bar: red if >50%, amber if >30%, green-ish below
  const barColor = elimPct >= 50 ? '#EF4444' : elimPct >= 30 ? '#F59E0B' : '#10B981';

  return (
    <div className={`${styles.card} ${loading ? styles.cardLoading : ''}`}>
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Synthesizing Priors...</span>
        </div>
      )}
      {/* ── Top row: question badge + phase tag ── */}
      <div className={styles.topRow}>
        <div className={styles.badge}>Q{questionIndex + 1} / 8</div>
        <div className={styles.phaseTag} style={{ color: phaseInfo.color, borderColor: `${phaseInfo.color}40` }}>
          <span className={styles.phaseDot} style={{ background: phaseInfo.color }} />
          Phase {phase} · {phaseInfo.label}
        </div>
      </div>

      {/* ── Information Gain visualization ── */}
      {eliminationPct && (
        <div className={styles.igBar}>
          <div className={styles.igHeader}>
            <span className={styles.igLabel}>⚡ Information Gain</span>
            <span className={styles.igPct} style={{ color: barColor }}>
              ~{elimPct}% eliminated on YES/NO
            </span>
          </div>
          <div className={styles.igTrack}>
            <div
              className={styles.igFill}
              style={{ width: `${Math.min(elimPct, 100)}%`, background: barColor }}
            />
          </div>
          <div className={styles.igSplit}>
            <span>YES removes <b style={{ color: '#10B981' }}>{eliminationPct.if_yes}%</b></span>
            <span style={{ color: '#94A3B8' }}>·</span>
            <span>NO removes <b style={{ color: '#EF4444' }}>{eliminationPct.if_no}%</b></span>
            <span style={{ color: '#94A3B8' }}>·</span>
            <span style={{ color: '#94A3B8' }}>{activePoolSize} remain</span>
          </div>
        </div>
      )}

      {/* ── Question text ── */}
      <p className={styles.question}>{question}</p>

      {/* ── Hint ── */}
      {hint && (
        <div className={styles.hint}>
          <span className={styles.hintIcon}>💡</span>
          <span className={styles.hintText}>{hint}</span>
        </div>
      )}

      {/* ── Answer buttons ── */}
      <div className={styles.buttons}>
        <button className={`${styles.btn} ${styles.yes}`}      onClick={() => onAnswer('yes')}        disabled={loading} id="btn-yes">      <span>✓</span> Yes       </button>
        <button className={`${styles.btn} ${styles.no}`}       onClick={() => onAnswer('no')}         disabled={loading} id="btn-no">       <span>✗</span> No        </button>
        <button className={`${styles.btn} ${styles.maybe}`}    onClick={() => onAnswer('maybe')}      disabled={loading} id="btn-maybe">    <span>?</span> Maybe     </button>
        <button className={`${styles.btn} ${styles.dontKnow}`} onClick={() => onAnswer('dont-know')} disabled={loading} id="btn-dont-know"><span>—</span> Don't Know</button>
      </div>
    </div>
  );
}
