import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
import { summarizeWorkspace } from '../web/workspace-shell.js';
import { carbonBasis } from '../src/domain/carbon-assessment.js';

const model = { fileName: 'project.ifc', componentCount: 42, sourceFormat: 'ifc' };
const facade = coverageFraction => ({
  id: 'facade-1', type: 'facade', name: 'Facade F01', modelVersion: 'model-1', projectId: 'project-1',
  usableArea: { value: 100, unit: 'm2', provenance: 'assumed', source: 'IFC display geometry' },
  planting: { plantId: 'ficus-pumila', coverageFraction, density: 1 }
});
function state(coverageFraction, years = 20, withCarbon = false) {
  const regions = [facade(coverageFraction)];
  const q = value => ({ value, source: 'Synthetic test input; not a real project estimate' });
  return { model, regions, years, planId: 'current', results: PLANS.map(plan => calculatePlan({ regions, plan, years, carbonEvidence: withCarbon ? {
    basis: carbonBasis({ regions, plan, years }), upfrontKgCo2e: q(800), annualMaintenanceKgCo2e: q(0), replacementKgCo2e: q(0), endOfLifeKgCo2e: q(0),
    electricityFactorId: 'clp-2025', energy: { baselineKwhPerYear: 1000, afterKwhPerYear: 900, basis: 'scenario', source: 'Synthetic comparable-energy fixture' }
  } : undefined })) };
}

test('Dashboard area and cost follow the actual coverage calculation rather than sample project metrics', () => {
  const first = summarizeWorkspace(state(.25));
  const changed = summarizeWorkspace(state(.75));
  assert.equal(first.area, '25 m²');
  assert.equal(changed.area, '75 m²');
  assert.equal(first.cost, '费用待补');
  assert.equal(changed.cost, '费用待补');
  assert.equal(changed.locations, '1');
  assert.equal(changed.modelName, 'project.ifc');
});

test('Dashboard carbon uses the comparison period, keeps its sign, and labels increases and reductions', () => {
  const twenty = summarizeWorkspace(state(.75, 20, true));
  const thirty = summarizeWorkspace(state(.75, 30, true));
  assert.equal(twenty.carbon, '+0.12 tCO₂e');
  assert.equal(twenty.carbonDetail, '20-year input estimate · increase');
  assert.equal(thirty.carbon, '−0.22 tCO₂e');
  assert.equal(thirty.carbonDetail, '30-year input estimate · reduction');
  assert.equal(summarizeWorkspace(state(.75)).carbon, '待补数据');
  assert.equal(summarizeWorkspace(state(.75)).plan, '当前绿化方案 / Current planting');
});

test('An empty or replaced building never retains old model impact figures', () => {
  const empty = summarizeWorkspace({ model: null, regions: [], results: [], planId: 'current', years: 20 });
  assert.equal(empty.area, '—');
  assert.equal(empty.cost, '—');
  assert.equal(empty.carbon, '—');
  assert.equal(empty.locations, '0');
  const replaced = summarizeWorkspace({ model: { ...model, fileName: 'new.ifc' }, regions: [], results: [], planId: 'current', years: NaN });
  assert.equal(replaced.modelName, 'new.ifc');
  assert.equal(replaced.carbon, '—');
  assert.equal(replaced.years, 'Check inputs');
});
