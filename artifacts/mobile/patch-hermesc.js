const fs = require('fs');
const path = require('path');

function patchFile(full) {
  let content = fs.readFileSync(full, 'utf8');
  if (!content.includes('#')) return;
  let patched = content;
  patched = patched.replace(/([ \t]+(?:readonly\s+|private\s+|public\s+|protected\s+|static\s+|abstract\s+)*)#([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1_PRIV_$2');
  patched = patched.replace(/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/g, 'this._PRIV_$1');
  if (patched !== content) {
    fs.writeFileSync(full, patched);
    console.log('Patched:', path.basename(full));
  }
}

function patchDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !['android','ios','__tests__','__mocks__'].includes(entry.name)) {
      patchDir(full);
    } else if (entry.isFile() && /\.(js|ts|tsx)$/.test(entry.name)) {
      patchFile(full);
    }
  }
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

const PATCH_SCOPES = ['react-native', '@react-native', '@tanstack'];

for (const entry of fs.readdirSync(pnpmDir)) {
  const pkgDir = path.join(pnpmDir, entry, 'node_modules');
  if (!fs.existsSync(pkgDir)) continue;
  for (const pkg of fs.readdirSync(pkgDir)) {
    const matches = PATCH_SCOPES.some(s => pkg.startsWith(s));
    if (!matches) continue;
    const pkgPath = path.join(pkgDir, pkg);
    // patch scoped packages like @tanstack/query-core
    if (pkg.startsWith('@')) {
      for (const sub of fs.readdirSync(pkgPath)) {
        patchDir(path.join(pkgPath, sub));
      }
    } else {
      patchDir(pkgPath);
    }
  }
}
console.log('Done!');
