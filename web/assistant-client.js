const messages = {
  400: 'Request data is invalid / 请求数据无效，请重新提问。',
  403: 'AI access denied / AI 访问验证失败，请检查演示访问码。',
  404: 'AI endpoint is unavailable / 当前预览没有 AI 接口，请启动开发服务。',
  413: 'Request is too large / 请求内容过大，请缩小选区范围。',
  422: 'Request or AI recommendation failed location/plant validation / 请求或 AI 建议未通过位置和植物校验，请重试。',
  429: 'AI request limit reached / 已达到 AI 请求次数上限。',
  502: 'AI provider request failed / 模型服务请求失败，请稍后重试。',
  503: 'AI service is not configured / AI 服务尚未配置。',
  504: 'AI request timed out / AI 处理超时，请稍后重试。'
};
const providerMessages = new Map([
  ['AI access service unavailable.', 'AI quota service is temporarily unavailable / AI 额度验证服务暂时不可用，请稍后重试。'],
  ['AI provider authentication failed.', 'AI provider credentials were rejected / 模型服务拒绝了服务端密钥，请检查配置。'],
  ['AI provider balance insufficient.', 'AI provider balance is insufficient / 模型账户余额不足或欠费。已充值请稍候重试，并确认充值账号与密钥所属账号一致。'],
  ['AI provider free tier exhausted.', 'AI provider free tier is exhausted / 免费额度已用完。请检查“免费额度用完即停”设置；仅充值可能无法恢复调用。'],
  ['AI provider access denied.', 'AI provider access denied / 模型服务拒绝访问，请检查模型权限、账户状态及接口配置；这不一定是密钥错误。'],
  ['AI provider usage limit reached.', 'AI provider usage limit reached / 模型服务限流或额度不足，请稍后重试或检查额度。'],
  ['AI provider model unavailable.', 'Configured model is unavailable / 当前配置的模型不可用，请检查服务端模型设置。']
]);
export function requestDemoAccessCode(){
  if(typeof document==='undefined')return Promise.resolve(null);
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.setAttribute('aria-label','Demo AI access / 演示 AI 访问');
    dialog.style.cssText='max-width:min(420px,90vw);border:1px solid #cddcd5;border-radius:20px;padding:28px;color:#183e32;background:#fff;box-shadow:0 20px 80px #173a3240';
    dialog.innerHTML='<form><h2 style="font:600 22px system-ui;margin:0 0 12px">AI demo access / 演示访问</h2><label style="display:block;font:15px system-ui">Demo AI access code / 演示访问码<input type="password" name="code" required autocomplete="off" autofocus style="display:block;box-sizing:border-box;width:100%;margin:12px 0 20px;padding:12px;border:1px solid #b7cbc1;border-radius:10px;font:16px system-ui"></label><div style="display:flex;gap:12px;justify-content:flex-end"><button type="button" style="padding:10px 16px">Cancel / 取消</button><button type="submit" style="padding:10px 16px;background:#216451;color:white;border:0;border-radius:10px">Unlock AI / 启用</button></div></form>';
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();finish(dialog.querySelector('input').value);});
    dialog.querySelector('button[type=button]').addEventListener('click',()=>finish(null));
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    document.body.appendChild(dialog);dialog.showModal();
  });
}
export function createAssistantClient({fetcher=fetch,requestAccessCode=requestDemoAccessCode}={}) {
  let requiresAccess=false,accessCode='';
  return {
    async status(){
      try {const response=await fetcher('/api/assistant',{signal:AbortSignal.timeout(4000)});if(!response.ok)return {configured:false,reachable:response.status!==404};const data=await response.json();requiresAccess=data.requiresAccess===true;return {configured:data.configured===true,reachable:true};}
      catch{return {configured:false,reachable:false};}
    },
    async ask(payload,{signal,onEvent}={}){
      if(requiresAccess && !accessCode){
        const value=await requestAccessCode();
        if(!value)throw new Error('AI access cancelled / 已取消 AI 访问验证。');
        accessCode=value.trim();
      }
      let response;
      try {
        const json=JSON.stringify(payload);
        let body=json;
        const headers={'Content-Type':'application/json',...(onEvent?{Accept:'application/x-ndjson'}:{})};
        if(accessCode)headers['X-AI-Access-Code']=accessCode;
        if(payload.buildingIndex && typeof CompressionStream !== 'undefined') {
          body=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
          headers['Content-Encoding']='gzip';
          // Vercel eagerly parses application/json before our gzip decoder.
          headers['Content-Type']='application/octet-stream';
        }
        if(payload.buildingIndex && (typeof body==='string'?new TextEncoder().encode(body).byteLength:body.byteLength)>4*1024*1024) throw new Error('Building query transfer exceeds 4 MB');
        response=await fetcher('/api/assistant',{method:'POST',headers,body,signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(payload.buildingIndex ? 95000 : 22000)]) : AbortSignal.timeout(payload.buildingIndex ? 95000 : 22000)});
      } catch(error) {
        if(signal?.aborted)throw error;
        if(error?.name==='TimeoutError'||error?.name==='AbortError')throw new Error(messages[504]);
        throw new Error('Cannot reach the local AI service / 无法连接本地 AI 服务，请确认开发服务正在运行。');
      }
      if(!response.ok){
        if(response.status===403){accessCode='';requiresAccess=true;}
        let body;try{body=await response.json();}catch{/* A static HTML error must not be shown as an AI response. */}
        const retryAfter=Number(response.headers?.get?.('Retry-After'));
        const wait=response.status===429&&Number.isFinite(retryAfter)&&retryAfter>0?` Retry in ${Math.ceil(retryAfter)}s / ${Math.ceil(retryAfter)} 秒后再试。`:'';
        throw new Error(`${providerMessages.get(body?.message) ?? messages[response.status] ?? 'AI request failed / AI 请求失败。'} (HTTP ${response.status ?? 'unknown'})${wait}`);
      }
      if (response.headers?.get?.('Content-Type')?.includes('application/x-ndjson')) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '', result = null;
        const consume = line => {
          if (!line.trim()) return;
          const event = JSON.parse(line);
          if (event.type === 'error') throw new Error(`${providerMessages.get(event.message) ?? messages[event.status] ?? 'AI request failed'} (HTTP ${event.status})`);
          if (event.type === 'result') result = event.reply;
          else onEvent?.(event);
        };
        try {
          while (true) {
            const chunk = await reader.read();
            buffer += decoder.decode(chunk.value ?? new Uint8Array(), {stream:!chunk.done});
            if (buffer.length > 2 * 1024 * 1024) throw new Error('AI stream is too large');
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0,newline); buffer = buffer.slice(newline+1); consume(line); }
            if (chunk.done) break;
          }
          if (buffer.trim()) consume(buffer);
          if (!result) throw new Error('AI stream ended before completion / 回复未完成，选区保留。');
          return result;
        } catch (error) { await reader.cancel().catch(()=>{}); throw error; }
        finally { reader.releaseLock(); }
      }
      try{return await response.json();}catch{throw new Error('AI endpoint returned an invalid response / AI 接口回复格式无效，请确认使用开发服务。');}
    }
  };
}
