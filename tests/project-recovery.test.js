import test from 'node:test';
import { DEFAULT_CARBON_MODEL } from '../src/domain/carbon-model.js';
import assert from 'node:assert/strict';
import { PROJECT_SCHEMA, validateProjectSnapshot, verifyProjectFile, encodeProjectBackup, decodeProjectBackup } from '../src/domain/project-snapshot.js';
import { CURRENT_PLAN, calculateBeforeAfter } from '../src/domain/greening-plan.js';
import { assessProjectCost, costBasis } from '../src/domain/cost-assessment.js';
import { carbonBasis } from '../src/domain/carbon-assessment.js';
import { costResultMarkup } from '../web/cost-inputs.js';
import { normalizeProjectBackground, BACKGROUND_DEFAULTS } from '../src/domain/project-background.js';
import { createProjectStore } from '../web/project-store.js';

async function fixture() {
  const file = new File(['ISO-10303-21;\nfixture bytes for codec verification'], 'fixture.ifc');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const modelVersion = `sha256:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
  const regions = [{ id: `${modelVersion}:region:4`, modelVersion, projectId: 'LOCAL-BUILDING-REVIEW', type: 'ground',
    usableArea: { value: 20, unit: 'm2', provenance: 'assumed', source: 'Test area' }, planting: { plantId: 'arachis-pintoi', coverageFraction: .7, density: 1 },
    placement: { width: 10, depth: 4, offsetX: 0, offsetZ: 4 }, surfaceCrop: null }];
  const state = { schemaVersion: PROJECT_SCHEMA, savedAt: '2026-10-14T00:00:00Z', model: { modelVersion, fileName: file.name, sourceFormat: 'ifc' },
    inputs: { years: 20, budgetHkd: 0 }, regions, preview: 'before', camera: { position: [20, 20, 20], target: [0, 0, 0] },
    assistant: { turns: [{ question: 'Keep this plant', answer: '<b>Plain transcript</b>', reply: { answer: 'Prior answer', recommendations: [], changes: [{globalId:'old',coverageFraction:.9}], changeMode:'apply' } }], projectState: [] } };
  return { state, file };
}
const quote = value => ({ value, source: 'Synthetic quote worksheet; not actual project data', date: '2026-10-14', basis: 'scenario' });
test('local recovery preserves planting and preview together and accepts older image-free records',async()=>{
 const original=globalThis.indexedDB;let saved;
 const db={close(){},transaction(){const tx={objectStore:()=>({put(value){saved=structuredClone(value);queueMicrotask(()=>tx.oncomplete());},get(){const request={};queueMicrotask(()=>{request.result=saved;request.onsuccess();});return request;}})};return tx;}};
 globalThis.indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}};
 try{
  const {state,file}=await fixture(),store=createProjectStore(),preview='data:image/jpeg;base64,/9j/2Q==';
  await store.save(state,file,preview);
  const restored=await store.load();assert.equal(restored.preview,preview);assert.equal(restored.state.regions[0].planting.coverageFraction,.7);
  await assert.rejects(store.save(state,file,'https://untrusted.example/track.png'));
  assert.equal((await store.load()).preview,preview);
  delete saved.preview;assert.equal((await store.load()).preview,null);
 }finally{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;}
});
test('complete project recovery retains confirmed background and unfinished edits; old backups ask for background', async () => {
  const {state,file}=await fixture();
  const values=normalizeProjectBackground({...BACKGROUND_DEFAULTS,buildingName:'演示建筑 A',buildingUse:'school',projectStage:'new',budgetHkd:'50000',irrigation:'low'});
  state.projectBackground={confirmed:true,values,draft:{...BACKGROUND_DEFAULTS,buildingUse:'school',projectStage:'new',budgetHkd:'50000',irrigation:'low'}};
  const restored=await decodeProjectBackup(await encodeProjectBackup(state,file));
  assert.deepEqual(restored.state.projectBackground.values,values); assert.equal(restored.state.projectBackground.confirmed,true);
  state.projectBackground.confirmed=false;state.projectBackground.draft.city='新加坡';
  assert.equal((await decodeProjectBackup(await encodeProjectBackup(state,file))).state.projectBackground.draft.city,'新加坡');
  delete state.projectBackground;assert.equal(validateProjectSnapshot(state).projectBackground,null);
});
test('portable project round-trip preserves model bytes, region identity, coverage, zero budget and transcript without replaying edits', async () => {
  const { state, file } = await fixture(), encoded = await encodeProjectBackup(state, file), restored = await decodeProjectBackup(encoded);
  assert.equal(await restored.file.text(), await file.text());
  assert.equal(restored.state.regions[0].id, state.regions[0].id);
  assert.equal(restored.state.regions[0].planting.coverageFraction, .7);
  assert.equal(restored.state.inputs.budgetHkd, 0);
  assert.equal(restored.state.preview, 'before');
  assert.equal(restored.state.assistant.turns[0].answer, '<b>Plain transcript</b>');
  assert.deepEqual(restored.state.assistant.turns[0].reply.changes, []);
  assert.deepEqual(restored.state.camera, state.camera);
});
test('backup corruption, wrong model, duplicate regions, invalid geometry inputs and report files fail before restoring', async () => {
  const { state, file } = await fixture();
  await assert.rejects(verifyProjectFile(state, new File(['tampered'], file.name)), /checksum/);
  await assert.rejects(decodeProjectBackup(JSON.stringify({ schemaVersion: 'building-greening-regions-3' })), /backup/);
  assert.throws(() => validateProjectSnapshot({ ...state, regions: [...state.regions, ...state.regions] }), /unique/);
  assert.throws(() => validateProjectSnapshot({ ...state, regions: [{ ...state.regions[0], modelVersion: 'old' }] }), /match/);
  assert.throws(() => validateProjectSnapshot({ ...state, regions: [{ ...state.regions[0], planting: { plantId: 'not-in-library' } }] }), /plant/);
  const parsed = JSON.parse(await encodeProjectBackup(state, file)); parsed.modelFile.base64 = parsed.modelFile.base64.slice(4);
  await assert.rejects(decodeProjectBackup(JSON.stringify(parsed)), /embedded/);
});
test('quoted costs preserve evidence, period arithmetic, budget and unknowns without per-area demo prices', async () => {
  const { state } = await fixture(), data = { regions: state.regions, years: 20, plan: CURRENT_PLAN }, basis = costBasis(data);
  const input = { basis, installationHkd: quote(1000), annualMaintenanceHkd: quote(10), replacementHkd: quote(200), endOfLifeHkd: quote(0) };
  const result = assessProjectCost({ input, basis, years: 20 });
  assert.equal(result.totalCostHkd, 1200); assert.equal(result.scope, 'installation-and-maintenance-only'); assert.equal(result.input.replacementHkd.value, 200); assert.equal(result.replacementCostHkd, null); assert.equal(result.maintenanceCostHkd, 200);
  const comparison = calculateBeforeAfter({ ...data, budgetHkd: 0, costEvidence: input });
  assert.equal(comparison.proposal.withinBudget, false); assert.equal(comparison.proposal.installationCostHkd, 1000);
  assert.equal(comparison.proposal.items[0].installationCostHkd, null);
  assert.equal(calculateBeforeAfter(data).proposal.installationCostHkd, null);
  assert.equal(assessProjectCost({ input: { ...input, annualMaintenanceHkd: null }, basis, years: 20 }).totalCostHkd, null);
  assert.equal(assessProjectCost({ input, basis: 'changed-regions', years: 20 }).status, 'stale');
  const html = costResultMarkup(result); assert.ok(html.includes('2026-10-14') && html.includes('Synthetic quote'));
});
test('source, date, currency unit and finite nonnegative cost validation remain required, including explicit zeros', async () => {
  const { state } = await fixture(), basis = costBasis({ regions: state.regions, plan: CURRENT_PLAN, years: 20 });
  for (const change of [{value:-1}, {value:Infinity}, {source:''}, {date:'2026-02-31'}, {unit:'USD'}, {basis:'verified-by-ai'}]) {
    assert.throws(() => assessProjectCost({ input: { basis, installationHkd: { ...quote(0), ...change } }, basis, years: 20 }));
  }
  const result = assessProjectCost({ input: { basis, installationHkd: { ...quote(0), source:'<script>unsafe</script>' } }, basis, years: 20 });
  assert.ok(costResultMarkup(result).includes('&lt;script&gt;')); assert.ok(!costResultMarkup(result).includes('<script>'));
});
test('accepted carbon/cost sources and raw form drafts survive portable backups with their original basis', async () => {
  const { state, file } = await fixture(), basis = carbonBasis({ regions: state.regions, plan: CURRENT_PLAN, years: 20 });
  state.cost = { accepted: { basis, installationHkd: quote(1000) }, fields: { installationHkd: {amount:'1000',source:'Draft source'} } };
  state.carbon = [{ planId: 'current', accepted: { basis, upfrontKgCo2e: { value: 100, source:'Test material worksheet' }, electricityFactorId:'clp-2025', energy:null }, fields:{baselineKwhPerYear:'2500'} }];
  const restored = await decodeProjectBackup(await encodeProjectBackup(state,file));
  assert.equal(restored.state.cost.accepted.installationHkd.source, quote(1000).source);
  assert.equal(restored.state.carbon[0].accepted.basis, basis);
  assert.equal(restored.state.carbon[0].fields.baselineKwhPerYear, '2500');
});
test('reference model parameters and uncommitted edits survive backups without turning into project measurements', async () => {
  const { state, file } = await fixture();
  state.carbonModel = {settings:{...DEFAULT_CARBON_MODEL,cooling:'conditioned'},pending:true,fields:{roofUMax:'1.4',cooling:'conditioned',enabled:true}};
  const restored=await decodeProjectBackup(await encodeProjectBackup(state,file));
  assert.equal(restored.state.carbonModel.settings.roofUMax,2);
  assert.equal(restored.state.carbonModel.fields.roofUMax,'1.4');
  assert.equal(restored.state.carbonModel.pending,true);
  assert.throws(()=>validateProjectSnapshot({...state,carbonModel:{...state.carbonModel,settings:{...DEFAULT_CARBON_MODEL,copMin:0}}}),/parameter/);
});
