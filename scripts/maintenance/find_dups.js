const fs = require('fs');
const data = fs.readFileSync('lib/players_generated.ts', 'utf8');
const regex = /"name": "(.*?)"/g;
let match;
const names = [];
while ((match = regex.exec(data)) !== null) {
  names.push(match[1]);
}
console.log('Dhoni:', names.filter(n => n.includes('Dhoni')));
console.log('Kohli:', names.filter(n => n.includes('Kohli')));
console.log('Sharma:', names.filter(n => n.includes('Sharma')));
console.log('Malinga:', names.filter(n => n.includes('Malinga')));
console.log('Raina:', names.filter(n => n.includes('Raina')));
console.log('Gayle:', names.filter(n => n.includes('Gayle')));
console.log('Pandya:', names.filter(n => n.includes('Pandya')));
console.log('de Villiers:', names.filter(n => n.includes('Villiers')));
console.log('Bumrah:', names.filter(n => n.includes('Bumrah')));
console.log('Jadeja:', names.filter(n => n.includes('Jadeja')));
console.log('Narine:', names.filter(n => n.includes('Narine')));
