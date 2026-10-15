import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CARBON_MODEL, estimateReferenceCarbon, normalizeCarbonModelSettings } from '../src/domain/carbon-model.js';
import { CURRENT_PLAN, calculateBeforeAfter } from '../src/domain/greening-plan.js';
import { HK_REFERENCE_CLIMATE } from '../src/data/carbon-model-evidence.js';
import { carbonModelMarkup, carbonCalculationMarkup, plantCarbonMarkup } from '../web/carbon-model.js';
import { summarizeWorkspace } from '../web/workspace-shell.js';
import { carbonBasis } from '../src/domain/carbon-assessment.js';
const roof = { id:'r', name:'Roof', type:'roof', globalId:'g', modelVersion:'v', projectId:'p',
  usableArea:{value:100,unit:'m2',provenance:'assumed',source:'Synthetic display-area fixture'}, planting:{plantId:'sedum-lineare',coverageFraction:.5},
  screening:{slopeScreening:{maxSourceSlopeDegrees:3}} };
const estimate = (settings={}, regions=[roof], years=20) => estimateReferenceCarbon({regions,plan:CURRENT_PLAN,years,settings:{...DEFAULT_CARBON_MODEL,...settings}});
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+' != '+b);
test('EPD area model preserves construction modules, material quantities and exclusions without claiming a full lifecycle',()=>{
  const value=estimate(); close(value.areaM2,50); close(value.upfrontKgCo2e,662.6);
  close(value.rows[0].quantities.substrateM3,3); close(value.rows[0].quantities.systemDryKg,3475);
  close(value.rows[0].quantities.systemSaturatedKg,4765);
  assert.equal(value.rows[0].quantities.drainageM2,50);
  assert.equal(value.modules.D,undefined); close(value.hypotheticalEndOfLifeKgCo2e,642.05);
  const idle=estimate({cooling:'unconditioned'}); close(idle.modelledScopeChangeKgCo2e.min,662.6); close(idle.modelledScopeChangeKgCo2e.max,662.6);
  assert.ok(value.exclusions.includes('Use-stage maintenance/replacement/irrigation'));
  assert.equal(value.reference.serviceLifeYears,null);
  assert.equal(calculateBeforeAfter({regions:[roof],years:20,carbonModelSettings:DEFAULT_CARBON_MODEL}).proposal.netDifferenceKgCo2e,null);
});
test('weather aggregates reproduce the hourly 26°C threshold; conduction sensitivity uses physical units and COP once',()=>{
  close(HK_REFERENCE_CLIMATE.degreeHoursByHour.reduce((a,b)=>a+b,0),7822);
  close(HK_REFERENCE_CLIMATE.degreeHoursByHour.slice(8,18).reduce((a,b)=>a+b,0),4569.5);
  const point=estimate({cooling:'conditioned',roofUMin:1,roofUMax:1,copMin:4,copMax:4,conductivityMin:.5,conductivityMax:.5});
  const expected=50*(1-1/(1+.06/.5))*4569.5/(1000*4);
  close(point.annualCoolingPotentialKwh.min,expected); close(point.annualCoolingPotentialKwh.max,expected);
  close(point.modelledScopeChangeKgCo2e.min,662.6-expected*.34*20);
  assert.ok(estimate({schedule:'continuous'}).annualCoolingPotentialKwh.max>estimate().annualCoolingPotentialKwh.max);
  assert.equal(estimate().annualCoolingPotentialKwh.min,0);
});
test('report reproduces the demo endpoints and separates the unknown cooling assumption from construction',()=>{
  const model=estimate({},[{...roof,usableArea:{...roof.usableArea,value:136.896}}]);
  close(model.areaM2,68.448); close(model.upfrontKgCo2e,907.072896);
  close(model.annualCoolingPotentialKwh.max,86.2822444137931);
  close(model.modelledScopeChangeKgCo2e.min,320.3536339862069);
  const html=carbonCalculationMarkup(model);
  assert.match(html,/13\.252/); assert.match(html,/907\.07 − 586\.72/); assert.match(html,/320\.35/);
  assert.match(html,/情景跨度，不是置信区间/); assert.match(html,/空调情况未确认/);
  const negative=carbonCalculationMarkup(estimate({},[roof],100));
  assert.match(negative,/减少 /); assert.ok(!negative.includes('增加 -'));
});
test('biological observations convert carbon mass once, remain study analogies and never become a long-term credit',()=>{
  const model=estimate({},[{...roof,usableArea:{...roof.usableArea,value:136.896}}]);
  const bio=model.biologicalReference;
  close(bio.studies[0].annualNetUptakeKgCo2PerM2,.35191*44/12);
  close(bio.studies[0].analogousAnnualNetUptakeKgCo2,68.448*.35191*44/12);
  close(bio.studies[1].analogousAnnualNetUptakeKgCo2,68.448*.092*44/12);
  assert.equal(bio.periodUptakeKgCo2,null); assert.equal(bio.includedInModelledScopeChange,false);
  close(estimate({},[roof],100).biologicalReference.studies[0].analogousAnnualNetUptakeKgCo2,estimate().biologicalReference.studies[0].analogousAnnualNetUptakeKgCo2);
  close(model.modelledScopeChangeKgCo2e.min,model.upfrontKgCo2e-model.annualCoolingPotentialKwh.max*.34*20);
  assert.match(plantCarbonMarkup(bio),/88/); assert.match(plantCarbonMarkup(bio),/不是本项目区间/); assert.match(plantCarbonMarkup(bio),/最后两年转为净排放/);
  assert.equal(estimate({},[{...roof,type:'facade',planting:{plantId:'ficus-pumila',coverageFraction:.5}}]).biologicalReference,null);
});
test('coverage, period and supplier change only the applicable quantities; no species or visual count creates a factor',()=>{
  const double=estimate({},[{...roof,planting:{...roof.planting,coverageFraction:1}}]);
  close(double.upfrontKgCo2e,2*estimate().upfrontKgCo2e);
  close(estimate({},[roof],40).upfrontKgCo2e,estimate().upfrontKgCo2e);
  assert.ok(estimate({},[roof],40).modelledScopeChangeKgCo2e.min<estimate().modelledScopeChangeKgCo2e.min);
  close(estimate({electricityFactorId:'hke-2025'}).annualCoolingPotentialKwh.max,estimate().annualCoolingPotentialKwh.max);
  assert.ok(estimate({electricityFactorId:'hke-2025'}).modelledScopeChangeKgCo2e.min<estimate().modelledScopeChangeKgCo2e.min);
  close(estimate({},[{...roof,planting:{...roof.planting,density:2}}]).upfrontKgCo2e,estimate().upfrontKgCo2e);
});
test('unsupported surfaces/species remain outside the total; steep roofs stay previewable with reference mismatch disclosed',()=>{
  const facade={...roof,id:'f',type:'facade',planting:{plantId:'ficus-pumila',coverageFraction:1}};
  const mixed=estimate({},[roof,facade]); close(mixed.areaM2,50); assert.equal(mixed.unmodelled.length,1);
  const unsupported=estimate({},[facade]); assert.equal(unsupported.status,'not-applicable'); assert.equal(unsupported.modelledScopeChangeKgCo2e,null);
  assert.equal(estimate({},[{...roof,planting:{plantId:'arachis-pintoi',coverageFraction:.5}}]).status,'not-applicable');
  const steep=estimate({},[{...roof,screening:{slopeScreening:{maxSourceSlopeDegrees:30}}}]);
  assert.equal(steep.status,'reference-estimate'); assert.ok(steep.rows[0].checks.some(x=>x.includes('8°')));
  assert.equal(estimate({},[{...roof,planting:{...roof.planting,coverageFraction:0}}]).status,'not-applicable');
});
test('model parameters reject invalid units/ranges and reference sources cannot be replaced by arbitrary fields',()=>{
  for(const change of [{roofUMin:0},{copMax:Infinity},{conductivityMin:2,conductivityMax:1},{electricityFactorId:'invented'},{cooling:'assume-true'},{version:'unknown'}]) {
    assert.throws(()=>normalizeCarbonModelSettings({...DEFAULT_CARBON_MODEL,...change}));
  }
  assert.equal(estimateReferenceCarbon({settings:null}),null);
  assert.equal(estimate({enabled:false}),null);
  const model=estimate({source:'<script>fake</script>'},[{...roof,name:'<script>name</script>'}]);
  const html=carbonModelMarkup(model); assert.ok(html.includes('&lt;script&gt;name')); assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('NEPD-11173-11173-2')&&html.includes('8760'));
  assert.ok(html.includes('未运行EnergyPlus')&&html.includes('不代表完整生命周期'));
});
test('Dashboard labels the model scope; complete project inputs retain priority without being overwritten by reference estimates',()=>{
  const modelled=calculateBeforeAfter({regions:[roof],years:20,carbonModelSettings:DEFAULT_CARBON_MODEL}).proposal;
  const summary=summarizeWorkspace({regions:[roof],results:[modelled],planId:'current',years:20});
  assert.equal(summary.carbonLabel,'碳排粗估（施工＋屋顶传热）'); assert.ok(summary.carbonDetail.includes('非整栋建筑'));
  const q=value=>({value,source:'Synthetic verification; not project evidence'});
  const measured=calculateBeforeAfter({regions:[roof],years:20,carbonModelSettings:DEFAULT_CARBON_MODEL,carbonEvidence:{
    basis:carbonBasis({regions:[roof],plan:CURRENT_PLAN,years:20}),upfrontKgCo2e:q(100),annualMaintenanceKgCo2e:q(0),replacementKgCo2e:q(0),endOfLifeKgCo2e:q(0),
    electricityFactorId:'clp-2025',energy:{baselineKwhPerYear:1000,afterKwhPerYear:900,basis:'measured',source:'Synthetic test fixture'}
  }}).proposal;
  close(measured.netDifferenceKgCo2e,-580);
  assert.ok(measured.carbonModel); assert.equal(summarizeWorkspace({regions:[roof],results:[measured],planId:'current',years:20}).carbon,'−0.58 tCO₂e');
});
