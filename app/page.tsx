import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stump.AI — IPL Oracle | Bayesian Player Guesser',
  description: 'Think of any IPL player and Stump.AI will guess who it is using Bayesian inference and Shannon entropy in ~8 questions.',
};

export default function LandingPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f9f9ff', fontFamily: 'var(--font-main)' }}>

      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#fff', borderBottom: '1px solid #ecedf7',
        padding: '16px 80px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🏏</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#1a1b22' }}>
            Stump<span style={{ color: '#0058bd' }}>.AI</span>
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 40 }}>
          {[['/', 'Home'], ['/app', 'Play']].map(([href, label]) => (
            <a key={href} href={href} style={{
              fontSize: 15, fontWeight: 600,
              color: href === '/' ? '#0058bd' : '#424753',
              textDecoration: 'none'
            }}>{label}</a>
          ))}
        </nav>
        <a href="/app" style={{
          padding: '10px 24px', background: '#0058bd', color: '#fff',
          borderRadius: 9999, fontWeight: 700, fontSize: 14, textDecoration: 'none'
        }}>Play Now →</a>
      </header>

      {/* ── HERO ── */}
      <section style={{
        maxWidth: 900, margin: '0 auto', padding: '100px 24px 80px',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 16px', background: 'rgba(0,88,189,0.08)',
          borderRadius: 9999, marginBottom: 32,
          fontSize: 13, fontWeight: 700, color: '#0058bd'
        }}>
          ⚡ Built for GDG Build with AI Hackathon · Ranchi 2024
        </div>

        <h1 style={{
          fontSize: 'clamp(42px, 7vw, 80px)', fontWeight: 900,
          lineHeight: 1.05, letterSpacing: '-0.03em',
          color: '#1a1b22', marginBottom: 24
        }}>
          Think of an IPL player.<br />
          <span style={{ color: '#0058bd' }}>I&apos;ll guess who.</span>
        </h1>

        <p style={{
          fontSize: 20, color: '#424753', lineHeight: 1.7,
          maxWidth: 600, margin: '0 auto 48px'
        }}>
          Stump.AI uses <strong>Bayesian inference</strong> and <strong>Shannon entropy</strong> to
          identify any IPL player in ~8 questions. No tricks — pure mathematics.
        </p>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/app?autostart=true" style={{
            padding: '18px 48px', background: '#0058bd', color: '#fff',
            borderRadius: 9999, fontWeight: 800, fontSize: 18,
            textDecoration: 'none', boxShadow: '0 8px 30px rgba(0,88,189,0.3)',
            transition: 'transform 0.2s'
          }}>
            🚀 Start Playing
          </a>
        </div>
      </section>

      {/* ── STATS ROW ── */}
      <section style={{
        background: '#0058bd', padding: '48px 24px',
        display: 'flex', justifyContent: 'center', gap: 0
      }}>
        {[
          ['800+', 'IPL Players'],
          ['~8', 'Questions to Guess'],
          ['88%', 'Confidence Threshold'],
          ['100%', 'Bayesian Math'],
        ].map(([val, label], i) => (
          <div key={i} style={{
            flex: 1, maxWidth: 200, textAlign: 'center',
            padding: '0 24px',
            borderRight: i < 3 ? '1px solid rgba(255,255,255,0.2)' : 'none'
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>{val}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '96px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: '#1a1b22', marginBottom: 16 }}>How the Oracle Works</h2>
          <p style={{ fontSize: 17, color: '#424753', maxWidth: 560, margin: '0 auto' }}>
            Three layers of intelligence working together in real-time.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {[
            {
              icon: '🧠',
              title: 'Bayesian Inference',
              desc: 'Every answer updates a probability distribution across 800+ IPL players using Bayes\' theorem — mathematically proven, not guesswork.',
              color: '#0058bd',
            },
            {
              icon: '📊',
              title: 'Shannon Entropy',
              desc: 'Questions are selected using information gain (MCTS) to maximally reduce uncertainty with each answer — like a binary search over cricket lore.',
              color: '#188038',
            },
            {
              icon: '🛡️',
              title: 'Hard Constraints',
              desc: 'Binary attributes (Overseas, Indian, Retired) trigger instant elimination — zero logical dissonance, no contradictions survive.',
              color: '#d93025',
            },
          ].map((card) => (
            <div key={card.title} style={{
              background: '#fff', borderRadius: 20, padding: '40px 32px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
              borderTop: `4px solid ${card.color}`
            }}>
              <div style={{ fontSize: 48, marginBottom: 20 }}>{card.icon}</div>
              <h3 style={{ fontSize: 22, fontWeight: 800, color: '#1a1b22', marginBottom: 12 }}>{card.title}</h3>
              <p style={{ fontSize: 15, color: '#424753', lineHeight: 1.7 }}>{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{
        maxWidth: 800, margin: '0 auto 96px', textAlign: 'center',
        background: '#fff', borderRadius: 24, padding: '64px 40px',
        boxShadow: '0 12px 48px rgba(0,0,0,0.10)'
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏏</div>
        <h2 style={{ fontSize: 36, fontWeight: 900, color: '#1a1b22', marginBottom: 16 }}>
          Ready to stump the Oracle?
        </h2>
        <p style={{ fontSize: 17, color: '#424753', marginBottom: 40, lineHeight: 1.6 }}>
          Think of your favourite IPL player — a legend, a mystery spinner, an overseas slogger —
          and see if the Bayesian engine can crack your secret in under 10 questions.
        </p>
        <a href="/app" style={{
          padding: '18px 56px', background: '#0058bd', color: '#fff',
          borderRadius: 9999, fontWeight: 800, fontSize: 18,
          textDecoration: 'none', boxShadow: '0 8px 30px rgba(0,88,189,0.3)',
          display: 'inline-block'
        }}>
          🚀 Challenge the Oracle
        </a>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#1a1b22', padding: '40px 80px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16
      }}>
        <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 800, fontSize: 18 }}>
          🏏 Stump<span style={{ color: '#4285f4' }}>.AI</span>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          © 2024 Stump.AI · Built for GDG Build with AI Hackathon · Ranchi
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[['/', 'Home'], ['/app', 'Play']].map(([href, label]) => (
            <a key={href} href={href} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>{label}</a>
          ))}
        </div>
      </footer>
    </main>
  );
}
