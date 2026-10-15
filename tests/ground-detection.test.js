import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {assessGroundUse,screenRegion} from '../src/domain/region-screening.js';
import {groundSurface,excludeBuildingFootprint} from '../src/adapters/greening-geometry.js';
import {buildAgentContext,createGreeningTools,isSurfacePreviewable} from '../src/domain/greening-agent.js';

const catalog=JSON.parse(readFileSync(new URL('../src/data/plants.json',import.meta.url)));
const box=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,10,1));
const whole=groundSurface({width:10,depth:10,x:0,z:0,y:0});
const outside=excludeBuildingFootprint(whole,box);

test('native ground clipping removes building footprint without replacing IFC geometry with a rectangle',()=>{
 assert.ok(Math.abs(outside.surfaceAreaM2-96)<1e-8);
 for(const triangle of outside.triangles){const center=triangle.points.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/3),[0,0,0]);assert.ok(Math.abs(center[0])>=1-1e-8||Math.abs(center[2])>=1-1e-8);}
 assert.throws(()=>excludeBuildingFootprint(groundSurface({width:1,depth:1,x:0,z:0,y:0}),box));
});
test('ground use recognizes planting labels, prioritizes access protection, and never equates terrain with permission',()=>{
 const lawn={globalId:'lawn',category:'IFCGEOGRAPHICELEMENT',name:'Landscape planting bed',properties:[{name:'PredefinedType',value:'VEGETATION'}]};
 assert.equal(assessGroundUse(lawn).classification,'planting');
 assert.equal(screenRegion({type:'ground',selection:lawn,surface:outside,buildingBox:box}).canPrepare,true);
 const unknown={globalId:'site',category:'IFCSITE',name:'Gelaende 0815',properties:[]};
 assert.equal(assessGroundUse(unknown).classification,'review');
 assert.equal(screenRegion({type:'ground',selection:unknown,surface:outside,buildingBox:box}).canPrepare,false);
 assert.equal(screenRegion({type:'ground',selection:{...unknown,properties:[{name:'UserReportedGroundUse',value:'plantable'}]},surface:outside,buildingBox:box}).canPrepare,true);
 const road={...lawn,name:'Fire access route with grass',properties:[{name:'UserReportedGroundUse',value:'plantable'}]};
 assert.equal(assessGroundUse(road).classification,'protected');
 assert.equal(screenRegion({type:'ground',selection:road,surface:outside,buildingBox:box}).canPrepare,false);
 assert.equal(assessGroundUse({category:'IFCSLAB',name:'Floor-001',properties:[]}).classification,'not-ground');
 const raised={...outside,triangles:outside.triangles.map(t=>({...t,points:t.points.map(p=>[p[0],8,p[2]])}))};
 assert.equal(screenRegion({type:'ground',selection:lawn,surface:raised,buildingBox:box}).canPrepare,false);
});
test('ground recommendation needs specific current-user confirmation; protected IFC use cannot be overridden',async()=>{
 const component={globalId:'site',name:'Site',category:'IFCSITE',properties:[],surfaces:[{type:'ground',displayLabel:'Ground · G01',areaM2:96,previewable:false,reasons:['Unspecified use'],checks:['Confirm use'],groundAssessment:{classification:'review',geometryReady:true}}]};
 const payload={question:'这块地面可以用于种植，不是通道。',modelVersion:'fixture',language:'zh-CN',buildingIndex:[component],history:[],projectState:[],selected:[]};
 const c=buildAgentContext(payload,catalog),session=createGreeningTools(c,catalog);
 const plant=catalog.plants.find(p=>p.applicationRegions.includes('ground')).id;
 const rec={globalId:'site',type:'ground',plantId:plant,explanation:'Conditional ground planting',coverageFraction:.3};
 assert.ok((await session.definitions.proposePlanting.execute({recommendations:[rec]})).error);
 await session.definitions.recordContext.execute({scope:'site',kind:'fact',field:'groundUse',value:'plantable',evidence:payload.question});
 const response=await session.definitions.proposePlanting.execute({recommendations:[rec]});assert.equal(response.recommendations.length,1);
 assert.equal(c.projectState[0].source,'user-reported');
 const replay=buildAgentContext({...payload,projectState:c.projectState},catalog);
 assert.equal(isSurfacePreviewable(replay.index[0].surfaces[0],replay.projectState,'site'),true);
 replay.index[0].surfaces[0].groundAssessment.classification='protected';assert.equal(isSurfacePreviewable(replay.index[0].surfaces[0],replay.projectState,'site'),false);
 assert.ok((await session.definitions.recordContext.execute({scope:'project',kind:'fact',field:'groundUse',value:'plantable',evidence:payload.question})).error);
 c.question='如果这里可以种植呢';assert.ok((await session.definitions.recordContext.execute({scope:'site',kind:'fact',field:'groundUse',value:'plantable',evidence:c.question})).error);
});

test('ordinary recommendation questions and facade facts never authorize ground conversion',async()=>{
 const ground={globalId:'site',name:'Site',category:'IFCSITE',properties:[],surfaces:[{type:'ground',displayLabel:'Ground G1',areaM2:10,previewable:false,reasons:[],checks:[],groundAssessment:{classification:'review',geometryReady:true}}]};
 const wall={globalId:'wall',name:'Wall',category:'IFCWALL',properties:[],surfaces:[{type:'facade',displayLabel:'Facade F1',areaM2:10,previewable:true,reasons:[],checks:[]}]};
 const question='这块地方适合种什么？给我一套完整种植方案。';
 const c=buildAgentContext({question,modelVersion:'guard',language:'zh-CN',buildingIndex:[ground,wall],projectState:[],selected:[],history:[]},catalog);
 const tools=createGreeningTools(c,catalog).definitions;
 assert.ok((await tools.recordContext.execute({scope:'site',kind:'fact',field:'groundUse',value:'plantable',evidence:question})).error);
 c.question='这里可以用于种植';
 assert.ok((await tools.recordContext.execute({scope:'wall',kind:'fact',field:'groundUse',value:'plantable',evidence:c.question})).error);
 assert.deepEqual(c.projectState,[]);
});
