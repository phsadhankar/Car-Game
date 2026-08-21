// Bundles tools/physics-test.ts and runs it in Node.
import { build } from 'rolldown';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outfile = path.join(root, 'node_modules', '.physics-test.mjs');

await build({
  input: path.join(root, 'tools', 'physics-test.ts'),
  platform: 'node',
  output: { format: 'esm', file: outfile }
});

const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
process.exit(res.status ?? 1);
