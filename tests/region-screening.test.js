import test from 'node:test';
import assert from 'node:assert/strict';
import { screenRegion, assessRoofForm, assessRoofAssemblies } from '../src/domain/region-screening.js';
import { groundSurface } from '../src/adapters/greening-geometry.js';
const buildingBox = { min: {x:-5,y:0,z:-5}, max: {x:5,y:10,z:5} };
const surface = groundSurface({x:0,y:10,z:0,width:4,depth:4});
const selection = (category,name,properties=[]) => ({category,name,properties});
const screen = (type, item, geometry=surface) => screenRegion({type,selection:item,surface:geometry,buildingBox});
test('rejects ordinary interior floors as roof or terrace, while explicit flat roof remains conditional',()=>{
 assert.equal(screen('roof',selection('IFCSLAB','Floor'),groundSurface({x:0,y:3,z:0,width:4,depth:4})).canPrepare,false);
 assert.equal(screen('terrace',selection('IFCSLAB','Floor')).canPrepare,false);
 assert.equal(screen('roof',selection('IFCWINDOW','Roof window')).canPrepare,false);
 const roof=screen('roof',selection('IFCROOF','Roof'));
 assert.equal(roof.status,'conditional');
 assert.ok(roof.missing.some(reason=>reason.includes('loading')));
 assert.equal(screen('terrace',selection('IFCSLAB','Outdoor terrace')).canPrepare,true);
});
test('rejects steep roof concepts and known internal walls',()=>{
 const sloped={...surface,triangles:surface.triangles.map(triangle=>({...triangle,normal:[0,Math.cos(Math.PI/4),Math.sin(Math.PI/4)]}))};
 assert.equal(screen('roof',selection('IFCROOF','Roof'),sloped).canPrepare,true);
 assert.equal(screen('facade',selection('IFCWALL','Internal partition')).canPrepare,false);
 assert.equal(screen('facade',selection('IFCWALL','Wall',[{name:'IsExternal',value:false}])).canPrepare,false);
 assert.equal(screen('facade',selection('IFCWALL','Wall')).status,'conditional');
});
test('ground proposals cannot overlap the bounding footprint and cannot imply land approval',()=>{
 assert.equal(screen('ground',null,surface).canPrepare,false);
 const outside=screen('ground',null,groundSurface({x:0,y:0,z:9,width:4,depth:4}));
 assert.equal(outside.status,'conditional');
 assert.ok(outside.missing.some(reason=>reason.includes('available land')));
});
test('split curved roof assembly excludes its shallow crown while disconnected flat roof stays eligible',()=>{
 const centre=groundSurface({x:0,y:10,z:0,width:2,depth:4});
 const side=(x,angle)=>{const s=groundSurface({x,y:10,z:0,width:2,depth:4});return {...s,triangles:s.triangles.map(t=>({...t,normal:[Math.sin(angle*Math.PI/180),Math.cos(angle*Math.PI/180),0]}))};};
 const distant=groundSurface({x:20,y:10,z:0,width:4,depth:4});
 assert.equal(assessRoofForm(centre).defaultEligible,true);
 const assessments=assessRoofAssemblies([{globalId:'crown',surface:centre},{globalId:'left',surface:side(-2,-15)},{globalId:'right',surface:side(2,15)},{globalId:'other-flat',surface:distant}]);
 assert.equal(assessments.get('crown').componentCount,3);assert.equal(assessments.get('crown').shape,'curved-or-complex');assert.equal(assessments.get('crown').defaultEligible,true);
 assert.equal(assessments.get('other-flat').defaultEligible,true);
 assert.equal(screen('roof',selection('IFCROOF','Roof'),{...centre,roofAssessment:assessments.get('crown')}).canPrepare,true);
});
