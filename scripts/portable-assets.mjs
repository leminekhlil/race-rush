// Renames binary assets of the portable build (static hosts that only serve web media types): *.glb/.ibl/.m4a → *.mp4 suffix.
import { readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../dist-portable/', import.meta.url).pathname;
for (const dir of ['models', 'env', 'audio']) {
  const d = join(root, dir);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) if (/\.(glb|ibl|m4a)$/.test(f)) renameSync(join(d, f), join(d, `${f}.mp4`));
}
rmSync(join(root, 'sw.js'), { force: true });
console.log('portable assets ready in dist-portable/');
