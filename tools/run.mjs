// Bundles a tools/*.ts file and runs it in Node.
// Usage: node tools/run.mjs <file.ts>
import { build } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.resolve(root, 'tools', process.argv[2]);
const outfile = path.join(root, 'node_modules', '.debug-bundle.mjs');

await build({
  input: entry,
  platform: 'node',
  output: { format: 'esm', file: outfile }
});

const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
process.exit(res.status ?? 1);
