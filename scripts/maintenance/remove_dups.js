const fs = require('fs');
let data = fs.readFileSync('lib/players_generated.ts', 'utf8');

const badNames = ['V Kohli', 'RG Sharma', 'SL Malinga', 'SK Raina', 'CH Gayle', 'JJ Bumrah'];

badNames.forEach(name => {
  const searchStr = `"name": "${name}"`;
  let idx = data.indexOf(searchStr);
  while (idx !== -1) {
    // Find the start of the object
    let startIdx = data.lastIndexOf('{', idx);
    // Find the end of the object
    let endIdx = data.indexOf('}', idx);
    if (startIdx !== -1 && endIdx !== -1) {
      // Also remove the trailing comma if it exists
      let removeEnd = endIdx + 1;
      if (data[removeEnd] === ',') {
        removeEnd++;
      }
      data = data.substring(0, startIdx) + data.substring(removeEnd);
      console.log(`Removed ${name}`);
    }
    idx = data.indexOf(searchStr);
  }
});

// Also fix some canonical names for players that don't have duplicates but have bad names
data = data.replace(/"name": "RA Jadeja"/g, '"name": "Ravindra Jadeja"');
data = data.replace(/"name": "SP Narine"/g, '"name": "Sunil Narine"');
data = data.replace(/"name": "AD Russell"/g, '"name": "Andre Russell"');
data = data.replace(/"name": "F du Plessis"/g, '"name": "Faf du Plessis"');
data = data.replace(/"name": "GJ Maxwell"/g, '"name": "Glenn Maxwell"');
data = data.replace(/"name": "KA Pollard"/g, '"name": "Kieron Pollard"');
data = data.replace(/"name": "Rashid Khan"/g, '"name": "Rashid Khan"'); // Already okay probably

fs.writeFileSync('lib/players_generated.ts', data);
console.log('Done removing duplicates and fixing canonical names.');
