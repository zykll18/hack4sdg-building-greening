/** Labels are for display only. Keep the complete IFC identities in validation/selection. */
export function formatAssistantText(text, locations, plants = []) {
  const aliases = [
    ...locations.map(row => [row.candidate.globalId, row.label]),
    ...plants.map(plant => [plant.id, `${plant.commonNameEn} · ${plant.commonNameZh}`])
  ].filter(([id, label]) => id && label).sort((a, b) => b[0].length - a[0].length);
  let result = text;
  for (const [id, label] of aliases) result = result.split(id).join(label);
  result=result.replace(/^#{1,6}\s+/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1');
  return result.replace(/位置\s*ID\s*[:：]?/gi, '位置：').replace(/植物\s*ID\s*[:：]?/gi, '植物：');
}

/** Carry complete identities to Qwen; readable aliases are only for the transcript. */
export function assistantHistory(turns, retainedTurns = 4) {
  return turns.slice(-retainedTurns).flatMap(turn=>[
    {role:'user',content:turn.question},
    {role:'assistant',content:JSON.stringify({answer:turn.reply.answer,recommendations:turn.reply.recommendations.map(({globalId,type,plantId,coverageFraction,plantingPlan})=>({globalId,type,plantId,coverageFraction,plantingPlan})),...(turn.reply.changes?.length?{changes:turn.reply.changes}:{})})}
  ]);
}

/** Record public execution milestones only; never retain prompts, tool arguments or model reasoning. */
export function createAssistantTrace(now = () => performance.now()) {
  const started=now(),events=[],running=new Map();
  return {
    record(event){
      if(!['preparing','sent','ready','tool-start','tool-end','answer-start','complete','failed','cancelled'].includes(event.type))return;
      const elapsedMs=Math.max(0,Math.round(now()-started)),tool=typeof event.tool==='string'?event.tool.slice(0,80):null;
      const key=event.toolCallId ?? tool;
      const entry={type:event.type,elapsedMs,...(tool?{tool}:{}),...(event.type==='tool-end'?{success:event.success===true,durationMs:running.has(key)?elapsedMs-running.get(key):null}:{})};
      if(event.type==='tool-start')running.set(key,elapsedMs);
      if(event.type==='tool-end')running.delete(key);
      events.push(entry);if(events.length>120)events.shift();
    },
    snapshot(){return structuredClone(events);}
  };
}
