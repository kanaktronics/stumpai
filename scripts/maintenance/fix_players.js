const fs = require('fs');
let data = fs.readFileSync('lib/players_generated.ts', 'utf8');

// Fix Hardik Pandya
data = data.replace(/"name": "HH Pandya"/g, '"name": "Hardik Pandya"');
data = data.replace(/"id": "dbe50b21"/g, '"id": "hardik-pandya"');
let hIndex = data.indexOf('"id": "hardik-pandya"');
let hEnd = data.indexOf('}', hIndex);
let hBlock = data.substring(hIndex, hEnd);
hBlock = hBlock.replace(/"titles": 0/g, '"titles": 5');
hBlock = hBlock.replace(/"iplCaptain": false/g, '"iplCaptain": true');
hBlock = hBlock.replace(/"internationalCaptain": false/g, '"internationalCaptain": true');
data = data.substring(0, hIndex) + hBlock + data.substring(hEnd);

// Fix Krunal Pandya
data = data.replace(/"name": "KH Pandya"/g, '"name": "Krunal Pandya"');
data = data.replace(/"id": "5b8c830e"/g, '"id": "krunal-pandya"');
let kIndex = data.indexOf('"id": "krunal-pandya"');
let kEnd = data.indexOf('}', kIndex);
let kBlock = data.substring(kIndex, kEnd);
kBlock = kBlock.replace(/"titles": 0/g, '"titles": 3');
data = data.substring(0, kIndex) + kBlock + data.substring(kEnd);

fs.writeFileSync('lib/players_generated.ts', data);
console.log('Fixed players!');
