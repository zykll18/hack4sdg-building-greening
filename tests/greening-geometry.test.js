import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundSurface, extractGreeningSurface, coveredSurface, cropGreeningSurface } from '../src/adapters/greening-geometry.js';
function meshArea(positions) {
  let sum=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<positions.length;i+=9){a.fromArray(positions,i);b.fromArray(positions,i+3);c.fromArray(positions,i+6);sum+=b.sub(a).cross(c.sub(a)).length()/2;}return sum;
}
test('visual coverage has the same proportional surface area and before data is untouched',()=>{
  const surface=groundSurface({x:100,y:4,z:-200,width:10,depth:6});
  const original=JSON.stringify(surface);
  for(const fraction of [0,.35,.6,1]) assert.ok(Math.abs(meshArea(coveredSurface(surface,fraction))-surface.surfaceAreaM2*fraction)<.001);
  assert.equal(JSON.stringify(surface),original);
});
test('world transforms and face orientation select top or outward facade rather than both sides',()=>{
  const positions=new Float32Array([0,0,0,0,0,4,3,0,4,3,0,0]);
  const mesh={positions,indices:new Uint32Array([0,1,2,0,2,3,2,1,0,3,2,0]),transform:new THREE.Matrix4().makeTranslation(10,2,20)};
  const surface=extractGreeningSurface([mesh],new THREE.Matrix4().makeTranslation(100,5,0),'roof',new THREE.Vector3());
  assert.equal(surface.surfaceAreaM2,12);
  assert.equal(surface.triangles.length,2);
  assert.equal(surface.triangles[0].points[0][0],110);
  assert.equal(surface.triangles[0].points[0][1],7);
  assert.throws(()=>extractGreeningSurface([mesh],new THREE.Matrix4(),'facade',new THREE.Vector3()), /No suitable/);
  const vertical={positions:new Float32Array([2,0,0,2,3,0,2,3,4,2,0,4]),indices:new Uint32Array([0,1,2,0,2,3]),transform:new THREE.Matrix4()};
  assert.equal(extractGreeningSurface([vertical],new THREE.Matrix4(),'facade',new THREE.Vector3()).surfaceAreaM2,12);
});
test('rejects invalid ground dimensions and visual coverage',()=>{
  assert.throws(()=>groundSurface({x:0,y:0,z:0,width:-2,depth:6}),RangeError);
  assert.throws(()=>coveredSurface(groundSurface({x:0,y:0,z:0,width:2,depth:6}),1.5),RangeError);
});

test('edge strips preserve triangle boundaries and reduce usable geometry area',()=>{
  const surface=groundSurface({x:0,y:0,z:0,width:10,depth:6});
  const cropped=cropGreeningSurface(surface,{side:'front',depth:2});
  assert.ok(Math.abs(cropped.surfaceAreaM2-20)<1e-8);
  assert.ok(cropped.triangles.every(t=>t.points.every(p=>p[2]>=1-1e-8)));
  assert.ok(Math.abs(meshArea(coveredSurface(cropped,.6))-12)<1e-5);
  assert.equal(surface.surfaceAreaM2,60);
});
