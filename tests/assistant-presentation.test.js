import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantHistory, formatAssistantText } from '../web/assistant-presentation.js';

test('prose uses readable aliases while IFC identities and plant records stay unchanged', () => {
  const rows = [{candidate:{globalId:'2oOoWKmmfChQTLCBzuB3$b'},label:'Facade · F01'}, {candidate:{globalId:'second-guid'},label:'Facade · F02'}];
  const plants = [{id:'ficus-pumila',commonNameEn:'Creeping fig',commonNameZh:'薜荔'}];
  const before = JSON.stringify({rows,plants});
  assert.equal(formatAssistantText('2oOoWKmmfChQTLCBzuB3$b / second-guid: ficus-pumila. Again 2oOoWKmmfChQTLCBzuB3$b.', rows, plants), 'Facade · F01 / Facade · F02: Creeping fig · 薜荔. Again Facade · F01.');
  assert.equal(JSON.stringify({rows,plants}),before);
  assert.equal(formatAssistantText('Keep ordinary text and unknown IDs.',rows,plants),'Keep ordinary text and unknown IDs.');
});

test('follow-up history preserves question/answer order and canonical recommendation identities',()=>{
  const turns=Array.from({length:6},(_,index)=>({question:`Question ${index}`,answer:'Facade · F01',reply:{answer:`Answer ${index}`,recommendations:[{globalId:`guid-${index}`,type:'facade',plantId:'ficus-pumila',explanation:'Not carried forward',status:'conditional'}]}}));
  const snapshot=JSON.stringify(turns),history=assistantHistory(turns);
  assert.equal(history.length,8);assert.equal(history[0].content,'Question 2');
  assert.equal(history[6].content,'Question 5');assert.equal(history[7].role,'assistant');
  assert.deepEqual(JSON.parse(history[7].content),{answer:'Answer 5',recommendations:[{globalId:'guid-5',type:'facade',plantId:'ficus-pumila'}]});
  assert.deepEqual(assistantHistory([]),[]);assert.equal(JSON.stringify(turns),snapshot);
});

test('execution trace measures tool durations and keeps only safe bounded milestones on failure',async()=>{
 const {createAssistantTrace}=await import('../web/assistant-presentation.js');
 let now=0;const trace=createAssistantTrace(()=>now);
 trace.record({type:'sent',question:'private project question'});
 now=1000;trace.record({type:'tool-start',tool:'inspectLocation',toolCallId:'call1',args:{private:'model'}});
 now=1100;trace.record({type:'tool-start',tool:'inspectLocation',toolCallId:'call2'});
 now=1300;trace.record({type:'tool-end',tool:'inspectLocation',toolCallId:'call2',success:false,message:'private output'});
 now=1500;trace.record({type:'tool-end',tool:'inspectLocation',toolCallId:'call1',success:true});
 now=60000;trace.record({type:'failed'});
 const events=trace.snapshot();assert.equal(events[3].durationMs,200);assert.equal(events[4].durationMs,500);assert.equal(events.at(-1).elapsedMs,60000);
 assert.ok(!JSON.stringify(events).includes('private'));trace.record({type:'text',text:'response'});assert.equal(trace.snapshot().length,6);
 events.length=0;assert.equal(trace.snapshot().length,6);
 for(let i=0;i<200;i++)trace.record({type:'ready'});assert.equal(trace.snapshot().length,120);
});
