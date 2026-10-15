import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAssistantAccess } from '../api/local-assistant-access.js';
const request = (headers = {}, address = '127.0.0.1') => ({socket:{remoteAddress:address},headers:{host:'127.0.0.1:5173',origin:'http://127.0.0.1:5173','sec-fetch-site':'same-origin',...headers}});
test('local AI rejects remote clients, foreign/missing origins and mismatched hosts', () => {
  const allow = createLocalAssistantAccess();
  for (const req of [request({},'192.168.1.2'),request({origin:'https://other.example'}),request({origin:undefined}),request({host:'other.example'}),request({'sec-fetch-site':'cross-site'}),request({origin:'http://localhost:5173'}),request({origin:'http://127.0.0.1:5173/something'})]) assert.equal(allow(req),false);
  assert.equal(allow(request()),true);
  assert.equal(allow(request({host:'localhost:5173',origin:'http://localhost:5173'},'::1')),true);
});
test('local quota has a fixed-window limit and a process-wide hard cap', () => {
  let time = 0;
  const allow = createLocalAssistantAccess({now:()=>time,windowMs:100,windowLimit:2,sessionLimit:3});
  assert.equal(allow(request()),true); assert.equal(allow(request()),true);
  assert.equal(allow(request()),false);
  time = 100;
  assert.equal(allow(request()),true); assert.equal(allow(request()),false);
  time = 200;
  assert.equal(allow(request()),false);
});

test('detailed local policy distinguishes access denial and quotas without changing allowed requests',()=>{
 let time=0;
 const allow=createLocalAssistantAccess({now:()=>time,windowMs:60000,windowLimit:1,sessionLimit:2,detailed:true});
 assert.deepEqual(allow(request({origin:'https://other.example'})),{allowed:false,status:403,retryAfter:null});
 assert.equal(allow(request()),true);
 assert.deepEqual(allow(request()),{allowed:false,status:429,retryAfter:60});
 time=60000;assert.equal(allow(request()),true);
 assert.deepEqual(allow(request()),{allowed:false,status:429,retryAfter:null});
});
