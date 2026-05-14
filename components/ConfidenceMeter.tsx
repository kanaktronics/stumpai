'use client';
import styles from './ConfidenceMeter.module.css';

interface Props { confidence: number; interpretation?: string }

export default function ConfidenceMeter({ confidence, interpretation }: Props) {
  const pct = Math.min(100, Math.max(0, confidence));
  const color = pct >= 80 ? '#10B981' : pct >= 50 ? '#FBB824' : '#3B82F6';
  const label = interpretation || (pct >= 80 ? 'ORACLE READY' : pct >= 50 ? 'CONVERGING' : 'ANALYSING');

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Confidence Tensor</span>
        <span className={styles.pct} style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%`, background: color }} />
        <div className={styles.threshold} />
      </div>
      <div className={styles.status} style={{ color }}>{label}</div>
    </div>
  );
}
