import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionAssistantAccess } from '../src/adapters/production-assistant-access.js';
import { createAssistantClient } from '../web/assistant-client.js';
import { createAssistantHandler, createConfiguredAssistantHandler } from '../api/assistant.js';

const env={AI_DEMO_ACCESS_CODE:'a-random-test-access-code-123456',UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'server-token'};
const req={headers:{'x-ai-access-code':env.AI_DEMO_ACCESS_CODE}};
test('Vercel native integration variable names are accepted',()=>{
  assert.equal(typeof createProductionAssistantAccess({env:{AI_DEMO_ACCESS_CODE:env.AI_DEMO_ACCESS_CODE,KV_REST_API_URL:env.UPSTASH_REDIS_REST_URL,KV_REST_API_TOKEN:env.UPSTASH_REDIS_REST_TOKEN}}),'function');
});
test('missing or unsafe production settings fail closed',()=>{
  assert.equal(createProductionAssistantAccess({env:{}}),null);
  for(const patch of [{AI_DEMO_ACCESS_CODE:'short'},{UPSTASH_REDIS_REST_URL:'https://test.upstash.io.evil.example'},{UPSTASH_REDIS_REST_URL:'http://test.upstash.io'},{UPSTASH_REDIS_REST_TOKEN:''},{AI_REQUESTS_PER_DAY:'0'},{AI_REQUESTS_PER_MINUTE:'999'}])assert.equal(createProductionAssistantAccess({env:{...env,...patch}}),null);
});
test('invalid access code never reaches quota storage',async()=>{
  let calls=0;
  const access=createProductionAssistantAccess({env,fetcher:async()=>{calls++;}});
  for(const headers of [{},{'x-ai-access-code':'incorrect'},{'x-ai-access-code':['duplicate']},{'x-ai-access-code':'x'.repeat(257)}])assert.deepEqual(await access({headers}),{allowed:false,status:403});
  assert.equal(calls,0);
});
test('durable atomic quota reservation uses server credentials and validates responses',async()=>{
  let sent;
  const access=createProductionAssistantAccess({env,fetcher:async(url,options)=>{sent={url,options};return Response.json({result:[1,0]});}});
  assert.deepEqual(await access(req),{allowed:true});
  const command=JSON.parse(sent.options.body);
  assert.equal(command[0],'EVAL');assert.equal(command[2],1);
  assert.deepEqual(command.slice(-2),[3,20]);
  assert.equal(sent.options.headers.Authorization,'Bearer server-token');
  assert.ok(!sent.options.body.includes(env.AI_DEMO_ACCESS_CODE));
  for(const result of [[0,41],[0,80000]]){
    const denied=createProductionAssistantAccess({env,fetcher:async()=>Response.json({result})});
    assert.deepEqual(await denied(req),{allowed:false,status:429,retryAfter:result[1]});
  }
  for(const data of [{error:'secret'},{result:[1,10]},{result:[0,-1]},{result:null}]){
    assert.deepEqual(await createProductionAssistantAccess({env,fetcher:async()=>Response.json(data)})(req),{allowed:false,status:503});
  }
  assert.deepEqual(await createProductionAssistantAccess({env,fetcher:async()=>{throw new Error('secret');}})(req),{allowed:false,status:503});
});
test('quota outages and rejection stop generation with standard HTTP responses',async()=>{
  for(const status of [429,503]){
    let called=false;
    const service={configured:true,authorize:async()=>({allowed:false,status,retryAfter:60}),recommend:async()=>{called=true;}};
    const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
    await createAssistantHandler(service)({method:'POST',headers:{}},res);
    assert.equal(res.statusCode,status);assert.equal(called,false);
  }
  const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
  await createConfiguredAssistantHandler({env:{}})({method:'GET',headers:{}},res);
  assert.equal(res.body.configured,false);
});
test('browser requests code once, keeps it out of payload, and re-prompts after denial',async()=>{
  let prompts=0,posts=0;
  const client=createAssistantClient({requestAccessCode:()=>{prompts++;return 'demo-code';},fetcher:async(url,options)=>{
    if(!options.method)return Response.json({configured:true,requiresAccess:true});
    assert.equal(options.headers['X-AI-Access-Code'],'demo-code');
    assert.ok(!options.body.includes('demo-code'));
    posts++;
    return posts===2 ? Response.json({message:'Access denied'},{status:403}) : Response.json({answer:'ok'});
  }});
  await client.status();await client.ask({question:'hello'});
  await assert.rejects(client.ask({question:'again'}),/403/);
  await client.ask({question:'retry'});
  assert.equal(prompts,2);assert.equal(posts,3);
});
