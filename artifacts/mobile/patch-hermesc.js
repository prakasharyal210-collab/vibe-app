const fs = require('fs');
const path = require('path');

function patchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) patchDir(full);
    else if (entry.name.endsWith('.js')) {
      let content = fs.readFileSync(full, 'utf8');
      if (content.includes('#')) {
        const patched = content.replace(/(\s+)#([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1_$2');
        if (patched !== content) {
          fs.writeFileSync(full, patched);
          console.log('Patched:', full);
        }
      }
    }
  });
}

// Find node_modules - search up from script location
let dir = __dirname;
let pnpmDir = null;
for (let i = 0; i < 6; i++) {
  const candidate = path.join(dir, 'node_modules', '.pnpm');
  if (fs.existsSync(candidate)) { pnpmDir = candidate; break; }
  dir = path.dirname(dir);
}

if (!pnpmDir) { console.error('pnpm dir not found!'); process.exit(1); }
console.log('Found pnpm at:', pnpmDir);

fs.readdirSync(pnpmDir).forEach(entry => {
  if (entry.startsWith('react-native-worklets')) {
    patchDir(path.join(pnpmDir, entry, 'node_modules/react-native-worklets/lib'));
  }
  if (entry.startsWith('react-native@')) {
    patchDir(path.join(pnpmDir, entry, 'node_modules/react-native/Libraries'));
  }
});
console.log('Done!');
