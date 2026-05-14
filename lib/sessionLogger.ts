import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface SessionLog {
  sessionId?: string;
  startedAt?: unknown;
  questionHistory: Array<{ questionId: string; answer: string }>;
  finalGuess: string | null;
  wasCorrect: boolean | null;
  totalQuestions: number;
  finalConfidence: number;
  poolSize: number;
}

// Create a new session document, returns the Firestore doc ID
export async function createSession(): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'sessions'), {
      startedAt: serverTimestamp(),
      status: 'in_progress',
    });
    return ref.id;
  } catch (e) {
    console.warn('Firebase session create failed:', e);
    return 'local';
  }
}

// Update session on game end
export async function logSessionResult(
  sessionId: string,
  log: SessionLog
): Promise<void> {
  if (sessionId === 'local') return;
  try {
    await updateDoc(doc(db, 'sessions', sessionId), {
      ...log,
      endedAt: serverTimestamp(),
      status: log.wasCorrect ? 'correct' : log.wasCorrect === false ? 'wrong' : 'abandoned',
    });
  } catch (e) {
    console.warn('Firebase session log failed:', e);
  }
}
