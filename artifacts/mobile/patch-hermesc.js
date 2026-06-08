/**
 * EAS build post-install hook  (eas-build-post-install)
 *
 * hermesc (bundled with RN 0.81.x) cannot compile private class field
 * syntax (#field). Several packages ship compiled JS with private fields
 * in their lib/module/ or lib/commonjs/ directories:
 *
 *   react-native-reanimated, react-native-worklets,
 *   react-native-screens, react-native (Libraries/, src/)
 *
 * This script rewrites every occurrence before Metro bundles them so
 * hermesc never sees #field syntax.
 *
 * Works with BOTH pnpm virtual store (.pnpm/) and flat npm/yarn layouts.
 */

const fs = require('fs');
const path = require('path');

let patchedCount = 0;

// ── File patcher ─────────────────────────────────────────────────────────────
function patchFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  if (!content.includes('#')) return;

  // Pass 1 – class body declarations (line-start whitespace + optional modifiers + #name)
  let patched = content.replace(
    /(^|[\r\n])([ \t]+(?:(?:readonly|private|public|protected|static|abstract|declare)\s+)*)#([a-zA-Z_][a-zA-Z0-9_]*)/g,
    '$1$2_PRIV_$3'
  );

  // Pass 2 – member access: this.#name
  patched = patched.replace(/this\.#([a-zA-Z_][a-zA-Z0-9_]*)/g, 'this._PRIV_$1');

  // Pass 3 – any remaining bare #name (static contexts, #name in obj checks)
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

// ── Locate node_modules ───────────────────────────────────────────────────────
let nodeModulesDir = null;
let searchDir = __dirname;
for (let i = 0; i < 10; i++) {
  const candidate = path.join(searchDir, 'node_modules');
  if (fs.existsSync(candidate)) {
    nodeModulesDir = candidate;
    break;
  }
  searchDir = path.dirname(searchDir);
}

if (!nodeModulesDir) {
  console.warn('WARNING: Could not find node_modules — skipping private field patch.');
  process.exit(0);
}
console.log('Found node_modules at:', nodeModulesDir);

// ── Detect layout: pnpm virtual store vs flat ─────────────────────────────────
const pnpmDir = path.join(nodeModulesDir, '.pnpm');
const isPnpm = fs.existsSync(pnpmDir);

console.log('Layout:', isPnpm ? 'pnpm virtual store' : 'flat (npm/yarn)');

// ── Build list of target directories ─────────────────────────────────────────
const targets = [];

if (isPnpm) {
  // pnpm: packages live at node_modules/.pnpm/<name@ver>/node_modules/<name>/
  for (const entry of fs.readdirSync(pnpmDir)) {
    const pkgRoot = path.join(pnpmDir, entry);

    if (entry.startsWith('react-native-reanimated@')) {
      const base = path.join(pkgRoot, 'node_modules', 'react-native-reanimated');
      targets.push(
        path.join(base, 'lib', 'module'),
        path.join(base, 'lib', 'commonjs'),
        path.join(base, 'src')
      );
      console.log('Targeting react-native-reanimated (pnpm)');
    }
    if (entry.startsWith('react-native-worklets@')) {
      const base = path.join(pkgRoot, 'node_modules', 'react-native-worklets');
      targets.push(
        path.join(base, 'lib', 'module'),
        path.join(base, 'lib', 'commonjs'),
        path.join(base, 'src')
      );
      console.log('Targeting react-native-worklets (pnpm)');
    }
    if (entry.startsWith('react-native-screens@')) {
      const base = path.join(pkgRoot, 'node_modules', 'react-native-screens');
      targets.push(
        path.join(base, 'lib', 'module'),
        path.join(base, 'lib', 'commonjs')
      );
      console.log('Targeting react-native-screens (pnpm)');
    }
    if (entry.startsWith('react-native@')) {
      const base = path.join(pkgRoot, 'node_modules', 'react-native');
      targets.push(
        path.join(base, 'Libraries'),
        path.join(base, 'src')
      );
      console.log('Targeting react-native (pnpm)');
    }
  }
} else {
  // flat layout: packages live directly at node_modules/<name>/
  const packages = [
    { name: 'react-native-reanimated', dirs: ['lib/module', 'lib/commonjs', 'src'] },
    { name: 'react-native-worklets',   dirs: ['lib/module', 'lib/commonjs', 'src'] },
    { name: 'react-native-screens',    dirs: ['lib/module', 'lib/commonjs'] },
    { name: 'react-native',            dirs: ['Libraries', 'src'] },
  ];
  for (const pkg of packages) {
    const base = path.join(nodeModulesDir, pkg.name);
    if (fs.existsSync(base)) {
      for (const d of pkg.dirs) {
        targets.push(path.join(base, d));
      }
      console.log('Targeting', pkg.name, '(flat)');
    }
  }
}

// ── Run patches ───────────────────────────────────────────────────────────────
for (const dir of targets) {
  if (fs.existsSync(dir)) {
    console.log('Scanning:', dir);
    patchDir(dir);
  }
}

console.log(`\nDone. Patched ${patchedCount} file(s).`);
