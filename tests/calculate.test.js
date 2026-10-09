import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario } from '../src/domain/calculate.js';
import { demoRoof, demoScenarios } from '../src/data/demo.js';

test('calculates traceable area, lifecycle cost, and carbon difference', () => {
  const result = calculateScenario({ roof: demoRoof, scenario: demoScenarios[0], years: 20 });
  assert.equal(result.coverageM2, 480);
  assert.equal(result.installationCostHkd, 576000);
  assert.equal(result.maintenanceCostHkd, 672000);
  assert.equal(result.installationKgCo2e, 48000);
  assert.equal(result.avoidedOperationalKgCo2e, 86400);
  assert.equal(result.netDifferenceKgCo2e, -38400);
  assert.equal(result.areaProvenance, 'assumed');
  assert.equal(result.roofElementId, 'DEMO-ROOF-01');
  assert.equal(result.factors.annualAvoidedKgCo2eM2.value, 9);
  assert.equal(result.factors.annualAvoidedKgCo2eM2.provenance, 'assumed');
  assert.match(result.factorSources.operationalSavings, /demo assumption/);
});

test('flags budget without hiding unresolved professional checks', () => {
  const result = calculateScenario({ roof: demoRoof, scenario: demoScenarios[1], years: 20, budgetHkd: 500000 });
  assert.ok(result.checks.some((check) => check.includes('budget')));
  assert.ok(result.checks.some((check) => check.includes('Structural')));
});

test('rejects invalid dimensions and missing provenance', () => {
  assert.throws(() => calculateScenario({ roof: demoRoof, scenario: { ...demoScenarios[0], coverageFraction: 1.1 }, years: 20 }), RangeError);
  assert.throws(() => calculateScenario({ roof: { ...demoRoof, usableArea: { value: 800, unit: 'ft2' } }, scenario: demoScenarios[0], years: 20 }), TypeError);
});
