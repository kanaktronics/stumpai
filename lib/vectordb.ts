import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

const index = new Index({
  url: (process.env.UPSTASH_VECTOR_REST_URL || '').replace(/"/g, ''),
  token: (process.env.UPSTASH_VECTOR_REST_TOKEN || '').replace(/"/g, ''),
});

export interface VectorMatch {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

// ── In-memory LRU embedding cache ───────────────────────────────────────────
// Caches embeddings keyed by query text. This is the primary fix for the 429:
// identical (or structurally similar) vector queries across a session hit the
// cache instead of burning API quota.
const EMBEDDING_CACHE = new Map<string, number[]>();
const CACHE_MAX_SIZE = 128;

function cacheGet(key: string): number[] | undefined {
  if (!EMBEDDING_CACHE.has(key)) return undefined;
  // LRU: re-insert to mark as recently used
  const val = EMBEDDING_CACHE.get(key)!;
  EMBEDDING_CACHE.delete(key);
  EMBEDDING_CACHE.set(key, val);
  return val;
}

function cacheSet(key: string, embedding: number[]): void {
  if (EMBEDDING_CACHE.size >= CACHE_MAX_SIZE) {
    // Evict the oldest entry (first inserted = least recently used)
    const firstKey = EMBEDDING_CACHE.keys().next().value;
    if (firstKey !== undefined) EMBEDDING_CACHE.delete(firstKey);
  }
  EMBEDDING_CACHE.set(key, embedding);
}

// ── Exponential backoff retry ────────────────────────────────────────────────
// Retries up to `maxRetries` times on 429 responses with doubling delays.
async function embedWithRetry(
  queryText: string,
  maxRetries = 3,
  baseDelayMs = 400
): Promise<number[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.embedContent(queryText);
      let embedding = result.embedding.values;

      // Normalize and slice to 768 dimensions (matches seeded vectors)
      if (embedding.length > 768) {
        embedding = embedding.slice(0, 768);
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        embedding = embedding.map(v => v / norm);
      }

      return embedding;
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;

      // Only retry on rate-limit (429) errors
      if (status !== 429 || attempt === maxRetries) throw err;

      // Exponential backoff: 400ms, 800ms, 1600ms…
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[VectorDB] 429 rate limit hit. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(res => setTimeout(res, delay));
    }
  }

  throw lastError;
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function queryVectorDB(
  queryText: string,
  topK: number = 5
): Promise<VectorMatch[]> {
  try {
    // Normalise the cache key: lowercase, trim whitespace, collapse spaces
    const cacheKey = queryText.toLowerCase().trim().replace(/\s+/g, ' ');

    // 1. Cache hit → skip embedding API entirely
    let embedding = cacheGet(cacheKey);

    if (!embedding) {
      // 2. Cache miss → call Gemini with backoff
      embedding = await embedWithRetry(queryText);
      cacheSet(cacheKey, embedding);
    } else {
      console.debug('[VectorDB] Cache hit — skipped embedding API call');
    }

    // 3. Query Upstash
    const queryResult = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
    });

    return queryResult as VectorMatch[];
  } catch (err) {
    console.error('[Vector DB] Error querying:', err);
    return []; // graceful degradation — Bayesian engine continues without vector boost
  }
}

// ── Cache diagnostics ────────────────────────────────────────────────────────
export function getVectorCacheStats(): { size: number; maxSize: number } {
  return { size: EMBEDDING_CACHE.size, maxSize: CACHE_MAX_SIZE };
}
