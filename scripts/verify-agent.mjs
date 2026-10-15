import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {IfcImporter,SingleThreadedFragmentsModel} from '@thatopen/fragments';
import {IfcAPI} from 'web-ifc';
import {normalizeSelection} from '../src/adapters/selection-data.js';
import {readIfcRelationships} from '../src/adapters/ifc-query-index.js';
import {extractGreeningSurface} from '../src/adapters/greening-geometry.js';
import {screenRegion} from '../src/domain/region-screening.js';
import {buildAgentContext,createGreeningTools} from '../src/domain/greening-agent.js';
import {createQwenGenerator} from '../src/adapters/qwen-assistant.js';
const root=resolve(import.meta.dirname,'..');
const catalog=JSON.parse(await readFile(resolve(root,'src/data/plants.json'),'utf8'));
const bytes=new Uint8Array(await readFile(resolve(root,'public/samples/KIT-Office.ifc')));
if(createHash('sha256').update(bytes).digest('hex')!=='cfb2124497b25d9a72101075e84be0feb44ff669cb1bd3251be11efebeea945c')throw new Error('Public sample checksum mismatch; refuse external verification');
// Pinned public fictional KIT Office example, unrestricted use: https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples
const importer=new IfcImporter();importer.wasm={path:resolve(root,'node_modules/web-ifc')+'/',absolute:true};
let verificationEvents=[];let verificationStarted=0;
const observe=event=>{if(event.type==='tool-start'){verificationEvents.push(event.tool);console.log(JSON.stringify({phase:event.tool,elapsedMs:Date.now()-verificationStarted}));}if(event.type==='tool-end')console.log(JSON.stringify({phaseEnd:event.tool,success:event.success,elapsedMs:Date.now()-verificationStarted}));if(event.type==='tool-end'&&!event.success)console.log(JSON.stringify({recoverableToolError:event.tool,message:event.message}));};
const fragment=await importer.process({bytes});const model=new SingleThreadedFragmentsModel('office-verification',fragment);
try {
 const categories=model.getItemsOfCategories([/.*/]),category=new Map(Object.entries(categories).flatMap(([kind,ids])=>ids.map(id=>[id,kind])));
 const all=[...category.keys()],allGuids=model.getGuidsByLocalIds(all),ids=all.filter((_,i)=>Boolean(allGuids[i])),guids=allGuids.filter(Boolean),data=model.getItemsData(ids);
 const api=new IfcAPI();await api.Init(name=>resolve(root,'node_modules/web-ifc',name));
 let relationships;try{relationships=await readIfcRelationships(bytes,{api});}finally{api.Dispose();}
 const index=ids.map((id,i)=>{const item=normalizeSelection({modelVersion:'office-verification',localId:id,globalId:guids[i],category:category.get(id),data:data[i]});return {globalId:item.globalId,name:item.name,category:item.category,properties:[...item.properties.filter(p=>!p.name.startsWith('_')&&p.name!=='Name'),...(relationships.elementProperties.get(item.globalId)??[])],relations:relationships.references.get(item.globalId)??{spatialContainers:[],propertySets:[],openings:[]},surfaces:[]};});
 const geometries=model.getItemsGeometry(model.getItemsIdsWithGeometry()),box=new THREE.Box3(),point=new THREE.Vector3();
 for(const group of geometries)for(const mesh of group)for(let i=0;i<mesh.positions.length;i+=3)box.expandByPoint(point.fromArray(mesh.positions,i).applyMatrix4(mesh.transform));
 const center=box.getCenter(new THREE.Vector3()),matrix=new THREE.Matrix4();let facadeCount=0;
 for(let i=0;i<ids.length;i++)if(/^IFCWALL/.test(index[i].category)){
  try{
   const surface=extractGreeningSurface(model.getItemsGeometry([ids[i]])[0],matrix,'facade',center);
   const selection=normalizeSelection({modelVersion:'office-verification',localId:ids[i],globalId:guids[i],category:category.get(ids[i]),data:data[i]});
   const screening=screenRegion({type:'facade',selection,surface,buildingBox:box});
   if(screening.canPrepare)facadeCount++;
   index[i].surfaces.push({type:'facade',displayLabel:`Facade · F${facadeCount}`,areaM2:surface.surfaceAreaM2,previewable:screening.canPrepare,reasons:screening.reasons,checks:screening.missing});
  }catch{/* The snapshot makes no surface claim when geometry is absent. */}
 }
 const payload={question:'这个建筑你推荐在哪些外墙种什么植物？请查询建筑和植物资料，并把推荐位置标出来。',modelVersion:'office-verification',buildingName:'KIT-Office.ifc',buildingIndex:index,relationshipStatus:relationships.status,unidentifiedCount:all.length-ids.length,language:'zh-CN',selected:[],projectState:[],history:[]};
 if(process.argv.includes('--complete-plan')){
  payload.question='这块地方适合种什么？给我一套完整种植方案。';
  const walls=index.filter(item=>item.surfaces.some(surface=>surface.type==='facade'&&surface.previewable));
  payload.focusedGlobalId=walls[0].globalId;payload.inspectedGlobalIds=walls.slice(0,6).map(item=>item.globalId);
 }
 if(process.argv.includes('--whole-building')){
  payload.question='可以，没有偏好，没有具体位置';payload.focusedGlobalId=null;payload.inspectedGlobalIds=[];
  payload.history=[{role:'user',content:'推荐这栋建筑适合种植的地方和植物，给完整方案。'},{role:'assistant',content:'你有没有植物偏好或具体想种植的位置？'}];
  const firstWall=index.find(item=>item.surfaces.some(surface=>surface.type==='facade'&&surface.previewable));
  payload.selected=[{globalId:firstWall.globalId,type:'facade',areaM2:firstWall.surfaces[0].areaM2,plantId:'ficus-pumila',coverageFraction:.5}];
 }
 if(process.argv.includes('--coverage-only')) {
  payload.question='把我已经选好的这三块覆盖率都改成30%，保留原来的植物品种。';
  payload.selected=index.filter(item=>item.surfaces.some(s=>s.previewable&&s.type==='facade')).slice(0,3).map(item=>({globalId:item.globalId,type:'facade',areaM2:item.surfaces.find(s=>s.type==='facade').areaM2,plantId:'ficus-pumila',coverageFraction:.5}));
 }
 if(process.argv.includes('--evidence-only'))payload.question='滴灌是否一定能节水30-50%？请核对现有资料有没有支持这个数字。';
 const context=buildAgentContext(payload,catalog),tools=createGreeningTools(context,catalog).definitions;
 const page=await tools.queryBuilding.execute({category:null,region:'facade',search:null,offset:80,limit:40});
 const first=index.find(x=>x.surfaces[0]?.previewable),details=await tools.inspectLocation.execute({globalId:first.globalId});
 const summary={indexed:ids.length,unidentifiedEntities:all.length-ids.length,facades:facadeCount,pageAfter80:page.components.length,sourceRelationshipEntries:relationships.references.size,sourceOpenings:[...relationships.references.values()].reduce((n,x)=>n+x.openings.length,0),relatedPropertySets:details.relations.propertySets.length,payloadBytes:Buffer.byteLength(JSON.stringify(payload))};
 console.log(JSON.stringify(summary));
 if(!process.argv.includes('--live'))process.exitCode=0;
 else {
  const {loadEnv}=await import('vite');const env=loadEnv('development',root,'QWEN_');
  const generate=createQwenGenerator({apiKey:env.QWEN_API_KEY,baseURL:env.QWEN_BASE_URL,model:env.QWEN_MODEL||undefined,catalog});
  if(!generate)throw new Error('Provider is not configured');
  verificationEvents=[];verificationStarted=Date.now();
  const events=verificationEvents;const reply=await generate({context,signal:AbortSignal.timeout(90000),onEvent:observe});
  console.log(JSON.stringify({live:true,elapsedMs:Date.now()-verificationStarted,tools:events,answer:reply.answer,recommendations:reply.recommendations,sources:reply.sources.map(x=>x.title),changes:reply.changes,changeMode:reply.changeMode}));
  if(process.argv.includes('--whole-building')&&(!reply.recommendations.length||reply.changes.length))throw new TypeError('Whole-building verification requires new actionable recommendations while preserving existing planting');
  if(process.argv.includes('--complete-plan')&&!reply.recommendations.some(item=>item.globalId===payload.focusedGlobalId&&item.plantingPlan))throw new TypeError('Complete-plan verification requires an actionable proposal for the focused location, not prose only');
  if(process.argv.includes('--coverage-only')) {
    const {prepareAssistantPlantingUpdates}=await import('../web/assistant-planting.js');
    if(reply.changeMode!=='apply'||reply.changes.length!==3||reply.changes.some(change=>change.coverageFraction!==.3||change.plantId!=='ficus-pumila'))throw new TypeError('Provider did not produce the requested coverage-only batch');
    const current=payload.selected.map(x=>({id:x.globalId,globalId:x.globalId,type:x.type,usableArea:{value:x.areaM2},planting:{plantId:x.plantId,coverageFraction:x.coverageFraction,density:1}}));
    const updates=prepareAssistantPlantingUpdates(reply.changes,current,payload.selected,catalog);console.log(JSON.stringify({coverageVerified:true,locations:updates.length,coverage:updates.map(x=>x.planting.coverageFraction)}));
  }
  if(!process.argv.includes('--evidence-only')&&!process.argv.includes('--coverage-only')&&!process.argv.includes('--complete-plan')&&!process.argv.includes('--whole-building')) {
  const followup=buildAgentContext({...payload,question:'刚才第二个位置呢？我希望少浇水；如果装滴灌，会怎样？',projectState:reply.projectState,lastRecommendations:reply.recommendations,history:[{role:'user',content:payload.question},{role:'assistant',content:JSON.stringify({answer:reply.answer,recommendations:reply.recommendations})}]},catalog);
  const followEvents=[];const next=await generate({context:followup,signal:AbortSignal.timeout(60000),onEvent:event=>{if(event.type==='tool-start')followEvents.push(event.tool);if(event.type==='tool-end')console.log(JSON.stringify({phaseEnd:event.tool,success:event.success,elapsedMs:Date.now()-verificationStarted}));if(event.type==='tool-end'&&!event.success)console.log(JSON.stringify({recoverableToolError:event.tool,message:event.message}));}});
  console.log(JSON.stringify({followup:true,tools:followEvents,answer:next.answer,projectState:next.projectState,recommendations:next.recommendations}));
  }
 }
} catch(error) {
 console.error(JSON.stringify({failed:true,tools:verificationEvents,elapsedMs:verificationStarted?Date.now()-verificationStarted:null,kind:error.name,message:error instanceof TypeError?error.message:'Verification failed; provider details and credentials are not printed'}));process.exitCode=1;
} finally {model.dispose();}
