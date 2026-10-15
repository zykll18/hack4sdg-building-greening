import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { createConfiguredAssistantHandler } from './api/assistant.js';
import { createLocalAssistantAccess } from './api/local-assistant-access.js';

export default defineConfig(({mode}) => {
  // QWEN_* is loaded into this Node handler only, never into define/import.meta.env.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'QWEN_');
  const assistantHandler = createConfiguredAssistantHandler({env, authorize:createLocalAssistantAccess({detailed:true})});
  return {
  plugins:[{name:'local-assistant-api',configureServer(server){server.middlewares.use('/api/assistant',(req,res,next)=>{if((req.url??'').split('?')[0]!=='/'&&(req.url??'').split('?')[0]!=='')return next();void assistantHandler(req,res).catch(()=>{if(!res.headersSent){res.statusCode=500;res.end(JSON.stringify({message:'Assistant unavailable'}));}});});}}],
  root: 'web',
  publicDir: '../public',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: '../dist', emptyOutDir: true,
    rolldownOptions: { input: {
      app: fileURLToPath(new URL('./web/index.html', import.meta.url)),
      mondoStudy: fileURLToPath(new URL('./web/mondo-study.html', import.meta.url))
    } }
  }
  };
});
