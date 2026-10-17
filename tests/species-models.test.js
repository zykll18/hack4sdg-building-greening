import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createSpeciesModel, disposeSpeciesModel, SPECIES_MODELS } from '../src/adapters/species-models.js';
import { createPlantingVisual } from '../src/adapters/planting-visuals.js';
import { groundSurface, coveredSurface } from '../src/adapters/greening-geometry.js';
import { normalizePlantingSelection, plantingProfile } from '../src/domain/planting-selection.js';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
const catalog = JSON.parse(readFileSync(new URL('../src/data/plants.json', import.meta.url)));

test('all thirty catalog species have finite, distinct concept models and self-contained GLBs', () => {
  const manifest=JSON.parse(readFileSync(new URL('../public/plants/species/manifest.json',import.meta.url)));
  assert.deepEqual(Object.keys(SPECIES_MODELS).sort(),catalog.plants.map(p=>p.id).sort());
  const hashes=new Set();
  for(const plant of catalog.plants) {
    const model=createSpeciesModel(plant.id),box=new THREE.Box3().setFromObject(model);
    assert.ok(model.children.length && !box.isEmpty());assert.ok([...box.min.toArray(),...box.max.toArray()].every(Number.isFinite));
    assert.equal(model.userData.modelKind,'procedural-concept');
    const file=readFileSync(new URL(`../public${plant.visualModel.src}`,import.meta.url));
    assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(4),2);assert.equal(file.readUInt32LE(8),file.length);
    const hash=createHash('sha256').update(file).digest('hex');assert.equal(hash,plant.visualModel.sha256);assert.equal(hash,manifest.models[plant.id].sha256);hashes.add(hash);
    const json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());assert.ok(json.meshes.length);assert.ok(json.buffers.every(b=>!b.uri));assert.equal(json.nodes.find(n=>n.extras?.plantId)?.extras.plantId,plant.id);
    disposeSpeciesModel(model);
  }
  assert.equal(hashes.size,30);
});

test('species assignment rejects wrong location, unknown identity and invalid density/coverage',()=>{
  assert.equal(normalizePlantingSelection({},'roof',catalog).plantId,'sedum-lineare');
  assert.throws(()=>normalizePlantingSelection({plantId:'ficus-pumila'},'roof',catalog),/not mapped/);
  assert.throws(()=>normalizePlantingSelection({plantId:'invented'},'facade',catalog),/not mapped/);
  for(const density of [0,3,NaN])assert.throws(()=>normalizePlantingSelection({density},'roof',catalog),/density/);
  for(const coverageFraction of [-.1,1.1,NaN])assert.throws(()=>normalizePlantingSelection({coverageFraction},'roof',catalog),/coverage/);
  assert.equal(normalizePlantingSelection({coverageFraction:0},'roof',catalog).coverageFraction,0);
});

test('every supported species/location makes decorative geometry without changing footprint or source',()=>{
  const horizontal=coveredSurface(groundSurface({x:0,y:0,z:0,width:9,depth:8}),1);
  for(const plant of catalog.plants)for(const type of plant.applicationRegions) {
    const positions=new Float32Array(horizontal);
    if(type==='facade')for(let i=0;i<positions.length;i+=3){positions[i+1]=positions[i+2]+4;positions[i+2]=0;}
    const source=Array.from(positions),group=createPlantingVisual({positions,type,planId:'light',seed:'model-test',planting:normalizePlantingSelection({plantId:plant.id},type,catalog)});
    assert.equal(group.userData.plantId,plant.id);assert.ok(Math.abs(group.userData.coverageM2-72)<.001);assert.deepEqual(Array.from(positions),source);
    assert.ok(group.children.some(o=>o.isInstancedMesh));
    group.traverse(o=>{if(o.isInstancedMesh){const m=new THREE.Matrix4();for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}}});
    disposeSpeciesModel(group);
  }
});

test('visual density changes clump count while coverage remains fixed; zero area makes no plants',()=>{
  const positions=coveredSurface(groundSurface({x:0,y:0,z:0,width:8,depth:8}),.4,'stable');
  const make=density=>createPlantingVisual({positions,type:'roof',planId:'light',seed:'density-test',planting:{plantId:'sedum-lineare',density}});
  const sparse=make(.5),dense=make(2);
  assert.ok(dense.userData.clumpCount>sparse.userData.clumpCount);assert.equal(sparse.userData.coverageM2,dense.userData.coverageM2);
  disposeSpeciesModel(sparse);disposeSpeciesModel(dense);
  const empty=createPlantingVisual({positions:new Float32Array(),type:'roof',planId:'light',planting:{plantId:'sedum-lineare',density:1}});assert.equal(empty.children.length,0);
});

test('chosen coverage uses one fraction in visuals/calculations; species and density add no invented factors',()=>{
  const surface=groundSurface({x:0,y:0,z:0,width:10,depth:10});
  const region={id:'r',name:'roof',globalId:'g',type:'roof',projectId:'p',modelVersion:'v',usableArea:{value:80,unit:'m2',provenance:'user-confirmed',source:'Reviewed'},planting:normalizePlantingSelection({coverageFraction:.25},'roof',catalog)};
  for(const plan of PLANS) {
    const result=calculatePlan({regions:[region],plan,years:20});assert.equal(result.coverageM2,20);assert.equal(result.items[0].factors.coverageFraction,.25);
    const profile=plantingProfile(region,plan),positions=coveredSurface(surface,80/100*profile.coverageFraction,'g'),visual=createPlantingVisual({positions,type:'roof',planId:plan.id,planting:region.planting});
    assert.ok(Math.abs(visual.userData.coverageM2-result.coverageM2)<.001);disposeSpeciesModel(visual);
    const other={...region,planting:normalizePlantingSelection({plantId:'arachis-pintoi',density:2,coverageFraction:.25},'roof',catalog)};
    const next=calculatePlan({regions:[other],plan,years:20});assert.equal(next.totalCostHkd,result.totalCostHkd);assert.equal(next.netDifferenceKgCo2e,result.netDifferenceKgCo2e);
    assert.equal(next.items[0].planting.plantId,'arachis-pintoi');
    assert.equal(plantingProfile({...region,planting:{coverageFraction:null}},plan).coverageFraction,plan.profiles.roof.coverageFraction);
  }
});

test('all twelve climbing species stop stems at facade openings',()=>{
  const a=groundSurface({x:-2,y:0,z:0,width:2,depth:6}),b=groundSurface({x:2,y:0,z:0,width:2,depth:6});
  const positions=new Float32Array([...a.triangles,...b.triangles].flatMap(t=>t.points.flat()));
  for(let i=0;i<positions.length;i+=3){positions[i+1]=positions[i+2]+3;positions[i+2]=0;}
  for(const plantId of ['ficus-pumila','trachelospermum-jasminoides','parthenocissus-dalzielii','bougainvillea-spectabilis','pyrostegia-venusta','thunbergia-grandiflora','antigonon-leptopus','campsis-grandiflora','epipremnum-aureum','lonicera-japonica','quisqualis-indica','tristellateia-australasiae']) {
    const group=createPlantingVisual({positions,type:'facade',planId:'light',seed:'holes',planting:{plantId,density:1}}),stems=group.children.find(m=>m.name==='Climbing vine stems');assert.ok(stems?.count>0);
    for(let i=0;i<stems.count;i++){const matrix=new THREE.Matrix4();stems.getMatrixAt(i,matrix);for(const y of [-.5,0,.5])assert.ok(Math.abs(new THREE.Vector3(0,y,0).applyMatrix4(matrix).x)>=1-1e-6);}
    disposeSpeciesModel(group);
  }
});
