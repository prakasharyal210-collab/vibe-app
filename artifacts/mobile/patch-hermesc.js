/**
 * EAS build post-install hook.
 *
 * hermesc (the Hermes compiler shipped with RN 0.81.x) cannot compile
 * private class field syntax (#field). Several packages ship compiled JS
 * with private fields in their lib/ and src/ directories:
 *   - react-native-reanimated (lib/module/ AND src/)
 *   - react-native-worklets   (lib/module/ AND src/)
 *   - react-native-screens    (lib/module/)
 *   - react-native            (Libraries/, src/)
 *
 * This script rewrites every occurrence before Metro bundles them, so
 * hermesc never sees #field syntax.
 *
 * Replacements made:
 *   class body:   "  #foo;"      →  "  _PRIV_foo;"
 *   access:       "this.#foo"    →  "this._PRIV_foo"
 *
 * The two-pass approach ensures the declaration and the access always
 * produce matching identifiers.
 */

const fs = require('fs');
const path = require('path');

let patchedCount = 0;

function patchFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  if (!content.includes('#')) return;

  // Pass 1 – class body declarations: leading whitespace + optional modifiers + #name
  let patched = content.replace(
    /(^|[\r\n])([ \t]+(?:(?:readonly|private|public|protected|static|abstract|declare)\s+)*)#([a-zA-Z_][a-zA-Z0-9_]*)/g,
    '$1$2_PRIV_$3'
  );

  // Pass 2 – member access: this.#name
  patched = patched.replace(/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/g, 'this._PRIV_$1');

  // Pass 3 – any remaining bare #name (e.g. in #name in obj checks, static contexts)
  patched = patched.replace(/#([a-zA-Z_][a-zA-Z0-9_]*)/g, '_PRIV_$1');

  if (patched !== content) {
    fs.writeFileSync(filePath, patched);
    patchedCount++;
    console.log('  patched:', path.relative(process.cwd(), filePath));
  }
}

function patchDir(dir) {
  if (!fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchDir(full);
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      patchFile(full);
    }
  }
}

// ── Locate the pnpm virtual store ───────────────────────────────────────────
let searchDir = __dirname;
let pnpmDir = null;
for (let i = 0; i < 8; i++) {
  const candidate = path.join(searchDir, 'node_modules', '.pnpm');
  if (fs.existsSync(candidate)) {
    pnpmDir = candidate;
    break;
  }
  searchDir = path.dirname(searchDir);
}

if (!pnpmDir) {
  console.error('ERROR: Could not find node_modules/.pnpm');
  process.exit(1);
}
console.log('Found pnpm store at:', pnpmDir);

// ── Patch targets ────────────────────────────────────────────────────────────
const targets = [];

for (const entry of fs.readdirSync(pnpmDir)) {
  const pkgRoot = path.join(pnpmDir, entry);

  if (entry.startsWith('react-native-reanimated@')) {
    const base = path.join(pkgRoot, 'node_modules', 'react-native-reanimated');
    // Compiled ESM (what Metro bundles on Android with new arch)
    targets.push(path.join(base, 'lib', 'module'));
    targets.push(path.join(base, 'lib', 'commonjs'));
    // TypeScript source (also bundled via worklet plugin)
    targets.push(path.join(base, 'src'));
    console.log('Targeting react-native-reanimated');
  }

  if (entry.startsWith('react-native-worklets@')) {
    const base = path.join(pkgRoot, 'node_modules', 'react-native-worklets');
    targets.push(path.join(base, 'lib', 'module'));
    targets.push(path.join(base, 'lib', 'commonjs'));
    targets.push(path.join(base, 'src'));
    console.log('Targeting react-native-worklets');
  }

  if (entry.startsWith('react-native-screens@')) {
    const base = path.join(pkgRoot, 'node_modules', 'react-native-screens');
    targets.push(path.join(base, 'lib', 'module'));
    targets.push(path.join(base, 'lib', 'commonjs'));
    console.log('Targeting react-native-screens');
  }

  if (entry.startsWith('react-native@')) {
    const base = path.join(pkgRoot, 'node_modules', 'react-native');
    targets.push(path.join(base, 'Libraries'));
    targets.push(path.join(base, 'src'));
    console.log('Targeting react-native');
  }
}

// ── Run patches ──────────────────────────────────────────────────────────────
for (const dir of targets) {
  if (fs.existsSync(dir)) {
    console.log('Scanning:', dir);
    patchDir(dir);
  }
}

console.log(`\nDone. Patched ${patchedCount} file(s).`);
