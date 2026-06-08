const fs = require('fs');
const path = require('path');

function patchDir(dir, label) {
  if (!fs.existsSync(dir)) { console.log('Not found:', dir); return; }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) patchDir(full, label);
    else if (entry.name.endsWith('.js')) {
      let content = fs.readFileSync(full, 'utf8');
      if (content.includes('#')) {
        const patched = content.replace(/(\s+)#([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1_$2');
        fs.writeFileSync(full, patched);
        console.log('Patched:', label, entry.name);
      }
    }
  });
}

const base = '../../node_modules/.pnpm';
fs.readdirSync(base).forEach(entry => {
  if (entry.startsWith('react-native-worklets')) {
    patchDir(path.join(base, entry, 'node_modules/react-native-worklets/lib'), 'worklets');
  }
  if (entry.startsWith('react-native@')) {
    patchDir(path.join(base, entry, 'node_modules/react-native/Libraries/WebPerformance'), 'react-native');
  }
});
console.log('All done!');
