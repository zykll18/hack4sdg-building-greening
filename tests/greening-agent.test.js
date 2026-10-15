import test from 'node:test';
import { DEFAULT_CARBON_MODEL } from '../src/domain/carbon-model.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAgentContext,createGreeningTools,locationConditions,validateAgentReply} from '../src/domain/greening-agent.js';
import {createQwenGenerator} from '../src/adapters/qwen-assistant.js';
import {createAssistantService} from '../src/adapters/assistant-service.js';
import {createAssistantHandler} from '../api/assistant.js';
import {createAssistantClient} from '../web/assistant-client.js';
const catalog=JSON.parse(readFileSync(new URL('../src/data/plants.json',import.meta.url)));
const index=Array.from({length:105},(_,i)=>({globalId:`wall-${i}`,name:`Wall ${i}`,category:'IFCWALL',properties:[{name:'Name',value:`Wall ${i}`}],surfaces:[{type:'facade',displayLabel:`Facade · F${i+1}`,areaM2:10,previewable:true,reasons:['Near vertical display face'],checks:['Exterior exposure unknown']}]}));
index.push({globalId:'curved-roof',name:'Curved roof',category:'IFCROOF',properties:[],surfaces:[{type:'roof',displayLabel:'Roof · review 1',areaM2:null,previewable:false,reasons:['Curved roof requires specialist design'],checks:['Loading unknown']}]});
const payload={question:'这栋建筑哪里适合种植物？我希望少浇水',modelVersion:'fixture-v1',buildingName:'Offline test building',buildingIndex:index,language:'zh-CN',projectState:[],selected:[{globalId:'wall-0',type:'facade',areaM2:10,plantId:'ficus-pumila',coverageFraction:.5}],formConditions:{scope:'wall-0',values:{soilDepthMm:400}},history:[]};
const baseURL='https://dashscope.aliyuncs.com/compatible-mode/v1';
const textResponse=text=>new Response(JSON.stringify({id:'test',object:'chat.completion',created:1,model:'qwen3.7-plus',choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}),{headers:{'Content-Type':'application/json'}});
const toolResponse=(name,args,id)=>new Response(JSON.stringify({id:'test',object:'chat.completion',created:1,model:'qwen3.7-plus',choices:[{index:0,message:{role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}),{headers:{'Content-Type':'application/json'}});
const context=()=>buildAgentContext(structuredClone(payload),catalog);
test('AI plant tools receive the same species carbon records and citation allowlist as Flora',async()=>{
 const session=createGreeningTools(context(),catalog);
 const sedum=await session.definitions.searchPlants.execute({globalId:null,region:null,search:'sedum lineare'});
 assert.equal(sedum.plants.length,1);
 assert.equal(sedum.plants[0].carbonEvidence.references[0].referencePeriod,'annualized-observation');
 assert.equal(sedum.plants[0].carbonEvidence.projectAnnualNetReductionKgCo2ePerM2,null);
 const mondo=await session.definitions.searchPlants.execute({globalId:null,region:null,search:'ophiopogon'});
 assert.equal(mondo.plants[0].carbonEvidence.references[0].referencePeriod,'first-year-only');
 const ficus=await session.definitions.searchPlants.execute({globalId:null,region:null,search:'ficus pumila'});
 assert.equal(ficus.plants[0].carbonEvidence.status,'related-evidence');
 const result=session.finish('Only conditional literature references.');
 assert.ok(result.sources.some(source=>source.url==='https://doi.org/10.1016/j.buildenv.2026.114431'));
 assert.ok(result.sources.some(source=>source.url.includes('paperid=72981')));
 assert.throws(()=>validateAgentReply({...result,sources:[{url:'https://invented.example/carbon'}]},context(),catalog),/Unknown evidence/);
});
test('confirmed project background reaches the provider prompt; local conditions override project irrigation and foreign cities cannot inherit HK factors',async()=>{
 const background={city:'香港',buildingUse:'office',projectStage:'retrofit',budgetHkd:60000,irrigation:'low',maintenance:'每月维护'};
 const c=buildAgentContext({...structuredClone(payload),projectBackground:background},catalog);
 assert.equal(locationConditions(c,'wall-1','facade').irrigation,'low');
 c.formConditions={scope:'wall-0',values:{irrigation:'high'}};assert.equal(locationConditions(c,'wall-0','facade').irrigation,'high');
 let wire;const generator=createQwenGenerator({apiKey:'offline-key',baseURL,catalog,fetcher:async(url,options)=>{wire=JSON.parse(options.body);return textResponse('按办公改造项目讨论。');}});
 await generator({context:c,signal:AbortSignal.timeout(5000)});
 const prompt=JSON.parse(wire.messages.findLast(message=>message.role==='user').content);
 assert.equal(prompt.projectBackground.city,'香港');assert.equal(prompt.projectBackground.budgetHkd,60000);assert.equal(prompt.projectBackground.projectStage,'retrofit');
 assert.match(prompt.primaryObjective,/carbon impact/);assert.ok(!Object.hasOwn(prompt.projectBackground,'instructions'));
 const foreign=buildAgentContext({...structuredClone(payload),projectBackground:{...background,city:'新加坡'},carbonModelSettings:DEFAULT_CARBON_MODEL},catalog);
 assert.equal(foreign.carbonModelSettings,null);
 assert.throws(()=>buildAgentContext({...structuredClone(payload),projectBackground:{...background,buildingUse:'not-valid'}},catalog));
});
test('AI comparison tool returns the same scoped reference model rather than inventing full carbon savings',async()=>{
 const roof={globalId:'roof-model',name:'Reference roof',category:'IFCROOF',properties:[],surfaces:[{type:'roof',displayLabel:'R01',areaM2:100,previewable:true,reasons:[],checks:[],roofAssessment:{maxSlopeDegrees:30}}]};
 const c=buildAgentContext({...structuredClone(payload),buildingIndex:[roof],selected:[{globalId:roof.globalId,type:'roof',areaM2:100,plantId:'sedum-lineare',coverageFraction:.5}],formConditions:null,carbonModelSettings:DEFAULT_CARBON_MODEL},catalog);
 const reply=await createGreeningTools(c,catalog).definitions.comparePlans.execute({years:20,coverageFraction:null});
 assert.equal(reply.comparison.proposal.netDifferenceKgCo2e,null);
 assert.ok(Math.abs(reply.comparison.proposal.carbonModel.upfrontKgCo2e-662.6)<1e-9);
 assert.equal(reply.comparison.proposal.carbonModel.settings.cooling,'unknown');
 assert.throws(()=>buildAgentContext({...structuredClone(payload),carbonModelSettings:{...DEFAULT_CARBON_MODEL,copMin:0}},catalog),/parameter/);
});

test('whole index is queryable beyond old 80 cap; restricted roofs stay visible',async()=>{
 const c=context(), tools=createGreeningTools(c,catalog).definitions;
 const page=await tools.queryBuilding.execute({category:null,region:'facade',search:null,offset:80,limit:40});
 assert.equal(page.matched,105);assert.equal(page.components[0].globalId,'wall-80');assert.equal(page.components.length,25);assert.equal(page.nextOffset,null);
 const roof=await tools.inspectLocation.execute({globalId:'curved-roof'});assert.equal(roof.surfaces[0].previewable,false);
 const result=await tools.proposePlanting.execute({recommendations:[{globalId:'curved-roof',type:'roof',plantId:'sedum-lineare',explanation:'Special roof'}]});assert.ok(result.error);
 assert.equal((await tools.inspectLocation.execute({globalId:'invented'})).recoverable,true);
});
test('facts, preferences and hypotheticals are scoped; corrections clear old proposals',async()=>{
 const c=context(), tools=createGreeningTools(c,catalog).definitions;
 assert.equal((await tools.recordContext.execute({scope:'project',kind:'preference',field:'irrigation',value:'low',evidence:'希望少浇水'})).recorded.kind,'preference');
 assert.equal(locationConditions(c,'wall-1','facade').irrigation,'unknown');
 assert.ok((await tools.recordContext.execute({scope:'project',kind:'fact',field:'irrigation',value:'low',evidence:'希望少浇水'})).error);
 c.question='wall-1土层400毫米，如果加滴灌呢';
 await tools.recordContext.execute({scope:'wall-1',kind:'fact',field:'soilDepthMm',value:400,evidence:'wall-1土层400毫米'});
 await tools.recordContext.execute({scope:'wall-1',kind:'hypothesis',field:'irrigation',value:'high',evidence:'如果加滴灌呢'});
 assert.equal(locationConditions(c,'wall-1','facade').soilDepthMm,400);assert.equal(locationConditions(c,'wall-2','facade').soilDepthMm,null);assert.equal(locationConditions(c,'wall-1','facade').irrigation,'unknown');
 assert.equal(locationConditions(c,'wall-0','facade').soilDepthMm,400);
 assert.ok((await tools.recordContext.execute({scope:'wall-1',kind:'fact',field:'soilDepthMm',value:500,evidence:'invented quote'})).error);
 c.question='wall-1土层只有20毫米';
 await tools.recordContext.execute({scope:'wall-1',kind:'fact',field:'soilDepthMm',value:20,evidence:c.question});
 assert.equal(c.projectState.filter(x=>x.scope==='wall-1'&&x.kind==='fact').length,1);
 assert.ok((await tools.proposePlanting.execute({recommendations:[{globalId:'wall-1',type:'facade',plantId:'ficus-pumila',explanation:'Wrong soil'}]})).error);
});
test('retrieval returns source-backed traits and absent evidence; no hallucinated regulations',async()=>{
 const c=context(), session=createGreeningTools(c,catalog);
 const data=await session.definitions.retrieveGuidance.execute({query:'Sedum lineare'});assert.ok(data.records.some(x=>x.plantId==='sedum-lineare'));assert.ok(data.records[0].sources[0].url.startsWith('https://www.greening.gov.hk/'));
 const empty=await session.definitions.retrieveGuidance.execute({query:'NONEXISTENT_REGULATION_92345'});assert.equal(empty.records.length,0);
 assert.ok(session.finish('资料见来源').sources.length);assert.equal(c.projectState.length,0);
});
test('draft changes affect only real selected locations; comparison uses coverage without mutating selection',async()=>{
 const c=context(), before=JSON.stringify(c.selected),session=createGreeningTools(c,catalog);
 const result=await session.definitions.proposeChanges.execute({changes:[{globalId:'wall-0',plantId:null,coverageFraction:.3}]});assert.equal(result.changes[0].coverageFraction,.3);
 assert.ok((await session.definitions.proposeChanges.execute({changes:[{globalId:'wall-3',plantId:null,coverageFraction:.3}]})).error);
 const resultComparison=await session.definitions.comparePlans.execute({years:20,coverageFraction:.3});
 assert.equal(resultComparison.comparison.kind,'original-vs-current');assert.equal(resultComparison.comparison.baseline.addedPlantingAreaM2,0);assert.equal(resultComparison.comparison.proposal.coverageM2,3);assert.equal(resultComparison.comparison.proposal.planId,'current');assert.equal(resultComparison.comparison.changes.periodCarbonKgCo2e,null);assert.equal(JSON.stringify(c.selected),before);
 assert.throws(()=>validateAgentReply({answer:'x',changes:[{globalId:'wall-0',plantId:'sedum-lineare',coverageFraction:.3}]},c,catalog));
});
test('SDK tool loop queries then proposes; full IFC index never enters initial prompt',async()=>{
 const c=context();let calls=0;const wires=[];
 const generator=createQwenGenerator({apiKey:'offline-key',baseURL,catalog,fetcher:async(url,options)=>{
  const wire=JSON.parse(options.body);wires.push(wire);calls++;
  if(calls===1)return toolResponse('queryBuilding',{category:null,region:'facade',search:null,offset:80,limit:40},'call1');
  if(calls===2){const result=JSON.parse(wire.messages.find(x=>x.role==='tool').content);assert.equal(result.components[0].globalId,'wall-80');return toolResponse('proposePlanting',{recommendations:[{globalId:'wall-80',type:'facade',plantId:'ficus-pumila',explanation:'Conditional facade candidate'}]},'call2');}
  return textResponse('可先考虑 Facade F81 的攀爬植物。供水待确认。');
 }});
 const result=await generator({context:c,signal:AbortSignal.timeout(5000)});assert.equal(calls,3);assert.equal(result.recommendations[0].globalId,'wall-80');assert.equal(result.method,'tool-agent');
 assert.ok(wires[0].tools.some(x=>x.function.name==='inspectLocation'));assert.ok(!wires[0].response_format);assert.ok(!wires[0].messages.at(-1).content.includes('Wall 104'));assert.ok(result.sources.length);
});
test('agent can answer without a mandatory recommendation or tool route',async()=>{
 let calls=0;const generator=createQwenGenerator({apiKey:'offline-key',baseURL,catalog,fetcher:async()=>{calls++;return textResponse('概念设计可以先比较维护方式。');}});
 const result=await generator({context:context()});assert.equal(calls,1);assert.deepEqual(result.recommendations,[]);assert.deepEqual(result.changes,[]);
});
test('real SDK stream sends text and finishes with validated reply',async()=>{
 const content='示例回复';
 const chunks=[{id:'a',object:'chat.completion.chunk',created:1,model:'qwen3.7-plus',choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]},{id:'a',object:'chat.completion.chunk',created:1,model:'qwen3.7-plus',choices:[{index:0,delta:{},finish_reason:'stop'}]}];
 const generator=createQwenGenerator({apiKey:'offline-key',baseURL,catalog,fetcher:async(url,options)=>{assert.equal(JSON.parse(options.body).stream,true);return new Response(chunks.map(x=>`data: ${JSON.stringify(x)}\n\n`).join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
 const events=[],reply=await generator({context:context(),onEvent:x=>events.push(x)});assert.equal(reply.answer,content);assert.ok(events.some(x=>x.type==='text'&&x.text===content));
});
test('NDJSON client handles split unicode, tool progress, final result and sanitized failures',async()=>{
 const bytes=new TextEncoder().encode([{type:'tool-start',tool:'queryBuilding'},{type:'text',text:'建筑'},{type:'result',reply:{answer:'建筑'}}].map(x=>JSON.stringify(x)+'\n').join(''));
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,80));controller.enqueue(bytes.slice(80,81));controller.enqueue(bytes.slice(81));controller.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
 const events=[],client=createAssistantClient({fetcher:async(url,options)=>{assert.equal(options.headers.Accept,'application/x-ndjson');return response;}});
 assert.equal((await client.ask(payload,{onEvent:x=>events.push(x)})).answer,'建筑');assert.equal(events[1].text,'建筑');
 const failing=createAssistantClient({fetcher:async()=>new Response(JSON.stringify({type:'error',status:503,message:'AI provider balance insufficient.'})+'\n',{headers:{'Content-Type':'application/x-ndjson'}})});
 await assert.rejects(()=>failing.ask(payload,{onEvent(){}}),/余额不足/);
 const partial=createAssistantClient({fetcher:async()=>new Response('{"type":"text","text":"partial"}\n',{headers:{'Content-Type':'application/x-ndjson'}})});
 await assert.rejects(()=>partial.ask(payload,{onEvent(){}}),/未完成/);
});
test('API streams progress/final result and detects disconnect; access policy still runs first',async()=>{
 let aborted=false;const service=createAssistantService({catalog,authorize:()=>true,generate:async({context,onEvent,signal})=>{aborted=signal.aborted;onEvent({type:'tool-start',tool:'queryBuilding'});return {answer:'Done',recommendations:[]};}});
 const chunks=[];const res={headers:{},setHeader(k,v){this.headers[k]=v;},write(s){chunks.push(s);},end(s){if(s)chunks.push(s);},on(){},off(){}};
 await createAssistantHandler(service)({method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:payload},res);
 const events=chunks.join('').trim().split('\n').map(x=>JSON.parse(x));assert.equal(res.statusCode,200);assert.equal(events[0].type,'ready');assert.equal(events.at(-1).type,'result');assert.equal(aborted,false);
 const invalid={...payload,buildingIndex:[{...index[0],globalId:''}]};const result={setHeader(){},end(s){this.body=JSON.parse(s);}};
 await createAssistantHandler(service)({method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson'},body:invalid},result);assert.equal(result.statusCode,422);
});

test('compressed model transport round-trips through API with decoded-size limits',async()=>{
 const {gzipSync}=await import('node:zlib');const {Readable}=await import('node:stream');
 let calls=0;const service=createAssistantService({catalog,authorize:()=>true,generate:async({onEvent})=>{calls++;onEvent({type:'text',text:'完成'});return {answer:'完成',recommendations:[]};}});
 const request=Readable.from([gzipSync(JSON.stringify(payload))]);request.method='POST';request.headers={'content-type':'application/json',accept:'application/x-ndjson','content-encoding':'gzip'};
 const chunks=[],res={setHeader(){},write(s){chunks.push(s);},end(s){if(s)chunks.push(s);}};
 await createAssistantHandler(service)(request,res);assert.equal(calls,1);assert.ok(chunks.join('').includes('"type":"result"'));
 const bomb=Readable.from([gzipSync(' '.repeat(17*1024*1024))]);bomb.method='POST';bomb.headers=request.headers;
 const rejected={setHeader(){},end(s){this.body=JSON.parse(s);}};await createAssistantHandler(service)(bomb,rejected);assert.equal(rejected.statusCode,413);assert.equal(calls,1);
});
test('Vercel buffered gzip and already parsed JSON both reach the agent',async()=>{
 const {gzipSync}=await import('node:zlib');
 let calls=0;const service=createAssistantService({catalog,authorize:()=>true,generate:async()=>{calls++;return {answer:'完成',recommendations:[]};}});
 for(const [type,body] of [['application/octet-stream',gzipSync(JSON.stringify(payload))],['application/json',payload]]){
  const res={setHeader(){},end(s){this.body=JSON.parse(s);}};
  await createAssistantHandler(service)({method:'POST',headers:{'content-type':type,'content-encoding':'gzip'},body},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.answer,'完成');
 }
 assert.equal(calls,2);
});
test('explicit IFC relationships retain real wall/window and property-set references',async()=>{
 const {readIfcRelationships}=await import('../src/adapters/ifc-query-index.js');
 const {IFCRELVOIDSELEMENT,IFCRELFILLSELEMENT,IFCRELCONTAINEDINSPATIALSTRUCTURE,IFCRELDEFINESBYPROPERTIES}=await import('web-ifc');
 const ref=value=>({value});
 const lines=new Map([[1,{GlobalId:ref('wall')}],[2,{GlobalId:ref('opening')}],[3,{GlobalId:ref('window')}],[4,{GlobalId:ref('floor')}],[5,{GlobalId:ref('pset'),HasProperties:[ref(6)]}],[6,{Name:ref('IsExternal'),NominalValue:ref(true)}],
 [11,{RelatingBuildingElement:ref(1),RelatedOpeningElement:ref(2)}],[12,{RelatingOpeningElement:ref(2),RelatedBuildingElement:ref(3)}],[13,{RelatingStructure:ref(4),RelatedElements:[ref(1)]}],[14,{RelatingPropertyDefinition:ref(5),RelatedObjects:[ref(1)]}]]);
 const typeIds=new Map([[IFCRELVOIDSELEMENT,[11]],[IFCRELFILLSELEMENT,[12]],[IFCRELCONTAINEDINSPATIALSTRUCTURE,[13]],[IFCRELDEFINESBYPROPERTIES,[14]]]);let closed=false;
 const api={OpenModel:()=>0,GetLine:(model,id)=>lines.get(id),GetLineIDsWithType:(model,type)=>({size:()=>(typeIds.get(type)??[]).length,get:i=>typeIds.get(type)[i]}),CloseModel(){closed=true;}};
 const result=await readIfcRelationships(new Uint8Array(),{api});assert.equal(closed,true);assert.deepEqual(result.references.get('wall').openings,[{globalId:'opening',fillingGlobalIds:['window']}]);assert.deepEqual(result.propertyData.get('pset'),[{name:'IsExternal',value:true}]);
});
test('context and replies reject stale identities, fabricated sources and invalid scoped records',()=>{
 const c=context();assert.throws(()=>buildAgentContext({...payload,projectState:[{scope:'other-project',kind:'fact',field:'irrigation',value:'high',evidence:'source'}]},catalog));
 assert.throws(()=>validateAgentReply({answer:'x',recommendations:[],sources:[{url:'https://unverified.example/guide'}]},c,catalog));
 assert.throws(()=>validateAgentReply({answer:'x',recommendations:[{globalId:'removed',type:'facade',plantId:'ficus-pumila',explanation:'x'}]},c,catalog));
});

test('previous recommendation ordinal is independent of label number and survives follow-ups',async()=>{
 const lastRecommendations=[{globalId:'wall-88',type:'facade',plantId:'ficus-pumila'},{globalId:'wall-58',type:'facade',plantId:'ficus-pumila'}];
 const c=buildAgentContext({...payload,lastRecommendations,question:'第二个推荐位置呢？'},catalog);assert.equal(c.lastRecommendations[1].ordinal,2);assert.equal(c.lastRecommendations[1].globalId,'wall-58');assert.equal(c.lastRecommendations[1].displayLabel,'Facade · F59');
 let wire;const generator=createQwenGenerator({apiKey:'offline-key',baseURL,catalog,fetcher:async(url,options)=>{wire=JSON.parse(options.body);return textResponse('第二项是 F59。');}});await generator({context:c});
 assert.equal(JSON.parse(wire.messages.at(-1).content).conversationReferences.lastRecommendations[1].globalId,'wall-58');
});
test('new location facts override stale form facts without changing another location',async()=>{
 const c=context(),tools=createGreeningTools(c,catalog).definitions;c.question='wall-0土层只有20毫米';
 await tools.recordContext.execute({scope:'wall-0',kind:'fact',field:'soilDepthMm',value:20,evidence:c.question});
 assert.equal(locationConditions(c,'wall-0','facade').soilDepthMm,20);assert.equal(locationConditions(c,'wall-1','facade').soilDepthMm,null);
});

test('updating one recommendation retains other candidates and puts updates first',async()=>{
 const c=buildAgentContext({...payload,lastRecommendations:[{globalId:'wall-0',type:'facade',plantId:'ficus-pumila'},{globalId:'wall-1',type:'facade',plantId:'ficus-pumila'}]},catalog),session=createGreeningTools(c,catalog);
 const result=await session.definitions.proposePlanting.execute({recommendations:[{globalId:'wall-1',type:'facade',plantId:'trachelospermum-jasminoides',explanation:'Updated option'}]});
 assert.deepEqual(result.recommendations.map(x=>x.globalId),['wall-1','wall-0']);assert.equal(result.recommendations[1].plantId,'ficus-pumila');
 const replaced=await session.definitions.proposePlanting.execute({operation:'replace',recommendations:[{globalId:'wall-2',type:'facade',plantId:'ficus-pumila',explanation:'New list'}]});assert.equal(replaced.recommendations.length,1);
});

test('agent never labels an IFC subset as the total of a plan with custom regions',async()=>{
 const c=buildAgentContext({...payload,unindexedSelectedCount:1},catalog),tools=createGreeningTools(c,catalog).definitions;
 const result=await tools.comparePlans.execute({years:20,coverageFraction:null});assert.match(result.error,/Compare panel/);assert.equal(result.recoverable,true);
});

test('recommendations carry design coverage, validate its bounds and retain it through merge',async()=>{
 const c=buildAgentContext({...payload,lastRecommendations:[{globalId:'wall-2',type:'facade',plantId:'ficus-pumila',coverageFraction:.7,coverageRationale:'Existing design'}]},catalog),session=createGreeningTools(c,catalog);
 const result=await session.definitions.proposePlanting.execute({recommendations:[{globalId:'wall-1',type:'facade',plantId:'ficus-pumila',coverageFraction:.3,coverageRationale:'Keep open wall portions',explanation:'Concept'}]});
 assert.equal(result.recommendations[0].coverageFraction,.3);assert.equal(result.recommendations[1].coverageFraction,.7);
 assert.equal(session.finish('30% concept').recommendations[0].coverageRationale,'Keep open wall portions');
 for(const fraction of [-.1,30,Infinity])assert.throws(()=>validateAgentReply({answer:'x',recommendations:[{globalId:'wall-1',type:'facade',plantId:'ficus-pumila',coverageFraction:fraction,explanation:'x'}]},c,catalog));
});
test('explicit coverage change is actionable, preserves species, and hypotheticals remain drafts',async()=>{
 const c=context(),session=createGreeningTools(c,catalog);c.question='把已经选好的地方覆盖率改为30%';
 const result=await session.definitions.proposeChanges.execute({mode:'apply',evidence:c.question,changes:[{globalId:'wall-0',plantId:null,coverageFraction:.3}]});
 assert.equal(result.status,'will-apply-when-response-completes');assert.equal(session.finish('修改方案已提交').changeMode,'apply');assert.equal(result.changes[0].plantId,'ficus-pumila');assert.equal(result.changes[0].coverageFraction,.3);
 const wrong=await session.definitions.proposeChanges.execute({mode:'apply',evidence:'old request',changes:[{globalId:'wall-0',plantId:null,coverageFraction:.3}]});assert.ok(wrong.error);
 c.question='如果覆盖率改为30%会怎样？';
 assert.ok((await session.definitions.proposeChanges.execute({mode:'apply',evidence:c.question,changes:[{globalId:'wall-0',plantId:null,coverageFraction:.3}]})).error);
 assert.equal((await session.definitions.proposeChanges.execute({mode:'suggest',evidence:null,changes:[{globalId:'wall-0',plantId:null,coverageFraction:.3}]})).status,'draft-awaiting-user-apply');
});
test('coverage-only edits do not require replacing an existing conditional species',()=>{
 const c=context();c.formConditions.values.soilDepthMm=10;
 const reply=validateAgentReply({answer:'Coverage only',changes:[{globalId:'wall-0',plantId:null,coverageFraction:0}]},c,catalog);assert.equal(reply.changes[0].coverageFraction,0);assert.equal(reply.changes[0].plantId,'ficus-pumila');
 assert.throws(()=>validateAgentReply({answer:'New species',changes:[{globalId:'wall-0',plantId:'trachelospermum-jasminoides',coverageFraction:.3}]},c,catalog));
});
test('UI application validates a whole change batch, preserves untargeted plants, and uses the same coverage in calculations',async()=>{
 const {prepareAssistantPlantingUpdates}=await import('../web/assistant-planting.js');
 const {calculatePlan,PLANS}=await import('../src/domain/greening-plan.js');
 const regions=[0,1,2].map(i=>({id:`region-${i}`,globalId:`wall-${i}`,type:'facade',modelVersion:'fixture-v1',projectId:'test',usableArea:{value:10,unit:'m2',provenance:'assumed',source:'Test fixture'},planting:{plantId:'ficus-pumila',density:1,coverageFraction:.5}}));
 const before=regions.map(r=>({globalId:r.globalId,type:r.type,plantId:r.planting.plantId,coverageFraction:.5,areaM2:10}));
 const changes=[{globalId:'wall-0',type:'facade',plantId:'ficus-pumila',coverageFraction:.3},{globalId:'wall-1',type:'facade',plantId:'ficus-pumila',coverageFraction:.7}];
 const original=JSON.stringify(regions),updates=prepareAssistantPlantingUpdates(changes,regions,before,catalog);assert.equal(JSON.stringify(regions),original);assert.equal(updates.length,2);
 for(const update of updates)regions.find(r=>r.id===update.id).planting=update.planting;
 assert.equal(regions[2].planting.coverageFraction,.5);assert.equal(calculatePlan({regions,plan:PLANS[0],years:20}).coverageM2,15);
 assert.throws(()=>prepareAssistantPlantingUpdates(changes,regions,before,catalog),/changed/);
 assert.throws(()=>prepareAssistantPlantingUpdates([{...changes[0],globalId:'removed'}],regions,before,catalog));
});

test('plant/system proposals survive validation, recommendation merge and follow-up without becoming site facts', async()=>{
 const plan={plantingMethod:'Climber on reviewed support, clear of windows',substrate:'Proposed growing medium: use the catalog guide depth, not wall thickness',planter:'Proposed root planter at the facade base; dimensions await design',irrigation:'Proposed root-zone drip irrigation; water connection not confirmed',checks:['Confirm anchorage and access','Confirm water point and drainage']};
 const c=context(),session=createGreeningTools(c,catalog),before=JSON.stringify(c.projectState);
 const rec={globalId:'wall-0',type:'facade',plantId:'ficus-pumila',coverageFraction:.4,coverageRationale:'Leave window openings clear',explanation:'Conditional climber concept',plantingPlan:plan};
 const result=await session.definitions.proposePlanting.execute({recommendations:[rec]});
 assert.deepEqual(result.recommendations[0].plantingPlan,plan);assert.equal(JSON.stringify(c.projectState),before);
 const reply=session.finish('Species, substrate, planter and irrigation are proposed together.');
 const {assistantHistory}=await import('../web/assistant-presentation.js');
 const history=assistantHistory([{question:'推荐植物',reply}]);
 assert.deepEqual(JSON.parse(history[1].content).recommendations[0].plantingPlan,plan);
 const next=buildAgentContext({...payload,lastRecommendations:reply.recommendations},catalog);
 const followup=createGreeningTools(next,catalog);
 await followup.definitions.proposePlanting.execute({recommendations:[{...rec,globalId:'wall-1',plantingPlan:{...plan,irrigation:'Proposed manual watering from an accessible water point'}}]});
 assert.deepEqual(followup.finish('Additional location').recommendations.find(r=>r.globalId==='wall-0').plantingPlan,plan);
 assert.throws(()=>validateAgentReply({answer:'x',recommendations:[{...rec,plantingPlan:{...plan,substrate:''}}]},c,catalog));
 assert.throws(()=>validateAgentReply({answer:'x',recommendations:[{...rec,plantingPlan:{...plan,checks:Array(9).fill('check')}}]},c,catalog));
 assert.equal(validateAgentReply({answer:'Old conversation',recommendations:[{...rec,plantingPlan:undefined}]},c,catalog).recommendations[0].plantingPlan,null);
 const schema=session.definitions.proposePlanting.schema.properties.recommendations.items;
 assert.ok(schema.required.includes('plantingPlan'));
 assert.ok(schema.properties.plantingPlan.required.includes('irrigation'));
});

test('inspection multi-selection is validated separately from existing planted locations',()=>{
 const c=buildAgentContext({...payload,inspectedGlobalIds:['wall-2','wall-1','wall-2']},catalog);
 assert.deepEqual(c.inspectedGlobalIds,['wall-2','wall-1']);
 assert.equal(c.selected[0].globalId,'wall-0');
 assert.throws(()=>buildAgentContext({...payload,inspectedGlobalIds:['unknown-model-guid']},catalog));
});

test('focused overview supplies material/quantity facts once without dumping unrelated exporter attributes',async()=>{
 const {focusedLocationOverview}=await import('../src/domain/greening-agent.js');
 const c=context();c.focusedGlobalId='wall-0';
 c.index[0].properties=[{name:'Material.Name',value:'Sand-lime brick'},{name:'Material.Thickness',value:.3,unit:'METRE'},{name:'BaseQuantities.Height',value:2.7,unit:'METRE'},{name:'ExportProfile',value:'Not relevant'}];
 const overview=focusedLocationOverview(c);assert.equal(overview.globalId,'wall-0');assert.equal(overview.properties.length,3);assert.equal(overview.properties[1].unit,'METRE');assert.ok(!JSON.stringify(overview).includes('ExportProfile'));
 c.index[0].properties.push(...Array.from({length:30},(_,i)=>({name:`BaseQuantities.Dimension${i}`,value:i})));
 assert.equal(focusedLocationOverview(c).properties.length,24);assert.equal(focusedLocationOverview(c).moreRelevantAttributes,9);
 c.focusedGlobalId=null;assert.equal(focusedLocationOverview(c),null);
});

test('duplicate location proposals return an actionable error without accepting a partial recommendation batch',async()=>{
 const c=context(),session=createGreeningTools(c,catalog),rec={globalId:'wall-0',type:'facade',plantId:'ficus-pumila',coverageFraction:.5,explanation:'primary'};
 const result=await session.definitions.proposePlanting.execute({recommendations:[rec,{...rec,explanation:'alternative'}]});
 assert.match(result.error,/Duplicate recommendation/);assert.equal(session.finish('Please choose one primary species').recommendations.length,0);
});

test('whole-building overview is bounded, keeps full inventory queryable and prefers unplanted examples',async()=>{
 const {buildingRegionOverview}=await import('../src/domain/greening-agent.js');
 const c=context(),before=JSON.stringify(c);
 const overview=buildingRegionOverview(c),facade=overview.find(x=>x.type==='facade'),roof=overview.find(x=>x.type==='roof');
 assert.equal(facade.screenedLocations,105);assert.equal(facade.representativeLocations.length,3);
 assert.ok(facade.representativeLocations.every(x=>x.globalId!=='wall-0'&&!x.alreadyPlanted));
 assert.equal(roof.needsReview,1);assert.equal(roof.representativeLocations.length,0);assert.equal(JSON.stringify(c),before);
 assert.ok(!JSON.stringify(overview).includes('Wall 104'));
 const tools=createGreeningTools(c,catalog).definitions,page=await tools.queryBuilding.execute({region:'facade',offset:100,limit:5});assert.equal(page.components.length,5);
});
