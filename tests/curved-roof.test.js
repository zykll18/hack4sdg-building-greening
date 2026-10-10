import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { extractGreeningSurface, coveredSurface, cropGreeningSurface, offsetSurfacePositions } from '../src/adapters/greening-geometry.js';
import { screenRegion, screenSurfaceBySlope } from '../src/domain/region-screening.js';
import { createPlantingVisual } from '../src/adapters/planting-visuals.js';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
import { confirmRegionBatch } from '../src/domain/region-confirmation.js';

function barrel() {
  const points=[], indices=[], radius=6, length=10, segments=16;
  for(let i=0;i<=segments;i++) {
    const angle=(-40+i*5)*Math.PI/180;
    points.push(radius*Math.sin(angle),10+radius*Math.cos(angle),-length/2,radius*Math.sin(angle),10+radius*Math.cos(angle),length/2);
    if(i<segments){const a=i*2;indices.push(a,a+1,a+3,a,a+3,a+2);}
  }
  return {positions:new Float32Array(points),indices:new Uint32Array(indices),transform:new THREE.Matrix4()};
}
const roofSelection={category:'IFCROOF',name:'Curved roof',properties:[]};
const box={min:{x:-5,y:0,z:-5},max:{x:5,y:16,z:5}};
function area(positions){let result=0;for(let i=0;i<positions.length;i+=9){const a=new THREE.Vector3().fromArray(positions,i),b=new THREE.Vector3().fromArray(positions,i+3),c=new THREE.Vector3().fromArray(positions,i+6);result+=b.sub(a).cross(c.sub(a)).length()/2;}return result;}

test('curved roof retains mild central faces and excludes steep sides before crop, confirmation and both calculations',()=>{
  const mesh=barrel(),before=Array.from(mesh.positions),surface=extractGreeningSurface([mesh],new THREE.Matrix4(),'roof',new THREE.Vector3());
  const stats=surface.slopeScreening;
  assert.ok(stats.excludedAreaM2>0);
  assert.ok(Math.abs(stats.candidateAreaM2/stats.originalAreaM2-.5)<.00001);
  assert.ok(surface.triangles.every(t=>Math.acos(t.normal[1])*180/Math.PI<=20.00001));
  assert.equal(screenRegion({type:'roof',selection:roofSelection,surface,buildingBox:box}).canPrepare,true);
  const crop=cropGreeningSurface(surface,{side:'front',depth:2});
  assert.ok(Math.abs(crop.surfaceAreaM2/surface.surfaceAreaM2-.2)<.00001);
  assert.equal(crop.slopeScreening.excludedAreaM2,stats.excludedAreaM2);
  const screening=screenRegion({type:'roof',selection:roofSelection,surface:crop,buildingBox:box});
  const data={id:'curve',globalId:'curve-guid',type:'roof',modelVersion:'source-v1',projectId:'project',geometryAreaM2:crop.surfaceAreaM2,screening};
  assert.throws(()=>confirmRegionBatch({entries:[{data,area:stats.originalAreaM2}],constraintsConfirmed:true}),/within/);
  const [region]=confirmRegionBatch({entries:[{data,area:crop.surfaceAreaM2}],constraintsConfirmed:true});
  for(const plan of PLANS){
    const result=calculatePlan({regions:[region],plan,years:20});
    const positions=coveredSurface(crop,plan.profiles.roof.coverageFraction);
    assert.ok(Math.abs(area(positions)-result.coverageM2)<.0001);
    const group=createPlantingVisual({positions,type:'roof',planId:plan.id});
    assert.ok(Math.abs(group.userData.coverageM2-result.coverageM2)<.0001);
    const footprint=group.children.find(object=>object.name==='Calculated planting footprint');
    assert.equal(footprint.userData.coverageM2,group.userData.coverageM2);
    // The raised curved skin has its own physical area; it must not become the calculation area.
    assert.ok(Math.abs(area(footprint.geometry.attributes.position.array)-result.coverageM2)>.001);
    group.traverse(object=>{if(object.isInstancedMesh)object.dispose();object.geometry?.dispose();object.material?.map?.dispose();object.material?.dispose();});
  }
  assert.deepEqual(Array.from(mesh.positions),before);
});

test('a small steep section cannot pass because the overall average slope is low; fully steep roofs and terraces reject',()=>{
  const t=(angle,area)=>({points:[[0,10,0],[0,10,1],[1,10,1]],normal:[Math.sin(angle*Math.PI/180),Math.cos(angle*Math.PI/180),0],area});
  const mixed={triangles:[t(0,95),t(50,5)],surfaceAreaM2:100};
  const average=Math.acos((95+5*Math.cos(50*Math.PI/180))/100)*180/Math.PI;
  assert.ok(average<20);
  assert.equal(screenRegion({type:'roof',selection:roofSelection,surface:mixed,buildingBox:box}).canPrepare,false);
  const screened=screenSurfaceBySlope(mixed,'roof');assert.equal(screened.surfaceAreaM2,95);assert.equal(screened.slopeScreening.excludedAreaM2,5);
  assert.equal(screenRegion({type:'roof',selection:roofSelection,surface:screened,buildingBox:box}).canPrepare,true);
  const steep={triangles:[t(50,100)],surfaceAreaM2:100};assert.equal(screenSurfaceBySlope(steep,'roof').triangles.length,0);
  assert.equal(screenRegion({type:'roof',selection:roofSelection,surface:steep,buildingBox:box}).canPrepare,false);
  assert.equal(screenSurfaceBySlope(mixed,'terrace').surfaceAreaM2,95);
});

test('normal offsets follow a curved roof, keep seams welded and leave analytical coverage unchanged',()=>{
  const surface=extractGreeningSurface([barrel()],new THREE.Matrix4(),'roof',new THREE.Vector3());
  const positions=coveredSurface(surface,1),original=Array.from(positions),offset=.215,raised=offsetSurfacePositions(positions,offset);
  const shared=new Map();let sloped=false;
  for(let i=0;i<positions.length;i+=3){
    const source=Array.from(positions.slice(i,i+3)),point=Array.from(raised.slice(i,i+3)),key=source.join(',');
    if(shared.has(key))assert.deepEqual(point,shared.get(key));else shared.set(key,point);
    const delta=new THREE.Vector3().fromArray(point).sub(new THREE.Vector3().fromArray(source));
    assert.ok(Math.abs(delta.length()-offset)<.000002);
    if(Math.abs(delta.x)>.001)sloped=true;
    assert.equal(point[2],source[2]);
  }
  assert.ok(sloped,'offset follows roof normals rather than a universal vertical lift');
  assert.deepEqual(Array.from(positions),original);
  assert.ok(Math.abs(area(positions)-surface.surfaceAreaM2)<.0001);
});
