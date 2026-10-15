import { APICallError } from 'ai';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createAssistantService } from '../src/adapters/assistant-service.js';
import { createQwenAssistantService } from '../src/adapters/qwen-assistant.js';
import { createProductionAssistantAccess } from '../src/adapters/production-assistant-access.js';
const catalog=JSON.parse(await readFile(new URL('../src/data/plants.json',import.meta.url),'utf8'));

function knownProviderCode(error) {
  if(!error)return null;
  let body;
  if(typeof error.responseBody==='string' && error.responseBody.length<=131072){
    try{body=JSON.parse(error.responseBody);}catch{/* Non-JSON provider failures remain generic. */}
  }
  const known=new Set(['Arrearage','isv.OUT_OF_SERVICE','AllocationQuota.FreeTierOnly','InvalidApiKey','invalid_api_key']);
  return [error.data?.error?.code,error.data?.code,body?.error?.code,body?.code].find(code=>known.has(code)) ?? null;
}

export function createAssistantHandler(service=createAssistantService({catalog})) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    let streamStarted = false;
    const requestId=randomUUID(),started=Date.now(),toolStarts=new Map();
    const diagnostic=data=>{
      if(!['ready','tool-start','tool-end','complete','failed'].includes(data.type))return;
      const elapsedMs=Date.now()-started,tool=typeof data.tool==='string'?data.tool.slice(0,80):null,key=data.toolCallId??tool;
      const record={requestId,type:data.type,elapsedMs,...(tool?{tool}:{}),...(data.type==='tool-end'?{success:data.success===true,durationMs:toolStarts.has(key)?elapsedMs-toolStarts.get(key):null}:{})};
      if(data.type==='tool-start')toolStarts.set(key,elapsedMs);
      if(data.type==='tool-end')toolStarts.delete(key);
      console.info('Assistant diagnostic',record);
    };
    const event = data => {
      diagnostic(data);
      if (res.destroyed) return;
      if (!streamStarted) { res.statusCode = 200; res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.flushHeaders?.(); streamStarted = true; }
      res.write(`${JSON.stringify(data)}\n`);
    };
    const send=(status,body)=>{if(streamStarted){event({type:'error',status,...body});res.end();}else{res.statusCode=status;res.end(JSON.stringify(body));}};
    if(req.method==='GET')return send(200,{configured:service.configured,requiresAccess:service.requiresAccess===true,mode:service.configured?'ai-draft':'rules',message:service.configured?'AI suggestions require review.':'AI not configured. Local screening remains available.'});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{message:'Method not allowed'});}
    if(!service.configured)return send(503,{message:'AI not configured. Use local screening.'});
    let access;
    try { access=await service.authorize(req); }
    catch { return send(503,{message:'AI access service unavailable.'}); }
    if(!access || (typeof access==='object' && access.allowed!==true)) {
      const status=[429,503].includes(access?.status)?access.status:403;
      if(status===429 && Number.isInteger(access.retryAfter) && access.retryAfter>0)res.setHeader('Retry-After',String(access.retryAfter));
      return send(status,{message:status===429?'AI request limit reached.':status===503?'AI access service unavailable.':'Access denied'});
    }
    const binaryGzip=req.headers['content-encoding']==='gzip' && /^application\/octet-stream(?:;|$)/i.test(req.headers['content-type']??'');
    if(!binaryGzip && !/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))return send(415,{message:'Expected application/json'});
    const streaming = /application\/x-ndjson/.test(req.headers.accept ?? '');
    // A bounded compact model index replaces the old 80-location payload; raw IFC/audio are never accepted.
    const requestLimit = streaming ? 4 * 1024 * 1024 : 131072;
    let payload;
    const encoding = req.headers['content-encoding'];
    if (encoding && encoding !== 'gzip') return send(415,{message:'Unsupported request encoding'});
    try {
      if (req.body !== undefined && !Buffer.isBuffer(req.body)) {
        const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
        if(Buffer.byteLength(raw)>requestLimit)throw new RangeError();payload=JSON.parse(raw);
      } else {
        let raw;
        if (Buffer.isBuffer(req.body)) raw=req.body;
        else {let size=0;const chunks=[];for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>requestLimit)throw new RangeError();chunks.push(Buffer.from(chunk));}raw=Buffer.concat(chunks);}
        if(raw.byteLength>requestLimit)throw new RangeError();
        if(encoding==='gzip')raw=gunzipSync(raw,{maxOutputLength:16*1024*1024});
        payload=JSON.parse(raw.toString());
      }
    } catch(error){return send(error instanceof RangeError || error?.code==='ERR_BUFFER_TOO_LARGE'?413:400,{message:'Invalid or oversized request'});}
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on?.('close', disconnect);
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(payload.buildingIndex ? 90000 : 20000)]);
      const reply=await service.recommend(payload,{signal, ...(streaming ? {onEvent:event} : {})});
      diagnostic({type:'complete'});
      if (streamStarted) { event({type:'result',reply}); res.end(); return; }
      return send(200,reply);
    } catch(error){
      // Inspect SDK types, numeric statuses and whitelisted codes only; never expose raw provider data.
      const causes=[];for(let cause=error;cause && causes.length<5 && !causes.includes(cause);cause=cause.cause)causes.push(cause);
      const providerError=causes.find(cause=>APICallError.isInstance(cause));
      const providerCode=knownProviderCode(providerError);
      const known=new Set(['AbortError','TimeoutError','AI_APICallError','AI_NoObjectGeneratedError','AI_NoOutputGeneratedError','AI_NoContentGeneratedError','AI_TypeValidationError','AI_JSONParseError','TypeError']);
      const kind=known.has(error?.name)?error.name:'unknown';
      diagnostic({type:'failed'});
      console.warn('Assistant generation failed',{requestId,kind,providerStatus:providerError?.statusCode ?? null,providerCode});
      if(causes.some(cause=>cause.name==='TimeoutError'||cause.name==='AbortError'))return send(504,{message:'AI request timed out.'});
      if(['Arrearage','isv.OUT_OF_SERVICE'].includes(providerCode))return send(503,{message:'AI provider balance insufficient.'});
      if(providerCode==='AllocationQuota.FreeTierOnly')return send(503,{message:'AI provider free tier exhausted.'});
      if(providerError?.statusCode===401 || ['InvalidApiKey','invalid_api_key'].includes(providerCode))return send(502,{message:'AI provider authentication failed.'});
      if(providerError?.statusCode===403)return send(502,{message:'AI provider access denied.'});
      if(providerError?.statusCode===429)return send(503,{message:'AI provider usage limit reached.'});
      if(providerError?.statusCode===404)return send(502,{message:'AI provider model unavailable.'});
      if(causes.some(cause=>cause instanceof TypeError || ['AI_NoObjectGeneratedError','AI_NoOutputGeneratedError','AI_NoContentGeneratedError','AI_TypeValidationError','AI_JSONParseError'].includes(cause.name)))return send(422,{message:'Recommendation failed validation. Use local screening.'});
      return send(502,{message:'AI unavailable. Use local screening.'});
    } finally { res.off?.('close', disconnect); }
  };
}

export function createConfiguredAssistantHandler(options = {}) {
  const production = options.authorize === undefined;
  const authorize = production ? createProductionAssistantAccess({env:options.env ?? process.env}) : options.authorize;
  const service = createQwenAssistantService({ ...options, catalog, authorize });
  service.requiresAccess = production && service.configured;
  return createAssistantHandler(service);
}

// Production requires both provider configuration and the durable demo access policy.
export default createConfiguredAssistantHandler();
