const fs = require('fs');
const path = require('path');

function patchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchDir(full);
    } else if (entry.name.endsWith('.js')) {
      let content = fs.readFileSync(full, 'utf8');
      if (content.includes('#')) {
        const patched = content.replace(/(\s+)#([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1_$2');
        fs.writeFileSync(full, patched);
        console.log('Patched:', full);
      }
    }
  });
}

const base = '../../node_modules/.pnpm';
const entries = fs.readdirSync(base);
entries.forEach(entry => {
  if (entry.startsWith('react-native-worklets')) {
    const libDir = path.join(base, entry, 'node_modules/react-native-worklets/lib');
    console.log('Checking:', libDir);
    patchDir(libDir);
  }
});
console.log('Done!');
