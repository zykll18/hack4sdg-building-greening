import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKGROUND_DEFAULTS, normalizeProjectBackground, validateSavedProjectBackground, isHongKongBackground } from '../src/domain/project-background.js';
import { projectBackgroundMarkup } from '../web/project-background.js';

const background = { ...BACKGROUND_DEFAULTS, city: ' 香港 ', buildingUse: 'office', projectStage: 'retrofit', budgetHkd: '0', irrigation: 'low', maintenance: '每月维护一次' };
test('confirmed background preserves an optional zero budget and unknown conditions without inventing facts', () => {
  const value = normalizeProjectBackground({ ...background, source: 'measured', arbitrary: 'discard' });
  assert.equal(value.city, '香港'); assert.equal(value.budgetHkd, 0); assert.equal(value.source, 'user-reported'); assert.equal(value.arbitrary, undefined);
  const report = projectBackgroundMarkup({...value,city:'<img src=x>',maintenance:'<script>unsafe</script>'});
  assert.ok(report.includes('&lt;img')); assert.ok(report.includes('&lt;script&gt;')); assert.ok(!report.includes('<script>'));
  const unknown = normalizeProjectBackground({ ...background, city: '不确定', buildingUse: 'unknown', projectStage: 'unknown', budgetHkd: '' });
  assert.equal(unknown.budgetHkd, null); assert.equal(unknown.buildingUse, 'unknown'); assert.equal(isHongKongBackground(unknown), false);
  for (const patch of [{city:''},{city:'x'.repeat(81)},{buildingUse:''},{buildingUse:['office']},{projectStage:'invented'},{budgetHkd:-1},{budgetHkd:Infinity},{budgetHkd:true},{irrigation:'invented'},{maintenance:'x'.repeat(301)},{version:'other'}]) assert.throws(() => normalizeProjectBackground({ ...background, ...patch }));
});
test('background backup keeps unfinished form values separate from confirmed model inputs', () => {
  const values = normalizeProjectBackground(background);
  const saved = validateSavedProjectBackground({confirmed:false,values,draft:{...BACKGROUND_DEFAULTS,city:'新加坡',budgetHkd:'-1'}});
  assert.equal(saved.confirmed,false); assert.equal(saved.values.city,'香港'); assert.equal(saved.draft.city,'新加坡');
  assert.equal(validateSavedProjectBackground(null),null);
  assert.throws(()=>validateSavedProjectBackground({confirmed:true,values:null,draft:BACKGROUND_DEFAULTS}));
  assert.throws(()=>validateSavedProjectBackground({confirmed:false,values:null,draft:{...BACKGROUND_DEFAULTS,buildingUse:'fake'}}));
});
