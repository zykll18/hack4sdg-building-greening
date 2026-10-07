import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'public/wasm'), { recursive: true });
await copyFile(resolve(root, 'node_modules/web-ifc/web-ifc.wasm'), resolve(root, 'public/wasm/web-ifc.wasm'));
await copyFile(resolve(root, 'node_modules/web-ifc/LICENSE.md'), resolve(root, 'public/wasm/LICENSE-web-ifc.md'));
