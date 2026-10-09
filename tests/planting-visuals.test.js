import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundSurface, coveredSurface } from '../src/adapters/greening-geometry.js';
import { samplePlantingSites, footprintFits, createPlantingVisual } from '../src/adapters/planting-visuals.js';

function dispose(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => { if (object.geometry) geometries.add(object.geometry); for (const material of [].concat(object.material ?? [])) materials.add(material); });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) { if (material.map) textures.add(material.map); material.dispose(); }
  for (const texture of textures) texture.dispose();
}
const patch = ({x=0,z=0,width=2,depth=2}={}) => groundSurface({x,y:0,z,width,depth});
test('seeded sampling stays inside disconnected surfaces and leaves a footprint clear of holes and edges',()=>{
  const parts = [patch({x:-2,width:2,depth:6}),patch({x:2,width:2,depth:6})];
  const surface = {triangles:parts.flatMap(p=>p.triangles),surfaceAreaM2:24};
  const options = {spacing:.65,radius:.22,max:40,seed:'stable-source-guid'};
  const before = JSON.stringify(surface), sites = samplePlantingSites(surface,options);
  assert.ok(sites.length>10);
  assert.deepEqual(sites,samplePlantingSites(surface,options));
  assert.ok(sites.every(site=>footprintFits(surface,site.position,site.normal,.22)));
  assert.ok(sites.every(site=>Math.abs(site.position[0])>=1.22));
  assert.equal(footprintFits(surface,[0,0,0],[0,1,0],.22),false);
  assert.equal(JSON.stringify(surface),before);
});
test('a large mesh with only two triangles receives area-based planting density and a bounded instance count',()=>{
  const sites=samplePlantingSites(patch({width:20,depth:12}),{spacing:1,radius:.3,max:50,seed:'density'});
  assert.equal(sites.length,50);
  assert.throws(()=>samplePlantingSites(patch(),{spacing:0,radius:.2}),RangeError);
});
test('all four concept systems preserve analytical coverage while plans have distinct decorative geometry',()=>{
  const horizontal=coveredSurface(patch({width:12,depth:8}),.6);
  const facade=new Float32Array(horizontal); for(let i=0;i<facade.length;i+=3){const z=facade[i+2];facade[i+2]=2;facade[i+1]=z+4;}
  for(const type of ['roof','facade','terrace','ground']) {
    const positions=type==='facade'?facade:horizontal;
    const original=Array.from(positions), light=createPlantingVisual({positions,type,planId:'light',seed:'source'}), dense=createPlantingVisual({positions,type,planId:'landscape',seed:'source'});
    assert.ok(Math.abs(light.userData.coverageM2-57.6)<.002);
    assert.ok(Math.abs(dense.userData.coverageM2-light.userData.coverageM2)<.002);
    assert.deepEqual(Array.from(positions),original);
    const names=group=>group.children.map(child=>child.name);
    assert.ok(names(light).includes('Folded foliage') || type==='ground');
    if(type==='facade') assert.ok(names(light).includes('Climber support stems'));
    if(type==='terrace') assert.ok(names(light).includes('Terrace planter boxes'));
    if(type==='ground') assert.ok(names(dense).includes('Tree trunks'));
    for(const group of [light,dense]) group.traverse(object=>{
      if(!object.isInstancedMesh)return;
      const matrix=new THREE.Matrix4();
      for(let i=0;i<object.count;i++){object.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));}
    });
    dispose(light);dispose(dense);
  }
});
test('zero planted coverage produces no decorative plants',()=>{
  const group=createPlantingVisual({positions:new Float32Array(),type:'roof',planId:'light'});
  assert.equal(group.children.length,0);assert.equal(group.userData.coverageM2,0);
});
