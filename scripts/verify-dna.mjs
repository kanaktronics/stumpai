import { readFileSync } from 'fs';
const raw = readFileSync('lib/players_generated.ts', 'utf8')
  .replace(/^import.*;\n/, '')
  .replace('export const PLAYERS: Player[] = ', '')
  .replace(/;\s*$/, '');
const data = JSON.parse(raw);

const tanvir = data.find(p => p.name === 'Sohail Tanvir');
const dhoni = data.find(p => p.name === 'MS Dhoni');
const pollard = data.find(p => p.name?.includes('Pollard'));

console.log('\n── TANVIR ──');
console.log('Era:', tanvir?.era, '| Country:', tanvir?.country);
console.log('DNA one-season wonder:', tanvir?.identityDNA?.oneSeasonWonder);
console.log('Tags:', tanvir?.identityTags);

console.log('\n── DHONI ──');
console.log('DNA finisher:', dhoni?.identityDNA?.finisher, '| captainAura:', dhoni?.identityDNA?.captainAura, '| memeFactor:', dhoni?.identityDNA?.memeFactor);
console.log('Tags:', dhoni?.identityTags?.slice(0,3));

if (pollard) {
  console.log('\n── POLLARD ──');
  console.log('DNA powerHitter:', pollard?.identityDNA?.powerHitter, '| finisher:', pollard?.identityDNA?.finisher);
  console.log('Tags:', pollard?.identityTags);
}

console.log('\nTotal players:', data.length);
