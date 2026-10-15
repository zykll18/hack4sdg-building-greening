import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adoptedPlantingReport,adoptedPlantingMarkup} from '../web/report-planting.js';
const catalog=JSON.parse(readFileSync(new URL('../src/data/plants.json',import.meta.url)));
const version='current';
const region={id:'r',globalId:'g',modelVersion:version,name:'Roof',type:'roof',usableArea:{value:100},planting:{plantId:'sedum-lineare',coverageFraction:.4}};
const plan={plantingMethod:'Concept',substrate:'Guide 100–200mm',planter:'Review fixings',irrigation:'Water point unknown',checks:['Confirm load']};
const rec={globalId:'g',type:'roof',plantId:'sedum-lineare',coverageFraction:.4,plantingPlan:plan,explanation:'Reviewed plant traits'};
test('reader report includes adopted AI configuration while excluding unadopted candidates and old model regions',()=>{
 const rows=adoptedPlantingReport({regions:[region,{...region,id:'old',modelVersion:'old'}],turns:[{reply:{recommendations:[rec,{...rec,globalId:'unadopted'}]}}],catalog,modelVersion:version});
 assert.equal(rows.length,1);assert.equal(rows[0].areaM2,40);assert.equal(rows[0].origin,'adopted-ai');assert.deepEqual(rows[0].plantingPlan,plan);
 assert.match(adoptedPlantingMarkup(rows),/100–200mm/);assert.match(adoptedPlantingMarkup(rows),/Sedum lineare/);
});
test('manual species or coverage edits cannot be mislabelled as an unchanged AI recommendation; report escapes text',()=>{
 const input={regions:[{...region,planting:{...region.planting,coverageFraction:.6}}],turns:[{reply:{recommendations:[rec]}}],catalog,modelVersion:version};
 const row=adoptedPlantingReport(input)[0];assert.equal(row.origin,'existing-or-manual');assert.equal(row.plantingPlan,null);assert.equal(row.areaM2,60);
 const html=adoptedPlantingMarkup([{...row,name:'<script>bad</script>'}]);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
});
