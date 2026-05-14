'use client';
import styles from './RevealCard.module.css';
import { Player } from '@/lib/players';

interface Props {
  player: Player;
  confidence: number;
  reasoning?: string;
  onRestart: () => void;
  onCorrect: () => void;
  onWrong: (actualName?: string) => void;
}

export default function RevealCard({ player, confidence, reasoning, onRestart, onCorrect, onWrong }: Props) {
  const ROLE_ICONS: Record<string, string> = {
    batsman: '🏏', bowler: '🎳', allrounder: '⚡', wicketkeeper: '🧤',
  };
  const ERA_LABELS: Record<string, string> = {
    early: '🕰️ Early IPL (2008–11)', golden: '✨ Golden Era (2012–18)', modern: '📊 Modern IPL (2019+)',
  };

  // Build top 3 DNA traits for display
  const dna = player.identityDNA;
  const dnaTraits = dna ? [
    { label: 'Power Hitter',   val: dna.powerHitter ?? 0   },
    { label: 'Finisher',       val: dna.finisher ?? 0       },
    { label: 'Clutch Player',  val: dna.clutchPlayer ?? 0   },
    { label: 'Death Bowler',   val: dna.deathBowler ?? 0    },
    { label: 'Meme Factor',    val: dna.memeFactor ?? 0     },
    { label: 'Captain Aura',   val: dna.captainAura ?? 0    },
    { label: 'Underdog',       val: dna.underdog ?? 0       },
    { label: 'Longevity',      val: dna.longevity ?? 0      },
  ].sort((a, b) => b.val - a.val).slice(0, 4) : [];

  return (
    <div className={styles.wrapper}>
      <div className={styles.glow} />
      <div className={styles.badge}>🔮 Oracle Speaks</div>

      {/* Era badge */}
      {player.era && (
        <div className={styles.era}>{ERA_LABELS[player.era] ?? player.era}</div>
      )}

      <div className={styles.silhouette}>
        <div className={styles.avatar}>{ROLE_ICONS[player.role]}</div>
      </div>
      <h2 className={styles.name}>{player.name}</h2>

      <div className={styles.tags}>
        <span className={styles.tag}>{player.country}</span>
        <span className={styles.tag}>{player.role.toUpperCase()}</span>
        <span className={styles.tag}>{player.teams.join(' · ')}</span>
        {(player.titles ?? 0) > 0 && <span className={`${styles.tag} ${styles.gold}`}>🏆 {player.titles}x Champion</span>}
        {player.orangeCap && <span className={`${styles.tag} ${styles.orange}`}>🟠 Orange Cap</span>}
        {player.purpleCap && <span className={`${styles.tag} ${styles.purple}`}>🟣 Purple Cap</span>}
      </div>

      {/* Identity Tags */}
      {player.identityTags && player.identityTags.length > 0 && (
        <div className={styles.identityTags}>
          {player.identityTags.slice(0, 4).map(t => (
            <span key={t} className={styles.identityTag}>{t}</span>
          ))}
        </div>
      )}

      {/* Identity DNA bars */}
      {dnaTraits.length > 0 && (
        <div className={styles.dna}>
          <div className={styles.dnaTitle}>Identity DNA</div>
          {dnaTraits.map(t => (
            <div key={t.label} className={styles.dnaRow}>
              <span className={styles.dnaLabel}>{t.label}</span>
              <div className={styles.dnaBarBg}>
                <div className={styles.dnaBarFill} style={{ width: `${Math.round(t.val * 100)}%` }} />
              </div>
              <span className={styles.dnaVal}>{Math.round(t.val * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* WHY I GUESSED THIS — The Killer Feature */}
      {reasoning && (
        <div className={styles.reasoning}>
          <div className={styles.reasoningTitle}>🧠 Why I deduced this:</div>
          <p className={styles.reasoningText}>{reasoning}</p>
        </div>
      )}

      <p className={styles.famousFor}>"{player.famousFor}"</p>

      <div className={styles.conf}>
        Oracle Confidence: <strong>{confidence.toFixed(1)}%</strong>
      </div>
      <p className={styles.question}>Was I right?</p>
      <div className={styles.actions}>
        <button className={`${styles.btn} ${styles.correct}`} onClick={onCorrect} id="btn-correct">
          🎯 Yes, that's them!
        </button>
        <button className={`${styles.btn} ${styles.wrong}`} onClick={() => {
          const name = prompt('Who was it? (Enter player name to help the Oracle learn)');
          onWrong(name ?? undefined);
        }} id="btn-wrong">
          ❌ No, try again
        </button>
      </div>
      <button className={styles.restart} onClick={onRestart} id="btn-restart">
        🔄 New Game
      </button>
    </div>
  );
}
