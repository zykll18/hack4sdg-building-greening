import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as WebIFC from 'web-ifc';
import { IfcImporter } from '@thatopen/fragments';

const path = process.argv[2];
if (!path) throw new TypeError('Provide an IFC path: npm run test:ifc -- /path/to/model.ifc');
const bytes = new Uint8Array(await readFile(path));
const root = resolve(import.meta.dirname, '..');
const api = new WebIFC.IfcAPI();
await api.Init((name) => resolve(root, 'node_modules/web-ifc', name));
let modelId;
let geometryCount;
let schema;
try {
  modelId = api.OpenModel(bytes);
  schema = api.GetModelSchema(modelId);
  const geometry = api.LoadAllGeometry(modelId);
  geometryCount = geometry.size();
  if (!geometryCount) throw new Error('The IFC has no supported display geometry');
  const item = api.GetLine(modelId, geometry.get(0).expressID);
  if (!item.GlobalId?.value) throw new Error('The first display component has no GlobalId');
} finally {
  if (modelId !== undefined) api.CloseModel(modelId);
  api.Dispose();
}
const importer = new IfcImporter();
importer.wasm = { path: resolve(root, 'node_modules/web-ifc') + '/', absolute: true };
const fragment = await importer.process({ bytes });
if (!fragment.byteLength) throw new Error('IFC conversion returned an empty Fragments asset');
console.log(JSON.stringify({ schema, geometryCount, convertedFragmentBytes: fragment.byteLength }));
