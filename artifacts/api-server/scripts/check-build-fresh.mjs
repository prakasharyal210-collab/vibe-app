import { statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(scriptDir, "..");
const srcDir = path.join(artifactDir, "src");
const distEntry = path.join(artifactDir, "dist", "index.mjs");

function newestMtimeMs(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeMs(full));
    } else if (entry.isFile()) {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

let distMtime;
try {
  distMtime = statSync(distEntry).mtimeMs;
} catch {
  console.error(
    `check-build-fresh: ${path.relative(process.cwd(), distEntry)} does not exist — run 'pnpm run build' before committing.`,
  );
  process.exit(1);
}

const newestSrcMtime = newestMtimeMs(srcDir);

if (newestSrcMtime > distMtime) {
  console.error(
    "check-build-fresh: dist/ is stale — run 'pnpm run build' before committing.",
  );
  process.exit(1);
}

process.exit(0);
