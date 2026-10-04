#!/usr/bin/env node
import { build } from 'esbuild';
await build({
  entryPoints: ['realtime/src/cloud-entry.ts'], outfile: 'dist-realtime/server.cjs',
  bundle: true, platform: 'node', target: 'node22', format: 'cjs', external: ['ws'],
});
