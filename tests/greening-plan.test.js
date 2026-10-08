import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
const region = (id, type, value) => ({ id, type, name: id, modelVersion: 'sha256:model', projectId: 'project', globalId: `guid-${id}`, geometrySource: 'IFC display geometry', usableArea: { value, unit: 'm2', provenance: 'user-confirmed', source: 'Area confirmed in presentation' } });

test('four region types share identities, scope and additive results across both plans', () => {
  const regions = [region('roof','roof',100),region('wall','facade',80),region('terrace','terrace',30),region('ground','ground',60)];
  for (const plan of PLANS) {
    const result = calculatePlan({ regions, plan, years: 20 });
    assert.deepEqual(result.items.map((item) => item.regionId), regions.map((item) => item.id));
    assert.equal(result.items.length, 4);
    assert.equal(result.totalCostHkd, result.items.reduce((sum,item) => sum+item.totalCostHkd,0));
    assert.equal(result.netDifferenceKgCo2e, result.items.reduce((sum,item) => sum+item.netDifferenceKgCo2e,0));
    assert.equal(result.items.find((item) => item.regionType==='ground').avoidedOperationalKgCo2e, 0);
    assert.match(result.scope, /not a whole-building/);
    assert.ok(result.items.every((item) => item.areaProvenance==='user-confirmed' && item.factors.installationKgCo2eM2.provenance==='assumed'));
  }
});
test('aggregate budget is checked even when individual region costs fit', () => {
  const regions=[region('a','roof',100),region('b','roof',100)];
  const result=calculatePlan({regions,plan:PLANS[0],years:20,budgetHkd:100000});
  assert.ok(result.items.every((item)=>item.installationCostHkd<100000));
  assert.ok(result.checks.some((check)=>check.includes('Total installation')));
});
test('rejects duplicate regions, mixed model versions, empty plans and invalid area',()=>{
  const a=region('a','roof',100);
  assert.throws(()=>calculatePlan({regions:[a,a],plan:PLANS[0],years:20}), /unique/);
  assert.throws(()=>calculatePlan({regions:[a,{...region('b','ground',10),modelVersion:'old'}],plan:PLANS[0],years:20}), /same model/);
  assert.throws(()=>calculatePlan({regions:[],plan:PLANS[0],years:20}), /at least one/);
  assert.throws(()=>calculatePlan({regions:[region('bad','facade',-1)],plan:PLANS[0],years:20}), RangeError);
});
