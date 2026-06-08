const fs = require('fs');
const path = require('path');

function patchFile(full) {
  let content = fs.readFileSync(full, 'utf8');
  if (!content.includes('#')) return;
  
  // Only replace private class fields: must be inside class body
  // Pattern: line starts with optional spaces, then # followed by identifier
  const patched = content
    .replace(/^(\s+)(#[a-zA-Z_][a-zA-Z0-9_]*)\s*;/gm, '$1_$2_PRIV;')
    .replace(/^(\s+)(#[a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm, '$1_$2_PRIV =')
    .replace(/this\.(#[a-zA-Z_][a-zA-Z0-9_]*)/g, 'this._$1_PRIV')
    .replace(/\._#([a-zA-Z_][a-zA-Z0-9_]*)_PRIV/g, '._$1_PRIV');
  
  if (patched !== content) {
    fs.writeFileSync(full, patched);
    console.log('Patched:', path.basename(full));
  }
}

function patchDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) patchDir(full);
    else if (entry.name.endsWith('.js')) patchFile(full);
  });
}

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
