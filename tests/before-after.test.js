import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBeforeAfter, CURRENT_PLAN, PLANS } from '../src/domain/greening-plan.js';
import { carbonBasis } from '../src/domain/carbon-assessment.js';
import { comparisonOverviewMarkup } from '../web/comparison-presentation.js';
import { prepareAssistantPlantingUpdates } from '../web/assistant-planting.js';
import catalog from '../src/data/plants.json' with { type: 'json' };

const region = { id: 'wall', globalId: 'guid-wall', name: 'Wall', type: 'facade', projectId: 'p', modelVersion: 'v',
  usableArea: { value: 100, unit: 'm2', provenance: 'assumed', source: 'Display estimate' },
  planting: { plantId: 'ficus-pumila', coverageFraction: .25, density: 1 } };
const inputs = () => ({ regions: [structuredClone(region)], years: 20 });
const q = value => ({ value, source: 'Synthetic verification fixture only' });
function evidence(data) {
  return { basis: carbonBasis({ ...data, plan: CURRENT_PLAN }), upfrontKgCo2e: q(1000), annualMaintenanceKgCo2e: q(10),
    replacementKgCo2e: q(200), endOfLifeKgCo2e: q(100), electricityFactorId: 'clp-2025',
    energy: { baselineKwhPerYear: 1000, afterKwhPerYear: 500, basis: 'scenario', source: 'Synthetic matched-condition energy fixture' } };
}
test('only one adopted proposal is compared with the original, without inventing baseline total emissions', () => {
  assert.deepEqual(PLANS.map(plan => plan.id), ['current']);
  const data = inputs(), original = structuredClone(data), comparison = calculateBeforeAfter(data);
  assert.deepEqual(data, original);
  assert.equal(comparison.kind, 'original-vs-current');
  assert.equal(comparison.baseline.modelVersion, comparison.proposal.modelVersion);
  assert.equal(comparison.baseline.addedPlantingAreaM2, 0);
  assert.equal(comparison.baseline.incrementalInstallationCostHkd, 0);
  assert.equal(comparison.baseline.wholeBuildingCarbonKgCo2e, null);
  assert.equal(comparison.baseline.annualElectricityKwh, null);
  assert.equal(comparison.changes.periodCarbonKgCo2e, null);
  assert.equal(comparison.proposal.coverageM2, 25);
  assert.equal(comparison.changes.installationCostHkd, null);
});
test('matched original/after electricity remains separate from lifecycle net change in UI and exports', () => {
  const data = inputs(), comparison = calculateBeforeAfter({ ...data, carbonEvidence: evidence(data) });
  assert.equal(comparison.baseline.periodElectricityKgCo2e, 6800);
  assert.equal(comparison.proposal.periodElectricityKgCo2e, 3400);
  assert.equal(comparison.changes.periodCarbonKgCo2e, -1900);
  assert.equal(comparison.baseline.wholeBuildingCarbonKgCo2e, null);
  const output = JSON.parse(JSON.stringify(comparison));
  assert.equal(output.proposal.carbonAssessment.input.energy.source, evidence(data).energy.source);
  assert.equal(output.baseline.annualElectricityKwh, 1000);
  const html = comparisonOverviewMarkup(output);
  assert.ok(html.includes('6,800') && html.includes('3,400') && html.includes('−1,900'));
  assert.ok(html.includes('原始建筑') && !html.includes('Landscape mix') && !html.includes('Light-touch'));
});
test('adopted AI changes and subsequent user edits drive one proposal; previous carbon evidence becomes stale', () => {
  const data = inputs(), before = data.regions[0], carbonEvidence = evidence(data);
  const updates = prepareAssistantPlantingUpdates([{ globalId: before.globalId, type: before.type, plantId: 'trachelospermum-jasminoides', coverageFraction: .7 }], data.regions,
    [{ globalId: before.globalId, type: before.type, areaM2: 100, plantId: before.planting.plantId, coverageFraction: .25 }], catalog);
  const adopted = { ...before, planting: updates[0].planting };
  const comparison = calculateBeforeAfter({ ...data, regions: [adopted], carbonEvidence });
  assert.equal(comparison.proposal.coverageM2, 70);
  assert.equal(comparison.proposal.items[0].planting.plantId, 'trachelospermum-jasminoides');
  assert.equal(comparison.proposal.carbonAssessment.status, 'stale');
  assert.equal(comparison.baseline.annualElectricityKwh, null);
  assert.equal(comparison.changes.periodCarbonKgCo2e, null);
  const manual = calculateBeforeAfter({ ...data, regions: [{ ...adopted, planting: { ...adopted.planting, coverageFraction: .4 } }] });
  assert.equal(manual.proposal.coverageM2, 40);
  assert.equal(manual.proposal.items[0].planting.plantId, adopted.planting.plantId);
  assert.equal(manual.baseline.addedPlantingAreaM2, 0);
});
test('partial inputs leave lifecycle net unknown and reject overflowing absolute electricity totals', () => {
  const data = inputs(), partial = evidence(data); partial.replacementKgCo2e = null;
  const comparison = calculateBeforeAfter({ ...data, carbonEvidence: partial });
  assert.equal(comparison.baseline.periodElectricityKgCo2e, 6800);
  assert.equal(comparison.changes.periodCarbonKgCo2e, null);
  const overflow = evidence(data); overflow.energy.baselineKwhPerYear = overflow.energy.afterKwhPerYear = Number.MAX_VALUE;
  assert.throws(() => calculateBeforeAfter({ ...data, carbonEvidence: overflow }), /numeric range/);
});
