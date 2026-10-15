import { buildAssistantContext, validateAssistantReply, ASSISTANT_OUTPUT_SCHEMA } from '../domain/assistant-context.js';
import { buildAgentContext, validateAgentReply } from '../domain/greening-agent.js';

/** Provider-independent catalog and reply validation. Qwen generation stays in qwen-assistant.js. */
export function createAssistantService({catalog,generate=null,authorize=null}={}) {
  const configured=typeof generate==='function'&&typeof authorize==='function';
  return {
    configured,
    authorize:authorize??(()=>false),
    async recommend(payload,{signal,onEvent}={}) {
      if(!configured)throw new Error('AI service is not configured');
      if (payload.buildingIndex !== undefined) {
        const context = buildAgentContext(payload, catalog);
        onEvent?.({ type: 'ready' });
        const reply = await generate({ context, signal, onEvent });
        return validateAgentReply(reply, context, catalog);
      }
      // Rebuild eligible species from the server catalog; ignore client-supplied names/facts.
      const context=buildAssistantContext(payload,catalog);
      const reply=await generate({context,schema:ASSISTANT_OUTPUT_SCHEMA,signal});
      return validateAssistantReply(reply,context);
    }
  };
}
