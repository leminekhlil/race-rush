#!/usr/bin/env node
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || resolve(root, 'dist-hostinger-realtime'));
await mkdir(out, { recursive: true });
// Keep ws external: Hostinger's LiteSpeed launcher integrates with the installed module.
execFileSync(resolve(root, 'node_modules/.bin/esbuild'), [
  'realtime/src/hostinger-entry.ts', '--bundle', '--platform=node', '--target=node20',
  '--format=cjs', `--outfile=${resolve(out, 'realtime.cjs')}`, '--external:ws',
], { cwd: root, stdio: 'inherit' });
await copyFile(resolve(root, 'deploy/realtime/hostinger/server.js'), resolve(out, 'server.js'));
await writeFile(resolve(out, 'package.json'), JSON.stringify({
  name: 'racerush-realtime-hostinger', version: '0.9.1', private: true, type: 'commonjs',
  scripts: { start: 'node server.js' }, engines: { node: '>=20' }, dependencies: { ws: '8.18.3' },
}, null, 2) + '\n');
console.log(`Hostinger package ready: ${out}`);
