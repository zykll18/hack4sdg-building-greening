import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { filterPlantLibrary, plantSeasonLabel } from '../src/domain/plant-library.js';
const catalog = JSON.parse(readFileSync(new URL('../src/data/plants.json', import.meta.url)));

test('catalog search combines bilingual names, normalized input and independent filters', () => {
  assert.equal(filterPlantLibrary(catalog.plants, { query: '佛甲草' })[0].id, 'sedum-lineare');
  assert.equal(filterPlantLibrary(catalog.plants, { query: ' ＳＥＤＵＭ lineare ' })[0].id, 'sedum-lineare');
  assert.equal(filterPlantLibrary(catalog.plants, { query: 'STAR jasmine', region: 'roof' }).length, 0);
  assert.equal(filterPlantLibrary(catalog.plants, { query: 'STAR jasmine', region: 'facade', nativeOnly: true })[0].id, 'trachelospermum-jasminoides');
  assert.ok(filterPlantLibrary(catalog.plants, { nativeOnly: true }).every(p => p.nativeToHongKong === true));
  assert.equal(filterPlantLibrary(catalog.plants, { query: 'no such species' }).length, 0);
});

test('each bundled photo has matching licensed provenance and unmodified file hash', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/plants/library/manifest.json', import.meta.url)));
  for (const plant of catalog.plants) {
    const img = plant.image;
    assert.equal(img.src, `/plants/library/${plant.id}.jpg`);
    assert.equal(new URL(img.sourceUrl).hostname, 'commons.wikimedia.org');
    assert.ok(img.author && img.license && img.licenseUrl && img.changes);
    const file = readFileSync(new URL(`../public${img.src}`, import.meta.url));
    assert.equal(file[0], 0xff); assert.equal(file[1], 0xd8);
    assert.equal(file.length, img.bytes);
    assert.equal(createHash('sha256').update(file).digest('hex'), img.sha256);
    assert.equal(manifest[plant.id].sha256, img.sha256);
  }
});

test('unreviewed water quantities, size and planting seasons remain unknown', () => {
  for (const plant of catalog.plants) {
    assert.ok(Object.values(plant.waterRequirements).every(v => v === null));
    assert.ok(Object.values(plant.matureSize).every(v => v === null));
    assert.equal(plant.safetyNotes, null);
    assert.equal(plant.plantingMonths, null);
  }
  assert.match(plantSeasonLabel(catalog.plants[0]), /Floral interest.*4月, 5月/);
  assert.match(plantSeasonLabel(catalog.plants.find(p => p.id === 'ophiopogon-japonicus')), /Not recorded/);
});
