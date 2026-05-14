import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? 'stumpai';
const DATASET    = process.env.BIGQUERY_DATASET_ID    ?? 'ipl_oracle_sessions';
const TABLE      = process.env.BIGQUERY_TABLE_ID      ?? 'session_logs';

let bq: BigQuery | null = null;

function getClient(): BigQuery {
  if (!bq) {
    bq = new BigQuery({
      projectId: PROJECT_ID,
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
  return bq;
}

export interface BigQuerySessionRow {
  session_id:        string;
  started_at:        string;   // ISO timestamp
  ended_at:          string;
  total_questions:   number;
  final_confidence:  number;
  final_guess:       string;
  was_correct:       boolean | null;
  question_history:  string;  // JSON stringified
  final_pool_size:   number;
  entropy_start:     number;
  entropy_end:       number;
}

// Ensure dataset + table exist, then insert row
export async function logToBigQuery(row: BigQuerySessionRow): Promise<void> {
  try {
    const client = getClient();
    const dataset = client.dataset(DATASET);
    const table = dataset.table(TABLE);
    await table.insert([row]);
    console.log(`[BigQuery] Session ${row.session_id} logged ✓`);
  } catch (err: any) {
    // Non-fatal — don't crash the game if BQ is unavailable
    if (err.code === 403 || err.code === 404) {
       // Silently ignore permission/missing dataset errors to prevent terminal spam
    } else {
       console.warn('[BigQuery] Logging failed (non-fatal):', err.message || err);
    }
  }
}
