import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendPlants, plantQuestion, isPlantQuestion, normalizePlantConditions, buildPlantRecommendationContext, validatePlantModelReply } from '../src/domain/plant-recommendations.js';
const catalog = JSON.parse(readFileSync(new URL('../src/data/plants.json', import.meta.url)));

test('reviewed catalog has unique identities, source links and explicit unknowns', () => {
  assert.equal(new Set(catalog.plants.map(plant => plant.id)).size, catalog.plants.length);
  for (const plant of catalog.plants) {
    assert.ok(plant.referenceSoilDepthMm.min > 0);
    assert.ok(plant.referenceSoilDepthMm.max >= plant.referenceSoilDepthMm.min);
    assert.equal(new URL(plant.sources[0].url).hostname, 'www.greening.gov.hk');
    assert.equal(plant.plantingMonths, null);
    assert.equal(plant.modelAssetId, null);
    assert.ok(Object.values(plant.tolerances).every(value => value === true || value === null));
  }
  assert.equal(catalog.plants.find(plant => plant.id === 'ophiopogon-japonicus').seasonalInterest, null);
});

test('shallow low-water roof narrows to Sedum; unknowns never establish approval', () => {
  const result = recommendPlants(catalog, { region: 'roof', soilDepthMm: 150, irrigation: 'low', month: 4 });
  assert.deepEqual(result.candidates.map(candidate => candidate.plantId), ['sedum-lineare']);
  assert.equal(result.candidates[0].status, 'conditional');
  assert.ok(result.candidates[0].checks.some(check => check.includes('light')));
  assert.ok(result.excluded.find(candidate => candidate.plantId === 'arachis-pintoi').reasons.some(reason => reason.includes('Irrigation')));
  assert.equal(recommendPlants(catalog, { region: 'roof', soilDepthMm: 50 }).candidates.length, 0);
});

test('month reorders ornamental preference without excluding perennial candidates', () => {
  const input = { region: 'roof', soilDepthMm: 250, irrigation: 'moderate' };
  const april = recommendPlants(catalog, { ...input, month: 4 });
  const june = recommendPlants(catalog, { ...input, month: 6 });
  assert.equal(april.candidates[0].plantId, 'sedum-lineare');
  assert.equal(june.candidates[0].plantId, 'arachis-pintoi');
  assert.deepEqual(april.candidates.map(candidate => candidate.plantId).sort(), june.candidates.map(candidate => candidate.plantId).sort());
  const shady = recommendPlants(catalog, { ...input, light: 'shade' });
  assert.ok(shady.candidates.find(candidate => candidate.plantId === 'ophiopogon-japonicus').checks.some(check => check.includes('light')));
});

test('facade rooting system is required even for self-clinging plants', () => {
  assert.equal(recommendPlants(catalog, { region: 'facade', facadeSystem: 'unavailable' }).candidates.length, 0);
  const shallow = recommendPlants(catalog, { region: 'facade', soilDepthMm: 250, irrigation: 'moderate' });
  assert.deepEqual(shallow.candidates.map(candidate => candidate.plantId), ['asparagus-densiflorus-myersii', 'ficus-pumila']);
  assert.ok(shallow.candidates.find(candidate => candidate.plantId === 'ficus-pumila').checks.some(check => check.includes('wall finish')));
});

test('explicit text inputs support bilingual units and reject ambiguous / invalid conditions', () => {
  assert.deepEqual(plantQuestion('屋顶植物，15厘米，少浇水，4月'), { region: 'roof', soilDepthMm: 150, irrigation: 'low', month: 4 });
  assert.deepEqual(plantQuestion('facade plants in April, partial shade'), { region: 'facade', light: 'partial-shade', month: 4 });
  assert.equal(isPlantQuestion('Where can I add planting?'), false);
  assert.equal(isPlantQuestion('Which roof plants should we use?'), true);
  assert.throws(() => plantQuestion('plants for roof and facade'), /one planting/);
  assert.throws(() => normalizePlantConditions(plantQuestion('roof plants, -20mm')), /positive/);
  assert.throws(() => plantQuestion('roof plants, 150mm or 300mm'), /one soil/);
  for (const input of [{ soilDepthMm: -1 }, { soilDepthMm: Infinity }, { month: 13 }, { month: 1.5 }, { light: 'guessed' }, { irrigation: 'guessed' }]) assert.throws(() => normalizePlantConditions(input));
});

test('AI handoff rejects species outside screened shortlist and preserves authoritative metadata', () => {
  const result = recommendPlants(catalog, { region: 'roof', soilDepthMm: 150, irrigation: 'low' });
  const context = buildPlantRecommendationContext(catalog, result, 'building-version-1');
  assert.equal(context.modelVersion, 'building-version-1');
  assert.throws(() => validatePlantModelReply({ recommendations: [{ plantId: 'invented-tree', explanation: 'Suitable' }] }, context));
  assert.throws(() => validatePlantModelReply({ recommendations: [{ plantId: 'arachis-pintoi', explanation: 'Suitable' }] }, context));
  assert.throws(() => validatePlantModelReply({ recommendations: Array(2).fill({ plantId: 'sedum-lineare', explanation: 'Suitable' }) }, context));
  const [validated] = validatePlantModelReply({ recommendations: [{ plantId: 'sedum-lineare', explanation: 'Draft', plant: { scientificName: 'Fake name' } }] }, context);
  assert.equal(validated.plant.scientificName, 'Sedum lineare');
  assert.equal(validated.status, 'conditional');
  assert.equal(validated.draftExplanation, 'Draft');
});
