import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmRegionBatch } from '../src/domain/region-confirmation.js';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
const draft = (id, type, area = 40) => ({ data: { id, globalId: `guid-${id}`, modelVersion: 'source-1', projectId: 'project-1', type, geometryAreaM2: area, name: id, screening: { canPrepare: true, status: 'conditional', missing: ['Engineering review unresolved'] } }, area });
const confirm = (entries, existing = []) => confirmRegionBatch({ entries, existing, constraintsConfirmed: true });
test('a mixed-region set is confirmed together and both plans aggregate the entire set', () => {
 const entries = [draft('roof-a','roof'),draft('roof-b','roof',30),draft('wall','facade',60)];
 const before = structuredClone(entries);
 const regions = confirm(entries);
 assert.deepEqual(entries,before);
 assert.equal(regions.length,3);
 assert.ok(regions.every(region=>region.usableArea.provenance==='user-confirmed' && region.screening.status==='conditional'));
 for(const plan of PLANS){
  const result=calculatePlan({regions,plan,years:20});
  assert.equal(result.items.length,3);
  assert.ok(Math.abs(result.coverageM2 - (70*plan.profiles.roof.coverageFraction+60*plan.profiles.facade.coverageFraction))<1e-8);
 }
});
test('a later invalid area rejects the complete set without mutating existing or draft regions',()=>{
 const existing=confirm([draft('old','roof')]);
 const entries=[draft('new','facade'),{...draft('invalid','roof'),area:100}];
 const old=structuredClone(existing),before=structuredClone(entries);
 assert.throws(()=>confirm(entries,existing),/within each displayed region/);
 assert.deepEqual(existing,old);assert.deepEqual(entries,before);
 assert.ok(entries.every(entry=>!entry.data.usableArea));
});
test('duplicate components, old-model regions, failed screening and absent acknowledgement are rejected',()=>{
 const existing=confirm([draft('old','roof')]);
 assert.throws(()=>confirm([draft('old','facade')],existing),/already assigned/);
 const duplicate=draft('second','facade');duplicate.data.globalId='guid-first';
 assert.throws(()=>confirm([draft('first','roof'),duplicate]),/already assigned/);
 const stale=draft('new','roof');stale.data.modelVersion='source-2';
 assert.throws(()=>confirm([stale],existing),/same current model/);
 const blocked=draft('bad','terrace');blocked.data.screening.canPrepare=false;
 assert.throws(()=>confirm([blocked]),/failed compatibility/);
 assert.throws(()=>confirmRegionBatch({entries:[draft('a','roof')]}),/Confirm the exterior/);
 assert.throws(()=>confirm([]),/at least one/);
});
test('a ground rectangle cannot overlap an already confirmed ground region',()=>{
 const ground=draft('ground','ground');ground.data.placement={x:0,z:0,width:10,depth:6};ground.data.globalId=null;
 const existing=confirm([ground]);
 const other=draft('ground-2','ground');other.data.placement={x:3,z:0,width:5,depth:6};other.data.globalId=null;
 assert.throws(()=>confirm([other],existing),/Ground regions overlap/);
 other.data.placement.x=20;
 assert.equal(confirm([other],existing).length,1);
});

test('concept preview keeps estimates and never records acknowledgement or approval', async () => {
 const { previewRegionBatch } = await import('../src/domain/region-confirmation.js');
 const entries = [draft('concept-wall','facade',60), draft('concept-roof','roof',40)];
 const snapshot = structuredClone(entries);
 const regions = previewRegionBatch({entries});
 assert.deepEqual(entries,snapshot);
 assert.ok(regions.every(region => region.status === 'concept-preview' && region.constraintAcknowledgement === null && region.usableArea.provenance === 'assumed'));
 for (const plan of PLANS) assert.ok(calculatePlan({regions,plan,years:20}).coverageM2 > 0);
 const invalid = draft('bad-area','facade'); invalid.area=100;
 assert.throws(() => previewRegionBatch({entries:[draft('valid','facade'),invalid]}), /within each displayed region/);
 assert.throws(() => previewRegionBatch({entries:[draft('concept-wall','roof')],existing:regions}), /already assigned/);
 const blocked=draft('blocked','roof');blocked.data.screening.canPrepare=false;
 assert.throws(() => previewRegionBatch({entries:[blocked]}), /failed compatibility/);
 assert.deepEqual(entries,snapshot);
});


test('incremental preview keeps earlier locations and their explicit species/coverage while adding new ones', async () => {
 const { previewRegionBatch } = await import('../src/domain/region-confirmation.js');
 const wall = draft('existing-wall', 'facade', 60);
 wall.data.planting = {plantId:'trachelospermum-jasminoides',density:1,coverageFraction:.35};
 const existing = previewRegionBatch({entries:[wall]});
 const before = structuredClone(existing);
 const roof = draft('new-roof', 'roof', 40);
 roof.data.planting = {plantId:'sedum-lineare',density:1,coverageFraction:.7};
 const added = previewRegionBatch({entries:[roof],existing});
 assert.deepEqual(existing,before);
 const combined=[...existing,...added];
 for(const plan of PLANS) {
  const result=calculatePlan({regions:combined,plan,years:20});
  assert.equal(result.items.length,2);
  assert.ok(Math.abs(result.coverageM2-(60*.35+40*.7))<1e-8);
 }
 const invalid=draft('bad-new-roof','roof');invalid.area=100;
 assert.throws(()=>previewRegionBatch({entries:[invalid],existing:combined}),/within each displayed region/);
 assert.deepEqual(existing,before);
});
