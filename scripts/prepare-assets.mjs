import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'public/wasm'), { recursive: true });
await copyFile(resolve(root, 'node_modules/web-ifc/web-ifc.wasm'), resolve(root, 'public/wasm/web-ifc.wasm'));
await copyFile(resolve(root, 'node_modules/web-ifc/LICENSE.md'), resolve(root, 'public/wasm/LICENSE-web-ifc.md'));

// Store the large published sample compressed; serve its original IFC bytes locally.
const residentialIfc = gunzipSync(await readFile(resolve(root, 'public/samples/Schependomlaan.ifc.gz')));
if (createHash('sha256').update(residentialIfc).digest('hex') !== '2c3565ca1904f2aa61adab92024cf3755b2c5b21a498144d3094d7cb58cebec7') {
  throw new Error('The bundled residential IFC does not match its published source checksum');
}
await writeFile(resolve(root, 'public/samples/Schependomlaan.ifc'), residentialIfc);
