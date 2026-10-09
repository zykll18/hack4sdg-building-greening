import test from 'node:test';
import assert from 'node:assert/strict';
import { screenRegion } from '../src/domain/region-screening.js';
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
 assert.equal(screen('roof',selection('IFCROOF','Roof'),sloped).canPrepare,false);
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
