import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile(new URL('./asset-manifest.json', import.meta.url)));
const target = new URL('../public/assets/blender/scranton-office.glb', import.meta.url);
const digest = data => createHash('sha256').update(data).digest('hex');
try {
  if (digest(await readFile(target)) === manifest.sha256) {
    console.log('Office model already verified.');
    process.exit(0);
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Downloading office model (147 MB)…');
const response = await fetch(manifest.url);
if (!response.ok) throw new Error(`Asset download failed: HTTP ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (digest(data) !== manifest.sha256) throw new Error('Asset checksum mismatch; download was not saved.');
await mkdir(new URL('../public/assets/blender/', import.meta.url), { recursive: true });
const temporary = new URL(`${target.href}.download`);
await writeFile(temporary, data);
await rename(temporary, target);
console.log('Office model downloaded and verified.');
