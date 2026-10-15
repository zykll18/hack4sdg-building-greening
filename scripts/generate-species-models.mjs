import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SPECIES_MODELS, speciesModelParts, disposeSpeciesModel } from '../src/adapters/species-models.js';

// GLTFExporter uses the browser FileReader API; Node already supplies Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const folder = new URL('../public/plants/species/', import.meta.url);
await mkdir(folder, { recursive: true });
const manifest = { version: '2026-10-11', author: 'Building Greening project', method: 'Authored procedural geometry', accuracy: 'Concept appearance and proportions; not measured mature specimens', models: {} };
for (const id of Object.keys(SPECIES_MODELS)) {
  const group = new THREE.Group(); group.name = id;
  group.userData = { plantId: id, modelKind: 'procedural-concept', dimensions: 'Authored display proportions; not verified mature size' };
  for (const part of speciesModelParts(id)) { const mesh = new THREE.Mesh(part.geometry, part.material); mesh.name = part.name; group.add(mesh); }
  const binary = await new GLTFExporter().parseAsync(group, { binary: true });
  const data = Buffer.from(binary); await writeFile(new URL(`${id}.glb`, folder), data);
  manifest.models[id] = { src: `/plants/species/${id}.glb`, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length };
  disposeSpeciesModel(group); process.stdout.write(`${id}: ${data.length} bytes\n`);
}
await writeFile(new URL('manifest.json', folder), JSON.stringify(manifest, null, 2) + '\n');
const catalogUrl = new URL('../src/data/plants.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
for (const plant of catalog.plants) {
  if (!manifest.models[plant.id]) throw new Error(`No generated model for ${plant.id}`);
  plant.visualModel = { ...plant.visualModel, ...manifest.models[plant.id] };
}
await writeFile(catalogUrl, JSON.stringify(catalog, null, 2) + '\n');
