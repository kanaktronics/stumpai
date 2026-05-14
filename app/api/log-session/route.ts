import { NextRequest, NextResponse } from 'next/server';
import { logToBigQuery, BigQuerySessionRow } from '@/lib/bigquery';
import { logSessionResult } from '@/lib/sessionLogger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sessionId: string;
      startedAt: string;
      questionHistory: Array<{ questionId: string; answer: string }>;
      finalGuess: string | null;
      wasCorrect: boolean | null;
      totalQuestions: number;
      finalConfidence: number;
      poolSize: number;
      entropyStart: number;
      entropyEnd: number;
    };

    const endedAt = new Date().toISOString();

    // Log to BigQuery (server-side, uses service account)
    const bqRow: BigQuerySessionRow = {
      session_id:        body.sessionId,
      started_at:        body.startedAt,
      ended_at:          endedAt,
      total_questions:   body.totalQuestions,
      final_confidence:  body.finalConfidence,
      final_guess:       body.finalGuess ?? 'unknown',
      was_correct:       body.wasCorrect,
      question_history:  JSON.stringify(body.questionHistory),
      final_pool_size:   body.poolSize,
      entropy_start:     body.entropyStart,
      entropy_end:       body.entropyEnd,
    };
    await logToBigQuery(bqRow);

    // Also update Firestore (client-side Firebase via server)
    await logSessionResult(body.sessionId, {
      questionHistory: body.questionHistory,
      finalGuess: body.finalGuess,
      wasCorrect: body.wasCorrect,
      totalQuestions: body.totalQuestions,
      finalConfidence: body.finalConfidence,
      poolSize: body.poolSize,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[log-session] Error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
