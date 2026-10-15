import test from 'node:test';
import assert from 'node:assert/strict';
import { assessInterventionCarbon, carbonBasis } from '../src/domain/carbon-assessment.js';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
import { ELECTRICITY_FACTORS, GREEN_ROOF_EPD } from '../src/data/carbon-evidence.js';
import { carbonResultMarkup, carbonValue } from '../web/carbon-presentation.js';

const q = value => ({ value, source: 'Synthetic project worksheet; test only' });
const region = { id: 'r', type: 'roof', modelVersion: 'v', projectId: 'p', usableArea: { value: 100, unit: 'm2', provenance: 'assumed', source: 'Display geometry' }, planting: { plantId: 'sedum-lineare', coverageFraction: .5 } };
const basis = (years = 20, regions = [region], plan = PLANS[0]) => carbonBasis({ regions, plan, years });
const input = (factor = 'clp-2025') => ({
  basis: basis(), upfrontKgCo2e: q(1000), annualMaintenanceKgCo2e: q(10), replacementKgCo2e: q(200), endOfLifeKgCo2e: q(100),
  electricityFactorId: factor, energy: { baselineKwhPerYear: 1000, afterKwhPerYear: 500, source: 'Synthetic matched weather / use fixture', basis: 'scenario' }
});
const assess = value => assessInterventionCarbon({ input: value, basis: basis(), years: 20 });

test('official electricity factors retain provider, year, CO2e units and primary-source locators', () => {
  assert.deepEqual(ELECTRICITY_FACTORS.map(f => [f.id, f.year, f.value, f.unit]), [['clp-2025', 2025, .34, 'kgCO2e/kWh'], ['hke-2025', 2025, .59, 'kgCO2e/kWh']]);
  assert.ok(ELECTRICITY_FACTORS.every(f => f.url.startsWith('https://') && f.locator));
});
test('no project data produces unknown totals rather than zero or legacy per-area savings', () => {
  for (const plan of PLANS) {
    const result = calculatePlan({ regions: [region], plan, years: 20 });
    assert.equal(result.netDifferenceKgCo2e, null);
    assert.equal(result.installationKgCo2e, null);
    assert.equal(result.avoidedOperationalKgCo2e, null);
    assert.equal(result.carbonAssessment.status, 'data-needed');
    assert.ok(result.carbonAssessment.missing.length >= 6);
  }
  assert.equal(carbonValue(null), '待补数据 / Data needed');
});
test('period modules and matched electricity difference calculate once, with supplier-dependent results', () => {
  const clp = assess(input());
  assert.equal(clp.operationalChangeKgCo2e, -3400);
  assert.equal(clp.maintenanceKgCo2e, 200);
  assert.equal(clp.netDifferenceKgCo2e, -1900);
  assert.equal(clp.status, 'calculated');
  assert.equal(clp.input.upfrontKgCo2e.provenance, 'user-provided');
  assert.equal(clp.electricityFactor.provenance, 'published-provider');
  assert.equal(assess(input('hke-2025')).netDifferenceKgCo2e, -4400);
  const increase = input(); increase.energy.afterKwhPerYear = 1200;
  assert.equal(assess(increase).operationalChangeKgCo2e, 1360);
  assert.equal(assess(increase).netDifferenceKgCo2e, 2860);
});
test('missing lifecycle modules leave net unknown while known energy change remains visible', () => {
  const partial = input(); delete partial.replacementKgCo2e;
  const result = assess(partial);
  assert.equal(result.operationalChangeKgCo2e, -3400);
  assert.equal(result.netDifferenceKgCo2e, null);
  assert.ok(result.missing.includes('replacementKgCo2e'));
  const unknownProvider = input(); delete unknownProvider.electricityFactorId;
  assert.equal(assess(unknownProvider).operationalChangeKgCo2e, null);
});
test('blank sources, malformed units, invented factors, incomplete energy pairs and overflow fail validation', () => {
  const invalid = input(); invalid.upfrontKgCo2e.source = ' ';
  assert.throws(() => assess(invalid), /source/);
  const units = input(); units.upfrontKgCo2e.unit = 'tCO2e';
  assert.throws(() => assess(units), /unit/);
  assert.throws(() => assess(input('made-up')), /Unreviewed/);
  const energy = input(); energy.energy.afterKwhPerYear = null;
  assert.throws(() => assess(energy), /Energy/);
  const large = input(); large.annualMaintenanceKgCo2e.value = Number.MAX_VALUE;
  assert.throws(() => assess(large), /range/);
  const negative = input(); negative.replacementKgCo2e.value = -1;
  assert.throws(() => assess(negative), /non-negative/);
});
test('changed model, coverage, species, selection, plan or period invalidates totals; region reordering does not', () => {
  const changes = [
    { ...region, modelVersion: 'new' }, { ...region, usableArea: { ...region.usableArea, value: 90 } },
    { ...region, planting: { ...region.planting, coverageFraction: .6 } }, { ...region, planting: { ...region.planting, plantId: 'arachis-pintoi' } }
  ];
  for (const changed of changes) {
    const result = assessInterventionCarbon({ input: input(), basis: basis(20, [changed]), years: 20 });
    assert.equal(result.status, 'stale'); assert.equal(result.netDifferenceKgCo2e, null);
  }
  for (const current of [basis(30), basis(20, [region], { ...PLANS[0], id: 'another-proposal' }), basis(20, [region, { ...region, id: 'r2' }])]) {
    assert.equal(assessInterventionCarbon({ input: input(), basis: current, years: 20 }).status, 'stale');
  }
  const regions = [region, { ...region, id: 'other' }];
  assert.equal(basis(20, regions), basis(20, [...regions].reverse()));
});
test('EPD modules are not silently treated as a complete lifecycle or credited into a project', () => {
  const modules = GREEN_ROOF_EPD.modules;
  assert.ok(Math.abs(modules['A1-A3'] + modules.A4 + modules.A5 - 13.252) < 1e-10);
  assert.ok(GREEN_ROOF_EPD.undeclared.includes('B2') && GREEN_ROOF_EPD.undeclared.includes('B6'));
  const extra = { ...input(), moduleD: -100000, sequestrationKgCo2e: 100000 };
  assert.equal(assess(extra).netDifferenceKgCo2e, -1900);
});
test('exports preserve sources and method, and source strings cannot inject report HTML', () => {
  const dangerous = input(); dangerous.upfrontKgCo2e.source = '<script>alert(1)</script>';
  const plan = calculatePlan({ regions: [region], plan: PLANS[0], years: 20, carbonEvidence: dangerous });
  const json = JSON.parse(JSON.stringify(plan));
  assert.equal(json.carbonAssessment.electricityFactor.year, 2025);
  assert.equal(json.carbonAssessment.input.energy.source, dangerous.energy.source);
  assert.ok(json.carbonAssessment.method.exclusions.includes('Module D credits'));
  const html = carbonResultMarkup(plan.carbonAssessment);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('2025') && html.includes('0.34'));
});
