import { NextRequest, NextResponse } from 'next/server';
import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PLAYERS } from '@/lib/players';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!.replace(/"/g, ''),
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!.replace(/"/g, ''),
});

export async function POST(req: NextRequest) {
  try {
    const { actualPlayerName, questionHistory } = await req.json();
    
    // 1. Find the actual player
    const player = PLAYERS.find(p => p.name.toLowerCase() === actualPlayerName.toLowerCase());
    if (!player) return NextResponse.json({ success: false, error: 'Player not found' });

    // 2. Create a "Lore" vector from this session's history
    // This allows the AI to "learn" that these specific answers lead to this player.
    const sessionLore = `
      Player: ${player.name}
      Confirmed Traits:
      ${(questionHistory as {question:string;answer:string}[]).map(h => `${h.question} -> ${h.answer}`).join('\n')}
    `.trim();

    const result = await model.embedContent(sessionLore);
    let embedding = result.embedding.values;
    if (embedding.length > 768) {
       embedding = embedding.slice(0, 768);
       const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v*v, 0));
       embedding = embedding.map(v => v / norm);
    }

    // 3. Upsert as a "Dynamic Lore" persona
    await index.upsert([{
      id: `${player.id}_dynamic_${Date.now()}`,
      vector: embedding,
      metadata: { ...player, persona: 'dynamic_lore', session_date: new Date().toISOString() }
    }]);

    console.log(`Oracle Learned: ${player.name} from session history.`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Feedback API] Error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
