import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAutomaticPlanting} from '../web/assistant-planting.js';
const catalog={plants:[{id:'vine',applicationRegions:['facade']}]};
const row=id=>({type:'facade',candidate:{globalId:id,localId:1,modelVersion:'v1',geometryAreaM2:100},area:{value:'80'}});
const proposal=(id,coverageFraction)=>({globalId:id,type:'facade',plantId:'vine',coverageFraction});
test('whole-building planting uses individual AI coverage and retains existing planting',()=>{
  const current=[{globalId:'old',planting:{plantId:'other',coverageFraction:.2}}], before=structuredClone(current);
  const result=prepareAutomaticPlanting([proposal('old',.9),proposal('a',.7),proposal('b',.35)],[row('old'),row('a'),row('b')],current,catalog,'v1');
  assert.deepEqual(result.requests.map(r=>[r.globalId,r.area,r.planting.coverageFraction]),[['a',80,.7],['b',80,.35]]);
  assert.deepEqual(current,before);
});
test('invalid or stale recommendations fail before a batch can be applied',()=>{
  for(const recs of [[proposal('a',NaN)],[proposal('a',0)],[proposal('a',1.1)],[proposal('a',.5),proposal('a',.6)],[proposal('missing',.5)]])assert.throws(()=>prepareAutomaticPlanting(recs,[row('a')],[],catalog,'v1'));
  assert.throws(()=>prepareAutomaticPlanting([proposal('a',.5)],[row('a')],[],catalog,'v2'));
});
