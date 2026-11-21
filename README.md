# Stump.ai

**Akinator for IPL cricketers.** Think of any IPL player, past or present. Stump.ai asks yes/no questions and names them.

[**Play it →**](https://stumpai.vercel.app) · Built for the GDG Build with AI hackathon · [Problem brief](docs/problem-brief.pdf)

The brief asked for a system that finds the player in 12 questions or fewer, adapts to every answer, and uses no hard-coded decision tree. Stump.ai does it with a probabilistic engine at the core and Gemini at the edges.

---

## How a turn works

```
 answer ──▶ Bayesian update ──▶ confidence ≥ 88%? ──yes──▶ Gemini reranks top 3 ──▶ guess
                 │                     │
                 │                     no
                 │                     ▼
                 │        pool > 15: pick the question with the most
                 │                   information gain from a 44-question bank
                 │        pool ≤ 15: Gemini writes a new question that splits
                 │                   the remaining candidates
                 ▼
      probabilities over 803 players
```

The game state (a probability for every player) lives in the client and is sent back each turn. That keeps the API stateless, so it runs on Vercel serverless functions with no session store.

## The engine (`lib/engine.ts`)

**Belief.** The engine starts with a uniform distribution over 803 players, built from 1,219 IPL matches of ball-by-ball [Cricsheet](https://cricsheet.org) data.

**Update.** Each answer multiplies every player's probability by how well they fit that answer:
- "Yes" keeps the players who match and scales everyone else down to 5%.
- "Probably" uses 85/15 instead.
- "Don't know" changes nothing.

Three facts (overseas, Indian, retired) are hard filters that remove a player outright.

**Soft traits.** Fuzzy traits like "is a finisher" or "is a mystery spinner" are not booleans. Each player has a 0–1 identity score for them, so a yes moves probability in proportion to how strongly the player fits.

**Safety rails.** No single answer can cut a player's probability by more than 82%, so one slightly wrong answer can't knock out the right player.

**Choosing the next question.** For every unused question, the engine computes the expected information gain:

```
IG(Q) = H(now) − [ P(yes) · H(after yes) + P(no) · H(after no) ]
```

It asks the question with the highest gain. Which candidates it optimises for depends on the stage of the game:
- Early on: the top 150 candidates.
- Mid-game: the top 30.
- Late game: only the top 5, which turns the question into "what separates these few?"

**Where Gemini comes in:**
- Gemini 2.5 Flash rephrases each bank question so it sounds natural.
- Once 15 or fewer candidates remain, Gemini 2.5 Flash writes new questions, because the fixed bank often can't separate the last few players.
- At guess time, Gemini 3.1 Pro rescores the top three candidates against the full question-and-answer history. Any ID it returns that isn't one of those candidates is thrown away.

## Benchmark

`scripts/benchmark-engine.ts` plays one game against **every** player, answering each question truthfully from the player's data. It applies the same stopping rules as the API and seeds the tie-breaking randomness, so runs are repeatable. It measures the deterministic core only, without Gemini.

```bash
npx tsx scripts/benchmark-engine.ts
```

| | Engine as shipped | Without posterior sharpening |
| :-- | --: | --: |
| Correct final guess, all 803 players | 41.0% | **56.7%** |
| Correct, 25 most-capped players | 52.0% | **100%** |
| "Confident" (≥ 88%) but wrong | 45.2% | **0%** |
| Questions asked, mean | **9.3** | 11.7 |

<sub>The right-hand column also applies the star-player boost once instead of every turn.</sub>

**What this shows:**
1. **Only half the players can be told apart by the bank.** 408 of the 803 players (50.8%) have a unique set of answers to the 44 bank questions. The rest share their answers with at least one other player, so no engine using only the bank can always separate them. This is the job the Gemini-written late-game questions do.
2. **Sharpening bought speed with accuracy.** After each answer the engine raises the probabilities to a power (1.2, rising to 2.5) to converge faster. That makes the engine commit early, and it ends up 88% sure of the wrong player almost half the time. Without it, the engine is never confidently wrong. It needs about two more questions, still inside the brief's limit of 12.

## What I'd change next

- Remove the sharpening step and add a "guess at the question limit" rule. The API currently rejects games longer than 15 questions, and without sharpening some games reach that limit.
- Apply the star-player prior once, at the start, instead of compounding it every turn.
- Rename `mctsSelectBestQuestion`. It's a greedy one-step information-gain search, not Monte Carlo tree search.
- Validate the client-held state on the server. Right now a client could send back altered probabilities.

## Run it

```bash
cp .env.example .env.local   # add a GEMINI_API_KEY at minimum
npm install
npm run dev
```

Feedback (Firestore) and session logging (BigQuery) are optional. The game works without them.

## Layout

```
app/api/oracle     game API: Bayesian update, question choice, guessing
lib/engine.ts      inference engine
lib/questions.ts   the 44-question bank
lib/players*.ts    generated player data (803 players)
scripts/           data generation, vector seeding, benchmark
data/              Cricsheet match JSON and the computed player stats
docs/              the hackathon problem brief
```

Stack: Next.js 16, React 19, TypeScript, Gemini (2.5 Flash, 3.1 Pro), Firebase, BigQuery, Vercel.
