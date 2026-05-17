const players = require('./players_computed_full.json');
const names = ['RA Jadeja', 'Shakib Al Hasan', 'SP Narine', 'AD Russell', 'DA Warner', 'F du Plessis', 'GJ Maxwell', 'Rashid Khan', 'R Ashwin', 'AR Patel', 'KA Pollard', 'Yuvraj Singh', 'V Sehwag', 'G Gambhir', 'S Dhawan', 'RR Pant', 'KL Rahul', 'B Kumar', 'YS Chahal', 'SR Watson', 'DJ Bravo'];
const matches = players.filter(p => names.some(n => p.name.includes(n)));
console.log(matches.map(m => `'${m.id}': { name: '${m.name}' },`).join('\n'));
