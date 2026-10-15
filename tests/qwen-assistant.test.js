import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createQwenGenerator, createQwenAssistantService, QWEN_MODEL } from '../src/adapters/qwen-assistant.js';
import { buildAssistantContext, ASSISTANT_OUTPUT_SCHEMA } from '../src/domain/assistant-context.js';
import { createAssistantHandler } from '../api/assistant.js';

const catalog = JSON.parse(readFileSync(new URL('../src/data/plants.json', import.meta.url)));
const payload = { question: '这个位置适合什么植物？', modelVersion: 'office-v1', language: 'zh-HK', conditions: { soilDepthMm: 120, irrigation: 'low' }, candidates: [{ globalId: 'flat-roof', type: 'roof', geometryAreaM2: 50, screening: { canPrepare: true, roofAssessment: { shape: 'near-flat', maxSlopeDegrees: 2, defaultEligible: true } } }] };
const reply = { answer: '这是条件性建议，请先确认荷载与排水。', recommendations: [{ globalId: 'flat-roof', type: 'roof', plantId: 'sedum-lineare', explanation: '来自可用植物库的候选。' }] };
const baseURL = 'https://test-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
const env = { QWEN_API_KEY: 'offline-test-key', QWEN_BASE_URL: baseURL };
function response(content = reply) {
  return new Response(JSON.stringify({ id: 'offline-response', object: 'chat.completion', created: 1, model: QWEN_MODEL, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 } }), { headers: { 'Content-Type': 'application/json' } });
}
async function request(service, method = 'POST') {
  const res = { setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
  await createAssistantHandler(service)({ method, body: payload, headers: { 'content-type': 'application/json' } }, res);
  return res;
}

test('Qwen is selected but missing configuration never initiates a request', async () => {
  let calls = 0;
  const service = createQwenAssistantService({ catalog, env: {}, fetcher: async () => { calls++; return response(); } });
  assert.equal(service.model, QWEN_MODEL);
  assert.equal(service.provider, 'qwen');
  assert.equal((await request(service, 'GET')).body.configured, false);
  assert.equal((await request(service)).statusCode, 503);
  assert.equal(calls, 0);
  assert.equal(createQwenGenerator({ apiKey: 'x' }), null);
});

test('credentials do not bypass missing or denying access policies', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response(); };
  assert.equal((await request(createQwenAssistantService({ catalog, env, fetcher }))).statusCode, 503);
  assert.equal((await request(createQwenAssistantService({ catalog, env, fetcher, authorize: () => false }))).statusCode, 403);
  assert.equal(calls, 0);
});

test('Qwen SDK request uses regional endpoint, strict schema, bounded output, non-thinking mode and no retry', async () => {
  const context = buildAssistantContext(payload, catalog);
  let wire, calls = 0;
  const generate = createQwenGenerator({ apiKey: env.QWEN_API_KEY, baseURL, fetcher: async (url, options) => {
    calls++;
    wire = JSON.parse(options.body);
    assert.equal(String(url), `${baseURL}/chat/completions`);
    assert.ok(new Headers(options.headers).get('Authorization'));
    assert.ok(options.signal);
    return response();
  } });
  assert.deepEqual(await generate({ context, schema: ASSISTANT_OUTPUT_SCHEMA, signal: AbortSignal.timeout(1000) }), reply);
  assert.equal(wire.model, QWEN_MODEL);
  assert.equal(wire.enable_thinking, false);
  assert.equal(wire.response_format.type, 'json_schema');
  assert.equal(wire.response_format.json_schema.strict, true);
  assert.equal(wire.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(wire.max_tokens, 2000);
  assert.match(wire.messages[0].content, /Traditional Chinese/);
  assert.equal(JSON.parse(wire.messages[1].content).locations[0].plants[0].plantId, 'sedum-lineare');
  assert.ok(!JSON.stringify(wire).includes(env.QWEN_API_KEY));
  assert.equal(calls, 1);
});

test('SDK output cannot invent an excluded plant or override a screened location', async () => {
  for (const change of [{ plantId: 'not-in-library' }, { globalId: 'curved-roof' }, { approved: true }]) {
    const service = createQwenAssistantService({ catalog, env, authorize: () => true, fetcher: async () => response({ ...reply, recommendations: [{ ...reply.recommendations[0], ...change }] }) });
    const result = await request(service);
    assert.equal(result.statusCode, 422);
    assert.deepEqual(result.body, { message: 'Recommendation failed validation. Use local screening.' });
  }
});

test('Qwen follow-up wire includes prior messages and the latest authoritative context once',async()=>{
 const history=[{role:'user',content:'第一轮问题'},{role:'assistant',content:JSON.stringify(reply)}];
 const context=buildAssistantContext({...payload,question:'刚才那个位置需要多少水？',history},catalog);let wire,calls=0;
 const generate=createQwenGenerator({apiKey:env.QWEN_API_KEY,baseURL,fetcher:async(url,options)=>{calls++;wire=JSON.parse(options.body);return response();}});
 assert.deepEqual(await generate({context,schema:ASSISTANT_OUTPUT_SCHEMA,signal:AbortSignal.timeout(1000)}),reply);
 assert.deepEqual(wire.messages.slice(1,3),history);assert.equal(wire.messages.length,4);
 const latest=JSON.parse(wire.messages[3].content);assert.equal(latest.question,'刚才那个位置需要多少水？');assert.equal(latest.history,undefined);
 assert.equal(latest.conditions.irrigation,'low');assert.equal(latest.locations[0].globalId,'flat-roof');assert.equal(calls,1);
});

test('unknown-condition broad question carries concept candidates through the actual SDK boundary without inventing site facts',async()=>{
 const source={...payload,question:'这个建筑你推荐什么植物',conditions:{},candidates:['facade-one','facade-two'].map((globalId,index)=>({globalId,type:'facade',displayLabel:`Facade · F0${index+1}`,geometryAreaM2:50,screening:{canPrepare:true,reasons:['Near-vertical display faces; exterior exposure is unverified.'],missing:['Confirm rooting space and water supply.']}}))};
 const context=buildAssistantContext(source,catalog),draft={answer:'可先探索 F01 的薜荔和 F02 的络石。底部有可用种植空间吗？',recommendations:[{globalId:'facade-one',type:'facade',plantId:'ficus-pumila',explanation:'攀援候选；根部空间与供水待确认。'},{globalId:'facade-two',type:'facade',plantId:'trachelospermum-jasminoides',explanation:'攀援候选；需核实支撑和供水。'}]};let wire,calls=0;
 const generate=createQwenGenerator({apiKey:env.QWEN_API_KEY,baseURL,fetcher:async(url,options)=>{calls++;wire=JSON.parse(options.body);return response(draft);}});
 assert.deepEqual(await generate({context,schema:ASSISTANT_OUTPUT_SCHEMA,signal:AbortSignal.timeout(1000)}),draft);
 const sent=JSON.parse(wire.messages.at(-1).content);assert.equal(sent.conceptOptions.available,true);assert.equal(sent.conditions.facadeSystem,'unknown');assert.equal(sent.conditions.irrigation,'unknown');assert.equal(sent.conditions.soilDepthMm,null);
 assert.equal(sent.locations[0].displayLabel,'Facade · F01');assert.ok(sent.locations[0].plants.some(p=>p.plantId==='ficus-pumila'&&p.facadeSupport==='self-clinging'));
 assert.equal(calls,1);
});

test('bad endpoints/models fail closed and provider errors stay sanitized without retries', async () => {
  assert.equal(typeof createQwenGenerator({ apiKey: 'offline-test-key', baseURL: 'https://maas.qianwenaiapi.com/compatible-mode/v1' }), 'function');
  for (const url of ['https://maas.qianwenaiapi.com.evil.example/compatible-mode/v1', 'https://elsewhere.example/compatible-mode/v1', 'http://dashscope.aliyuncs.com/compatible-mode/v1', `${baseURL}?secret=x`, 'https://user:password@dashscope.aliyuncs.com/compatible-mode/v1']) {
    assert.throws(() => createQwenGenerator({ apiKey: 'x', baseURL: url }));
    assert.equal(createQwenAssistantService({ catalog, env: { ...env, QWEN_BASE_URL: url }, authorize: () => true }).configured, false);
  }
  assert.equal(createQwenAssistantService({ catalog, env: { ...env, QWEN_MODEL: 'other-model' }, authorize: () => true }).configured, false);
  let calls = 0;
  const service = createQwenAssistantService({ catalog, env, authorize: () => true, fetcher: async () => { calls++; throw new Error('private-provider-detail'); } });
  const result = await request(service);
  assert.equal(result.statusCode, 502);
  assert.ok(!JSON.stringify(result.body).includes('private-provider-detail'));
  assert.equal(calls, 1);
});
