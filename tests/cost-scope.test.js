import test from 'node:test';
import assert from 'node:assert/strict';
import { COST_FIELDS, assessProjectCost } from '../src/domain/cost-assessment.js';
import { historicalCostMarkup, costResultMarkup } from '../web/cost-inputs.js';
const q = value => ({value,date:'2026-10-15',source:'Synthetic test evidence',basis:'scenario'});
test('installation and maintenance alone complete the cost subtotal; old extra costs remain evidence outside scope',()=>{
  const input={basis:'test',installationHkd:q(1000),annualMaintenanceHkd:q(20),replacementHkd:q(900),endOfLifeHkd:q(100)};
  const value=assessProjectCost({input,basis:'test',years:20});
  assert.deepEqual(COST_FIELDS,['installationHkd','annualMaintenanceHkd']);
  assert.equal(value.status,'calculated'); assert.equal(value.totalCostHkd,1400);
  assert.equal(value.input.replacementHkd.value,900); assert.equal(value.replacementCostHkd,null);
  const html=costResultMarkup(value); assert.ok(!html.includes('<dt>更换</dt>')); assert.ok(!html.includes('<dt>处置</dt>'));
  assert.equal(assessProjectCost({input:{basis:'test',installationHkd:q(0),annualMaintenanceHkd:q(0)},basis:'test',years:20}).totalCostHkd,0);
  assert.equal(assessProjectCost({input:{basis:'test',installationHkd:q(1000)},basis:'test',years:20}).totalCostHkd,null);
});
test('online benchmark remains explicitly historical, labour-only and separate from current project quotes',()=>{
  const html=historicalCostMarkup(68.448);
  for(const text of ['2007-02','27,379','68,448','55–154','非全包','未作通胀','archsd.gov.hk']) assert.ok(html.includes(text),text);
  assert.equal(historicalCostMarkup(0),''); assert.equal(historicalCostMarkup(NaN),'');
  assert.equal(assessProjectCost({basis:'test',years:20}).installationCostHkd,null);
});
