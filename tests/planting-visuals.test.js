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
    assert.ok(names(light).includes('Folded foliage') || names(light).includes('Climbing leaves') || type==='ground');
    if(type==='facade') assert.ok(names(light).includes('Climbing vine stems'));
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


test('continuous roof beds preserve source holes and exact coverage',()=>{
  const parts=[patch({x:-3,width:4,depth:10}),patch({x:3,width:4,depth:10})],surface={triangles:parts.flatMap(p=>p.triangles),surfaceAreaM2:80},source=JSON.stringify(surface);
  const positions=coveredSurface(surface,.6,'source-guid');
  assert.deepEqual(positions,coveredSurface(surface,.6,'source-guid'));
  let area=0;
  for(let i=0;i<positions.length;i+=9){
    const a=new THREE.Vector3().fromArray(positions,i),b=new THREE.Vector3().fromArray(positions,i+3),c=new THREE.Vector3().fromArray(positions,i+6);area+=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;
    for(const p of [a,b,c,a.clone().add(b).add(c).multiplyScalar(1/3)])assert.ok(Math.abs(p.x)>=1-1e-6,'no patch bridges the source opening');
  }
  assert.ok(Math.abs(area-48)<.0001);
  assert.equal(JSON.stringify(surface),source);
  assert.equal(coveredSurface(surface,0).length,0);
  assert.throws(()=>coveredSurface(surface,1.1),RangeError);
});

test('climbing stems grow along the wall and stop at openings instead of becoming bushes or a solid wall layer',()=>{
  const parts=[patch({x:-2,width:2,depth:6}),patch({x:2,width:2,depth:6})];
  const horizontal=parts.flatMap(p=>p.triangles.flatMap(t=>t.points.flat())),positions=new Float32Array(horizontal);
  for(let i=0;i<positions.length;i+=3){positions[i+1]=positions[i+2]+3;positions[i+2]=0;}
  for(const planId of ['light','landscape']){
    const group=createPlantingVisual({positions,type:'facade',planId,seed:'window'}),stems=group.children.find(m=>m.name==='Climbing vine stems');
    assert.ok(stems?.count>5);assert.ok(group.children.find(m=>m.name==='Climbing leaves')?.count>20);
    assert.equal(group.children.find(m=>m.name==='Calculated planting footprint').visible,false);
    assert.ok(!group.children.some(m=>m.name==='Shrub and tree foliage'));
    for(let i=0;i<stems.count;i++){
      const matrix=new THREE.Matrix4();stems.getMatrixAt(i,matrix);
      for(const y of [-.5,0,.5]){
        const p=new THREE.Vector3(0,y,0).applyMatrix4(matrix);
        assert.ok(Math.abs(p.x)>=1-1e-6,'stem does not cross the opening');assert.ok(p.y>=-1e-6 && p.y<=6+1e-6);assert.ok(Math.abs(p.z)<.1);
      }
    }
    dispose(group);
  }
});


test('location stack puts new selections first, keeps edits/planting commits stable and reselects at the top',async()=>{
 const { createPlantingOrder }=await import('../src/domain/planting-selection.js');
 const order=createPlantingOrder();
 const a={key:'facade:a',coverage:.5},b={key:'facade:b',coverage:.5},c={key:'roof:c',coverage:.5};
 assert.deepEqual(order.sort([a]).map(item=>item.key),['facade:a']);
 assert.deepEqual(order.sort([a,b]).map(item=>item.key),['facade:b','facade:a']);
 assert.deepEqual(order.sort([a,b,c]).map(item=>item.key),['roof:c','facade:b','facade:a']);
 const edited={...a,coverage:.7,region:{id:'committed-a'}};
 const source=[c,edited,b];const snapshot=structuredClone(source);
 assert.deepEqual(order.sort(source).map(item=>item.key),['roof:c','facade:b','facade:a']);
 assert.deepEqual(source,snapshot);
 order.remove(a.key);order.sort([b,c]);
 assert.deepEqual(order.sort([b,c,edited]).map(item=>item.key),['facade:a','roof:c','facade:b']);
 order.clear();
 assert.deepEqual(order.sort([c,b]).map(item=>item.key),['facade:b','roof:c']);
});
