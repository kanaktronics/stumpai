'use client';
import styles from './Leaderboard.module.css';

interface Candidate { player_id: string; player_name: string; p_value: string; reason: string; }
interface Props { candidates: Candidate[]; }

const MEDALS = ['🥇','🥈','🥉'];

export default function Leaderboard({ candidates }: Props) {
  return (
    <div className={styles.wrapper}>
      <h3 className={styles.title}>⚡ Live Inference Grid</h3>
      <div className={styles.list}>
        {candidates.length > 0 ? (
          candidates.map((c, i) => {
            const pct = (parseFloat(c.p_value) * 100).toFixed(1);
            return (
              <div key={c.player_id} className={styles.row} style={{ '--delay': `${i * 0.1}s` } as React.CSSProperties}>
                <span className={styles.medal}>{MEDALS[i]}</span>
                <div className={styles.info}>
                  <span className={styles.name}>{c.player_name}</span>
                  <span className={styles.reason}>{c.reason}</span>
                </div>
                <div className={styles.probWrap}>
                  <span className={styles.prob}>{pct}%</span>
                  <div className={styles.bar}>
                    <div className={styles.barFill} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.row} style={{ justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px', borderStyle: 'dashed' }}>
             📡 Syncing priors... calibrating inference grid
          </div>
        )}
      </div>
    </div>
  );
}
