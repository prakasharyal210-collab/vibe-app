const fs = require('fs');
const path = require('path');

function patchFile(full) {
  let content = fs.readFileSync(full, 'utf8');
  if (!content.includes('#')) return;
  let patched = content;
  // Handle: spaces + optional modifiers + #field
  patched = patched.replace(/([ \t]+(?:readonly\s+|private\s+|public\s+|protected\s+|static\s+|abstract\s+)*)#([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1_PRIV_$2');
  // Handle: this.#field
  patched = patched.replace(/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/g, 'this._PRIV_$1');
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
    else if (entry.name.match(/\.(js|ts|tsx)$/)) patchFile(full);
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
    patchDir(path.join(pnpmDir, entry, 'node_modules/react-native-worklets/src'));
  }
  if (entry.startsWith('react-native-reanimated')) {
    patchDir(path.join(pnpmDir, entry, 'node_modules/react-native-reanimated/src'));
  }
  if (entry.startsWith('react-native@')) {
    patchDir(path.join(pnpmDir, entry, 'node_modules/react-native/Libraries/WebPerformance'));
    patchDir(path.join(pnpmDir, entry, 'node_modules/react-native/Libraries/DOM'));
  }
});
console.log('Done!');
