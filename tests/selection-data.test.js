import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelection } from '../src/adapters/selection-data.js';

test('preserves IFC identity and scalar source properties without treating local ID as GlobalId', () => {
  const result = normalizeSelection({ modelVersion: 'sha256:abc', localId: 42, globalId: 'ifc-guid', category: 'IFCSLAB', data: { Name: { value: 'Roof slab' }, Tag: { value: 'S-01' }, IsDefinedBy: [{ Name: { value: 'Pset' } }] } });
  assert.equal(result.globalId, 'ifc-guid');
  assert.equal(result.name, 'Roof slab');
  assert.equal(result.category, 'IFCSLAB');
  assert.equal(result.modelVersion, 'sha256:abc');
  assert.equal(result.provenance, 'ifc');
  assert.equal(result.properties.length, 2);
  const missing = normalizeSelection({ modelVersion: 'sha256:def', localId: 42, data: {} });
  assert.equal(missing.globalId, null);
  assert.equal(missing.name, 'Unnamed component');
});
