import fs from 'fs';
import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

const index = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL.replace(/"/g, ''),
  token: process.env.UPSTASH_VECTOR_REST_TOKEN.replace(/"/g, ''),
});

const players = JSON.parse(fs.readFileSync('players_computed_full.json', 'utf8'));

async function getEmbedding(text) {
  const result = await model.embedContent(text);
  let embedding = result.embedding.values;
  if (embedding.length > 768) {
    embedding = embedding.slice(0, 768);
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v*v, 0));
    embedding = embedding.map(v => v / norm);
  }
  return embedding;
}

async function seed() {
  console.log(`Starting Multi-Vector Persona Seeding for ${players.length} players...`);
  
  const batchSize = 5; // Smaller batch for 3 vectors per player
  
  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}...`);
    
    const upsertData = [];
    
    for (const p of batch) {
      try {
        // Persona 1: Archetype (Role, Teams, Era)
        const archetypeText = `
          Player: ${p.name}
          Role: ${p.wickets > 10 ? (p.runs > 200 ? 'All-rounder' : 'Bowler') : 'Batsman'}
          Teams: ${p.teams.join(', ')}
          Era: Active during ${p.seasons.join(', ')}
        `.trim();
        
        // Persona 2: Statistical (Numbers, Centuries, Outliers)
        const statText = `
          Player: ${p.name}
          Stats: ${p.runs} runs, ${p.wickets} wickets, ${p.matches} matches.
          Achievements: ${p.centuries} centuries, ${p.fifties} fifties, ${p.potm} PotM awards.
          Highest: ${p.highest_score}. Economy: ${p.economy}.
        `.trim();
        
        // Persona 3: Emotional/Lore (Status, Reputation)
        const loreText = `
          Player: ${p.name}
          Status: ${p.is_active ? 'Current active IPL talent' : 'Retired IPL legend'}
          Fame: Known for playing for ${p.teams[0]} and ${p.teams.length > 1 ? p.teams[1] : 'multiple franchises'}.
          Legacy: Part of the IPL narrative from ${p.seasons[0]} to ${p.last_season}.
        `.trim();

        const [vArch, vStat, vLore] = await Promise.all([
          getEmbedding(archetypeText),
          getEmbedding(statText),
          getEmbedding(loreText)
        ]);

        upsertData.push(
          { id: `${p.id}_arch`, vector: vArch, metadata: { ...p, persona: 'archetype' } },
          { id: `${p.id}_stat`, vector: vStat, metadata: { ...p, persona: 'statistical' } },
          { id: `${p.id}_lore`, vector: vLore, metadata: { ...p, persona: 'lore' } }
        );
      } catch (err) {
        console.error(`Failed player ${p.name}:`, err.message);
      }
    }
    
    if (upsertData.length > 0) {
      await index.upsert(upsertData);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  
  console.log('Multi-Vector Seeding complete!');
}

seed().catch(console.error);
