import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, guessedPlayer, actualPlayer, history } = body;

    if (!actualPlayer) {
      return NextResponse.json({ error: 'Missing actualPlayer' }, { status: 400 });
    }

    // Log the failure to Firestore so the engine can "learn" offline
    // (In a future update, a cron job can use these to auto-tune the Bayesian weights)
    await addDoc(collection(db, 'feedbacks'), {
      sessionId: sessionId || 'unknown',
      guessedPlayer: guessedPlayer || 'none',
      actualPlayer,
      history: history || [],
      createdAt: serverTimestamp(),
      resolved: false
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Feedback API] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
