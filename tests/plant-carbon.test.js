import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plantCarbonEvidence, plantEvidenceSources } from '../src/domain/plant-carbon.js';
import { PLANT_CARBON_SOURCES } from '../src/data/plant-carbon-evidence.js';
const catalog=JSON.parse(readFileSync(new URL('../src/data/plants.json',import.meta.url)));
const plant=id=>catalog.plants.find(item=>item.id===id);
test('every catalog species records carbon evidence, sources and unknown project coefficients without conflating missing with zero',()=>{
  assert.equal(catalog.plants.length,30);
  for(const item of catalog.plants) {
    assert.equal(item.carbonEvidence.projectAnnualNetReductionKgCo2ePerM2,null);
    const result=plantCarbonEvidence(item);
    assert.equal(result.references.length,item.carbonEvidence.sourceIds.length);
    assert.equal(result.status,item.carbonEvidence.status);
    assert.equal(result.projectAnnualNetReductionKgCo2ePerM2,null);
    for(const reference of result.references) {
      assert.ok(reference.speciesIds.includes(item.id));assert.ok(new URL(reference.url).protocol==='https:');
      assert.ok(reference.observation && reference.applicability && reference.reviewedAt);
      assert.equal(reference.projectFactorEligible,false);
    }
  }
  assert.equal(new Set(PLANT_CARBON_SOURCES.map(source=>source.id)).size,PLANT_CARBON_SOURCES.length);
});
test('Sedum annual flux and Mondo first-year stock increase convert C to CO2 but remain distinct time and measurement boundaries',()=>{
  const sedum=plantCarbonEvidence(plant('sedum-lineare')).references[0];
  assert.ok(Math.abs(sedum.referenceValueKgCo2PerM2-.35191*44/12)<1e-10);
  assert.equal(sedum.referencePeriod,'annualized-observation');assert.equal(sedum.metric,'ecosystem-net-production');
  const mondo=plantCarbonEvidence(plant('ophiopogon-japonicus')).references[0];
  assert.ok(Math.abs(mondo.referenceValueKgCo2PerM2-1.034)<1e-10);
  assert.equal(mondo.referencePeriod,'first-year-only');assert.equal(mondo.metric,'first-year-stock-change');
});
test('related studies cannot supply a roof/wall annual factor; altered species references never inherit Sedum numbers',()=>{
  for(const item of catalog.plants.filter(p=>p.carbonEvidence.status==='related-evidence')) {
    assert.ok(plantCarbonEvidence(item).references.every(source=>source.referenceValueKgCo2PerM2===null));
  }
  const changed={...plant('ficus-pumila'),carbonEvidence:{sourceIds:['zhengzhou-sedum-lineare-2026','berlin-extensive-roof-2026','invented']}};
  const result=plantCarbonEvidence(changed);assert.equal(result.status,'data-needed');assert.deepEqual(result.references,[]);
  assert.equal(plantEvidenceSources(changed).length,changed.sources.length);
});
test('five requested screening estimates reproduce dry-biomass conversions and cannot turn into annual project credits',()=>{
  const others=catalog.plants.filter(item=>item.carbonEvidence.status==='related-evidence');
  assert.equal(others.length,5);
  for(const item of others) {
    const carbon=plantCarbonEvidence(item), e=carbon.estimate;
    assert.ok(e);assert.equal(e.projectFactorEligible,false);assert.equal(e.periodNetReductionKgCo2e,null);
    assert.equal(carbon.projectAnnualNetReductionKgCo2ePerM2,null);
    assert.equal(e.status,'modelled-biomass-potential-not-net-reduction');
    assert.ok(e.limitations.includes('不能')&&e.limitations.includes('分解'));
    assert.ok(plantEvidenceSources(item).some(source=>source.url==='https://doi.org/10.1016/j.ufug.2025.128951'));
    const range=e.annualBiomassCo2PotentialPerM2;
    if(item.id==='arachis-pintoi') {
      assert.ok(Math.abs(range.min-.8008)<1e-10);assert.ok(Math.abs(range.max-1.4784)<1e-10);
      assert.deepEqual(e.regionTypes,['ground']);
    } else {
      assert.ok(Math.abs(range.min-.1848)<1e-10);assert.ok(Math.abs(range.max-.9856)<1e-10);
      assert.deepEqual(e.regionTypes,['facade']);
    }
  }
  assert.equal(plantCarbonEvidence(plant('sedum-lineare')).estimate,null);
  const mismatch={...plant('ficus-pumila'),carbonEvidence:{estimateId:'arachis-forage-biomass-analogy-1'}};
  assert.equal(plantCarbonEvidence(mismatch).estimate,null);
});
