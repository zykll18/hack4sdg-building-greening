import { normalizePlantConditions, recommendPlants } from './plant-recommendations.js';
import { calculateBeforeAfter } from './greening-plan.js';
import { normalizeCarbonModelSettings } from './carbon-model.js';
import { normalizeProjectBackground, isHongKongBackground } from './project-background.js';
import { plantCarbonEvidence, plantEvidenceSources } from './plant-carbon.js';

const kinds = ['roof', 'facade', 'terrace', 'ground'];
const string = (value, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError('Invalid agent text');
  return value.trim();
};
const plantingPlanFields = ['plantingMethod', 'substrate', 'planter', 'irrigation'];
export function cleanPlantingPlan(plan) {
  if (plan == null) return null; // Older conversations have no system proposal; do not invent one.
  if (typeof plan !== 'object' || Array.isArray(plan)) throw new TypeError('Invalid planting system proposal');
  if (!Array.isArray(plan.checks) || plan.checks.length > 8) throw new TypeError('Invalid planting checks');
  return { ...Object.fromEntries(plantingPlanFields.map(field => [field, string(plan[field], 1000)])), checks: plan.checks.map(check => string(check, 500)) };
}
const coverage = (value, fallback = .5) => {
  const fraction=value ?? fallback;
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw new TypeError('Coverage must be between 0 and 1');
  return fraction;
};
const cleanConditions = input => {
  const { region, ...conditions } = normalizePlantConditions(input);
  return conditions;
};
export function isSurfacePreviewable(surface, projectState = [], globalId) {
  if(surface?.type!=='ground')return surface?.previewable===true;
  const use=projectState.findLast(record=>record.kind==='fact'&&record.scope===globalId&&record.field==='groundUse')?.value;
  const assessment=surface.groundAssessment;
  if(use==='protected'||assessment?.classification==='protected')return false;
  return surface.previewable===true||(use==='plantable'&&assessment?.classification==='review'&&assessment.geometryReady===true);
}
/** Supply focused source facts once; detailed attributes remain queryable through tools. */
export function focusedLocationOverview(context) {
  const location=context.index.find(item=>item.globalId===context.focusedGlobalId);
  if(!location)return null;
  const relevant=location.properties.filter(p=>/material|basequantities|(^|\.)(IsExternal|LoadBearing|PredefinedType|ObjectType|Width|Height|Length|Thickness)$/i.test(p.name));
  const priority=p=>/material/i.test(p.name)?0:/basequantities/i.test(p.name)?1:2;
  relevant.sort((a,b)=>priority(a)-priority(b));
  return {globalId:location.globalId,name:location.name,category:location.category,surfaces:location.surfaces.map(surface=>({...surface,previewable:isSurfacePreviewable(surface,context.projectState,location.globalId)})),properties:relevant.slice(0,24),moreRelevantAttributes:Math.max(0,relevant.length-24),provenance:'Current IFC source attributes with declared units; surface areas are display estimates, not independent verification'};
}
/** A representative overview is not a full inventory or a building-wide feasibility claim. */
export function buildingRegionOverview(context) {
  return kinds.map(type=>{
    const locations=context.index.flatMap(item=>item.surfaces.filter(surface=>surface.type===type).map(surface=>({item,surface,ready:isSurfacePreviewable(surface,context.projectState,item.globalId)})));
    const planted=new Set(context.selected.map(item=>item.globalId));
    const ranked=locations.filter(item=>item.ready).sort((a,b)=>Number(planted.has(a.item.globalId))-Number(planted.has(b.item.globalId))||Number(a.surface.roofAssessment?.shape!=='near-flat')-Number(b.surface.roofAssessment?.shape!=='near-flat')||(b.surface.areaM2??0)-(a.surface.areaM2??0));
    return {type,screenedLocations:locations.length,previewableConceptLocations:ranked.length,needsReview:locations.filter(item=>!item.ready).length,
      representativeLocations:ranked.slice(0,3).map(({item,surface})=>({...focusedLocationOverview({...context,focusedGlobalId:item.globalId}),surfaces:[surface],alreadyPlanted:planted.has(item.globalId)})),
      scope:'Up to three representative display candidates, not a complete suitability assessment. All indexed locations remain queryable.'};
  });
}
export function buildAgentContext(payload, catalog) {
  const modelVersion = string(payload.modelVersion, 128), seen = new Set();
  if (!Array.isArray(payload.buildingIndex) || payload.buildingIndex.length > 20000) throw new TypeError('Invalid building index');
  const index = payload.buildingIndex.map(item => {
    const globalId = string(item.globalId, 128);
    if (seen.has(globalId)) throw new TypeError('Duplicate IFC identity');
    seen.add(globalId);
    const surfaces = (item.surfaces ?? []).map(surface => {
      if (!kinds.includes(surface.type) || (surface.areaM2 != null && (!Number.isFinite(surface.areaM2) || surface.areaM2 <= 0))) throw new TypeError('Invalid surface');
      return { type: surface.type, displayLabel: string(surface.displayLabel, 80), areaM2: surface.areaM2 ?? null, previewable: surface.previewable === true,
        reasons: (surface.reasons ?? []).map(s => string(s, 500)), checks: (surface.checks ?? []).map(s => string(s, 500)), roofAssessment: surface.roofAssessment ?? null,groundAssessment: surface.groundAssessment && ['planting','review','protected'].includes(surface.groundAssessment.classification) ? {classification:surface.groundAssessment.classification,geometryReady:surface.groundAssessment.geometryReady===true,evidence:typeof surface.groundAssessment.evidence==='string'?surface.groundAssessment.evidence.slice(0,800):''} : null };
    });
    if (!Array.isArray(item.properties) || item.properties.length > 2000) throw new TypeError('Invalid IFC attributes');
    const properties = item.properties.map(p => {
      if (!['string', 'number', 'boolean'].includes(typeof p.value) || (typeof p.value === 'number' && !Number.isFinite(p.value))) throw new TypeError('Invalid IFC attribute');
      return { name: string(p.name, 128), value: typeof p.value === 'string' ? p.value.slice(0, 1000) : p.value, ...(p.unit ? { unit: string(p.unit, 128) } : {}) };
    });
    let relations = null;
    if (item.relations) {
      const ids = list => {
        if (!Array.isArray(list) || list.length > 1000) throw new TypeError('Invalid IFC relationship list');
        return [...new Set(list.map(id => string(id, 128)))];
      };
      if (!Array.isArray(item.relations.openings) || item.relations.openings.length > 1000) throw new TypeError('Invalid opening references');
      relations = { spatialContainers: ids(item.relations.spatialContainers), propertySets: ids(item.relations.propertySets), openings: item.relations.openings.map(x => ({ globalId: string(x.globalId, 128), fillingGlobalIds: ids(x.fillingGlobalIds) })) };
    }
    return { globalId, name: string(item.name, 500), category: string(item.category, 128), properties, surfaces, relations };
  });
  if (payload.projectState !== undefined && !Array.isArray(payload.projectState)) throw new TypeError('Invalid project state');
  const projectState = (payload.projectState ?? []).map(record => validateRecord(record, seen));
  if (projectState.length > 200) throw new TypeError('Too many project conditions');
  const inspectedGlobalIds=payload.inspectedGlobalIds ?? [];
  if(!Array.isArray(inspectedGlobalIds)||inspectedGlobalIds.length>1000||inspectedGlobalIds.some(id=>!seen.has(id)))throw new TypeError('Invalid inspected locations');
  const selected = (payload.selected ?? []).map((item,i) => {
    if (!seen.has(item.globalId) || !kinds.includes(item.type) || !Number.isFinite(item.areaM2) || item.areaM2 <= 0 || !Number.isFinite(item.coverageFraction) || item.coverageFraction < 0 || item.coverageFraction > 1) throw new TypeError('Invalid selected location');
    const plant = catalog.plants.find(p => p.id === item.plantId);
    if (!plant?.applicationRegions.includes(item.type)) throw new TypeError('Invalid selected plant');
    return { ordinal:i+1,displayLabel:index.find(x=>x.globalId===item.globalId)?.surfaces.find(x=>x.type===item.type)?.displayLabel ?? item.globalId, globalId: item.globalId, type: item.type, areaM2: item.areaM2, plantId: item.plantId, coverageFraction: item.coverageFraction };
  });
  if (selected.length > 1000 || new Set(selected.map(x => x.globalId)).size !== selected.length) throw new TypeError('Invalid selection size');
  const history = payload.history ?? [];
  if (!Array.isArray(history) || history.length > 20 || history.length % 2) throw new TypeError('Invalid conversation');
  const conversation = history.map((message, i) => {
    if (message.role !== (i % 2 ? 'assistant' : 'user')) throw new TypeError('Invalid conversation role');
    return { role: message.role, content: string(message.content, i % 2 ? 12000 : 1000) };
  });
  if (!['zh-HK', 'zh-CN', 'en-US'].includes(payload.language)) throw new TypeError('Invalid language');
  const lastRecommendations = (payload.lastRecommendations ?? []).map((item,i) => {
    const location=index.find(x=>x.globalId===item.globalId);
    if(!location || !kinds.includes(item.type) || (item.plantId!==null && !catalog.plants.some(p=>p.id===item.plantId)))throw new TypeError('Invalid conversation reference');
    return {plantingPlan:cleanPlantingPlan(item.plantingPlan),ordinal:i+1,coverageFraction:coverage(item.coverageFraction),coverageRationale:typeof item.coverageRationale==='string'?string(item.coverageRationale,800):'Concept coverage target / 概念覆盖率',globalId:location.globalId,type:item.type,plantId:item.plantId,explanation:typeof item.explanation==='string'?string(item.explanation,800):'Retained conditional recommendation / 保留之前候选。',displayLabel:location.surfaces.find(x=>x.type===item.type)?.displayLabel ?? location.name};
  });
  if(lastRecommendations.length>24)throw new TypeError('Too many conversation references');
  const form = payload.formConditions;
  const projectBackground = payload.projectBackground == null ? null : normalizeProjectBackground(payload.projectBackground);
  if (form && form.scope !== null && !seen.has(form.scope)) throw new TypeError('Invalid condition scope');
  return { mode: 'agent', modelVersion, catalogVersion: catalog.version, question: string(payload.question, 1000), language: payload.language,
    projectBackground,
    carbonModelSettings: payload.carbonModelSettings == null || !isHongKongBackground(projectBackground) ? null : normalizeCarbonModelSettings(payload.carbonModelSettings),
    history: conversation, index, selected, inspectedGlobalIds:[...new Set(inspectedGlobalIds)], projectState, lastRecommendations, formConditions: form ? { scope: form.scope, values: cleanConditions(form.values) } : null,
    buildingName: string(payload.buildingName ?? 'Current building', 500), focusedGlobalId: seen.has(payload.focusedGlobalId) ? payload.focusedGlobalId : null,
    indexScope: 'All entities with GlobalId exposed by the loaded IFC/Fragments model, including property sets and quantities; scalar attributes and screened surfaces. Internal metadata is excluded; long attribute strings may be clipped. Geographic north, actual sunlight, irrigation and engineering approval are not established.',
    relationshipStatus: string(payload.relationshipStatus ?? 'IFC relationships unavailable', 500),
    unindexedSelectedCount: Number.isInteger(payload.unindexedSelectedCount) && payload.unindexedSelectedCount >= 0 ? payload.unindexedSelectedCount : 0,
    unidentifiedCount: Number.isInteger(payload.unidentifiedCount) && payload.unidentifiedCount >= 0 ? payload.unidentifiedCount : 0 };
}

const fields = ['soilDepthMm', 'light', 'irrigation', 'month', 'facadeSystem', 'maintenance', 'goal','groundUse'];
function validateRecord(record, ids) {
  if (!record || !['fact', 'preference', 'hypothesis'].includes(record.kind) || !fields.includes(record.field) || (record.scope !== 'project' && !ids.has(record.scope))) throw new TypeError('Invalid project condition');
  const value = typeof record.value === 'number' ? record.value : string(record.value, 300);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Invalid condition value');
  if (record.kind === 'fact') {
    if (!['soilDepthMm', 'light', 'irrigation', 'month', 'facadeSystem','groundUse'].includes(record.field)) throw new TypeError('A preference is not a site fact');
    if(record.field==='groundUse'){if(record.scope==='project'||!['plantable','protected'].includes(value))throw new TypeError('Ground use requires a specific component and explicit available/protected use');}
    else cleanConditions({ [record.field]: value });
  }
  return { scope: record.scope, kind: record.kind, field: record.field, value, evidence: string(record.evidence, 1000), source: 'user-reported' };
}
export function locationConditions(context, globalId, type) {
  const conditions = {};
  if (context.projectBackground?.irrigation && context.projectBackground.irrigation !== 'unknown') conditions.irrigation = context.projectBackground.irrigation;
  for (const record of context.projectState) if (record.kind === 'fact' && record.scope === 'project') conditions[record.field] = record.value;
  if (context.formConditions?.scope === globalId) Object.assign(conditions, Object.fromEntries(Object.entries(context.formConditions.values).filter(([, value]) => value !== null && value !== 'unknown')));
  for (const record of context.projectState) if (record.kind === 'fact' && record.scope === globalId) conditions[record.field] = record.value;
  return normalizePlantConditions({ ...conditions, region: type });
}
export function validateAgentReply(reply, context, catalog) {
  const recommendations = reply.recommendations ?? [];
  if (!Array.isArray(recommendations) || recommendations.length > 24) throw new TypeError('Invalid recommendation size');
  const seen = new Set();
  const checked = recommendations.map(item => {
    const location = context.index.find(x => x.globalId === item.globalId), surface = location?.surfaces.find(x => x.type === item.type);
    if (!location) throw new TypeError('Unknown IFC location: use the complete GlobalId returned by inspectLocation, not its display label');
    if (!surface) throw new TypeError('This location has no surface of the proposed type; use the screened surface type returned by inspectLocation');
    if(seen.has(item.globalId))throw new TypeError('Duplicate recommendation for one location: choose one primary plant/system per GlobalId; discuss alternatives in the answer');
    if(!isSurfacePreviewable(surface,context.projectState,item.globalId))throw new TypeError('This surface is not available for planting preview; inspect its checks or ask for a specific ground-use confirmation where applicable');
    seen.add(item.globalId);
    const shortlist = recommendPlants(catalog, locationConditions(context, item.globalId, item.type));
    if (item.plantId !== null && !shortlist.candidates.some(p => p.plantId === item.plantId)) throw new TypeError('Plant conflicts with recorded conditions');
    return { plantingPlan:cleanPlantingPlan(item.plantingPlan), globalId: item.globalId, type: item.type, plantId: item.plantId, coverageFraction:coverage(item.coverageFraction,context.selected.find(x=>x.globalId===item.globalId)?.coverageFraction ?? .5),coverageRationale:typeof item.coverageRationale==='string'?string(item.coverageRationale,800):'Concept layout target, not verified maximum coverage / 概念布置目标，不是核定的最大覆盖率', explanation: string(item.explanation, 800), status: 'conditional' };
  });
  const changes = (reply.changes ?? []).map(change => {
    const target = context.selected.find(x => x.globalId === change.globalId);
    if (!target) throw new TypeError('Invalid planting change');
    const plantId = change.plantId ?? target.plantId;
    if (plantId!==target.plantId && !recommendPlants(catalog, locationConditions(context, target.globalId, target.type)).candidates.some(p => p.plantId === plantId)) throw new TypeError('Invalid change species');
    return { globalId: target.globalId, type: target.type, plantId, coverageFraction: coverage(change.coverageFraction,target.coverageFraction) };
  });
  if (changes.length > 1000 || new Set(changes.map(x => x.globalId)).size !== changes.length) throw new TypeError('Invalid changes');
  const changeMode=reply.changeMode ?? 'suggest';
  if(!['apply','suggest'].includes(changeMode))throw new TypeError('Invalid change intent');
  const changeEvidence=reply.changeEvidence ?? null;
  if(changes.length && changeMode==='apply') {
    if(typeof changeEvidence!=='string'||!changeEvidence.trim()||!context.question.includes(changeEvidence))throw new TypeError('Apply requires evidence from the current user request');
    if(/如果|假如|假设|假設|假定|\bif\b|\bsuppose\b/i.test(context.question))throw new TypeError('A hypothetical request must remain a draft');
  }
  const knownSources = new Map(catalog.plants.flatMap(plantEvidenceSources).map(source => [source.url, source]));
  const sources = (reply.sources ?? []).map(source => {
    if (!knownSources.has(source.url)) throw new TypeError('Unknown evidence source');
    return knownSources.get(source.url);
  });
  return { modelVersion: context.modelVersion, catalogVersion: context.catalogVersion, answer: string(reply.answer, 12000), recommendations: checked, changes, changeMode, changeEvidence,
    projectState: context.projectState, sources: [...new Map(sources.map(source => [source.url, source])).values()], method: 'tool-agent' };
}

// All queries operate on this request's model snapshot. None read arbitrary files or execute generated code.
export function createGreeningTools(context, catalog) {
  const evidence = new Map();
  let recommendations = [], changes = [], changeMode='suggest', changeEvidence=null;
  const locate = id => { const item = context.index.find(x => x.globalId === id); if (!item) throw new TypeError('Location is not in the current model'); return item; };
  const define = (description, properties, required, execute) => ({ description, schema: { type: 'object', properties, required, additionalProperties: false }, execute: async input => {
    try { return execute(input); } catch (error) { return { error: error instanceof TypeError ? error.message : 'Query could not be completed', recoverable: true }; }
  } });
  const fractionSchema={type:['number','null'],minimum:0,maximum:1};
  const str = { type: 'string' }, nullable = { type: ['string', 'null'] };
  const plantInfo = plant => ({ plantId: plant.id, name: plant.commonNameEn, nameZh: plant.commonNameZh, scientificName: plant.scientificName, description: plant.description,
    applicationRegions: plant.applicationRegions, applicationBasis: plant.applicationBasis, irrigationDemand: plant.irrigationDemand, pruningDemand: plant.pruningDemand,
    tolerances: plant.tolerances, referenceSoilDepthMm: plant.referenceSoilDepthMm, seasonalInterest: plant.seasonalInterest, plantingMonths: plant.plantingMonths,
    facadeSupport: plant.facadeSupport, carbonEvidence:plantCarbonEvidence(plant), evidenceScope: 'Growth form is not fixing/support approval. Seasonal interest is not guaranteed flowering or a planting window. Carbon literature is not a project reduction factor; first-year stock changes are not recurring annual fluxes. Missing values are unknown, not zero. No quantified drip-irrigation savings or project-specific load/cost evidence.', sources: plantEvidenceSources(plant), visualAvailable: Boolean(plant.visualModel?.src) });
  const sources = plants => { for (const plant of plants) for (const source of plantEvidenceSources(plant)) evidence.set(source.url, source); };
  return {
    definitions: {
      queryBuilding: define('Query current building components with filters and pagination. Missing preview surfaces do not mean the component is invisible to this query. Relationships and geographic orientation are not established.',
        { category: nullable, region: { type: ['string', 'null'], enum: [...kinds, null] }, search: nullable, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 40 } }, ['category', 'region', 'search', 'offset', 'limit'], ({ category, region, search, offset, limit }) => {
          if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) throw new TypeError('Use a page of 1–40 components');
          const rows = context.index.filter(x => (!category || x.category.toLowerCase().includes(category.toLowerCase())) && (!region || x.surfaces.some(s => s.type === region)) && (!search || `${x.name} ${x.globalId} ${x.surfaces.map(s => s.displayLabel).join(' ')}`.toLowerCase().includes(search.toLowerCase())));
          return { buildingName: context.buildingName, modelVersion: context.modelVersion, indexScope: context.indexScope, indexed: context.index.length, unidentifiedCount: context.unidentifiedCount, matched: rows.length,
            nextOffset: offset + limit < rows.length ? offset + limit : null, components: rows.slice(offset, offset + limit).map(({ properties, relations, ...item }) => item) };
        }),
      inspectLocation: define('Get component IFC attributes, inherited/direct property sets, engineering quantities with declared units, and associated material names/layer thickness. Attributes are paginated; use propertySearch Material or BaseQuantities to inspect those facts. Geometry estimates and actual site conditions remain separate.',
        {globalId:str,propertySearch:nullable,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:40}},['globalId'],({globalId,propertySearch=null,offset=0,limit=30})=>{
          if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>40)throw new TypeError('Use a page of 1–40 attributes');
          const location=locate(globalId),attributes=location.properties.filter(p=>!propertySearch||p.name.toLowerCase().includes(propertySearch.toLowerCase()));
          return {...location,surfaces:location.surfaces.map(surface=>({...surface,previewable:isSurfacePreviewable(surface,context.projectState,location.globalId)})),properties:attributes.slice(offset,offset+limit),matchedAttributes:attributes.length,nextAttributeOffset:offset+limit<attributes.length?offset+limit:null,
            provenance:'Client IFC/Fragments metadata and display geometry; not independent verification',
            selected:context.selected.find(x=>x.globalId===globalId)??null,
            conditions:context.projectState.filter(x=>x.scope==='project'||x.scope===globalId),formConditions:context.formConditions?.scope===globalId?context.formConditions:null,
            relationshipStatus:context.relationshipStatus,
            relatedComponents:[...(location.relations?.spatialContainers??[]),...(location.relations?.propertySets??[]),...(location.relations?.openings.flatMap(x=>x.fillingGlobalIds)??[])].map(id=>{
              const related=context.index.find(x=>x.globalId===id);
              return related?{globalId:id,name:related.name,category:related.category}:{globalId:id,status:'Referenced in IFC but not available in the engine index'};
            }),unknown:['Missing IFC relationships do not prove physical absence','Geographic orientation and actual sunlight','Structural loading, waterproofing and drainage approval']};
        }),
      searchPlants: define('Search all catalog species, or assess one location with its recorded facts. Preferences influence discussion, not actual water availability. Returns both candidates and conflicts; unknown traits remain unknown.',
        { globalId: nullable, region: { type: ['string', 'null'], enum: [...kinds, null] }, search: nullable }, ['globalId', 'region', 'search'], ({ globalId, region, search }) => {
          const location = globalId ? locate(globalId) : null, type = region ?? location?.surfaces[0]?.type;
          const plants = catalog.plants.filter(p => !search || `${p.id} ${p.commonNameEn} ${p.commonNameZh} ${p.scientificName} ${p.description}`.toLowerCase().includes(search.toLowerCase()));
          sources(plants);
          const assessment = type ? recommendPlants(catalog, globalId ? locationConditions(context, globalId, type) : { region: type }) : null;
          return { catalogVersion: catalog.version, plants: plants.map(plantInfo), assessment, projectPreferences: context.projectState.filter(x => x.kind === 'preference' && (x.scope === 'project' || x.scope === globalId)), notes: catalog.notes };
        }),
      retrieveGuidance: define('Retrieve reviewed plant traits and species-linked carbon literature with sources and applicability limits. Stock changes, photosynthesis and ecosystem flux are distinct; never turn them into universal annual project credits. No building codes or structural design.', { query: str }, ['query'], ({ query }) => {
        const terms = string(query).toLowerCase().split(/[\s,，。;；]+/).filter(Boolean);
        const ranked = catalog.plants.map(p => ({ p, score: terms.filter(t => JSON.stringify(plantInfo(p)).toLowerCase().includes(t)).length })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        sources(ranked.map(x => x.p));
        return { corpus: 'Reviewed structured plant-guide extracts and species-linked carbon literature; not full PDF retrieval', records: ranked.map(({ p }) => plantInfo(p)), coverage: 'Species traits, guide soil ranges and conditional carbon research. No verified project carbon factors, structural or tax evidence.' };
      }),
      recordContext: define('Record explicit user statements with an exact quote from the CURRENT question. Separate fact, preference and hypothesis; scope to project only if the user states it broadly. Corrections replace matching scoped records. Never record model guesses.',
        { scope: str, kind: { type: 'string', enum: ['fact', 'preference', 'hypothesis'] }, field: { type: 'string', enum: fields }, value: { type: ['string', 'number'] }, evidence: str }, ['scope', 'kind', 'field', 'value', 'evidence'], input => {
          if (!context.question.includes(input.evidence)) throw new TypeError('Evidence must quote the current user question');
          const record = validateRecord(input, new Set(context.index.map(x => x.globalId)));
          if(record.field==='groundUse'){
            if(!context.index.find(item=>item.globalId===record.scope)?.surfaces.some(surface=>surface.type==='ground'))throw new TypeError('Ground use applies only to an indexed ground surface, not a facade or roof');
            if(record.kind==='fact'&&!/可以.{0,20}(种植|種植|改造)|可用于|可用於|不是.{0,12}(通道|道路)|种植区|種植區|消防|通道|道路|available.{0,20}plant|can.{0,20}plant|plantable|must.{0,20}clear/i.test(record.evidence))throw new TypeError('A recommendation question does not confirm ground availability; ask for an explicit site statement');
          }
          // A hypothetical or preference cannot change actual site conditions, even if misclassified by the model.
          if (record.kind === 'fact' && /如果|假如|假设|假設|希望|偏好|想要|想少|少浇水|少澆水|\bif\b|suppose|prefer|would like|want|low.maintenance/i.test(record.evidence)) throw new TypeError('This is a hypothesis or preference, not a site fact');
          context.projectState = context.projectState.filter(x => !(x.scope === record.scope && x.kind === record.kind && x.field === record.field));
          if (context.projectState.length >= 200) throw new TypeError('Project condition capacity reached');
          context.projectState.push(record); recommendations = []; changes = [];
          return { recorded: record, recommendationsInvalidated: true };
        }),
      proposePlanting: define('Publish complete location/plant/system proposals for automatic highlight and clickable cards. Each plantingPlan includes plantingMethod, substrate (guide depth range and basis; volume only with known bed dimensions), planter (rooting space/support concept), irrigation (method and water connection requirement), and only relevant checks. These are proposed new configurations, never confirmed existing facilities. Default merge puts new/updated candidates first and keeps unrelated valid prior candidates. Choose operation=replace for an entirely new list. Only previewable surfaces can be applied; special roof concepts may still be discussed in prose. General explanations need not call this tool.',
        { operation: {type:'string',enum:['merge','replace']}, recommendations: { type: 'array', maxItems: 24, items: { type: 'object', properties: { globalId: str, type: { type: 'string', enum: kinds }, plantId: nullable, coverageFraction:{type:'number',minimum:0,maximum:1},coverageRationale:str, explanation: str, plantingPlan: { type: 'object', properties: { plantingMethod:str,substrate:str,planter:str,irrigation:str,checks:{type:'array',maxItems:8,items:str} }, required:['plantingMethod','substrate','planter','irrigation','checks'], additionalProperties:false } }, required: ['globalId', 'type', 'plantId', 'coverageFraction','coverageRationale','explanation','plantingPlan'], additionalProperties: false } } }, ['recommendations'], input => {
          const next=validateAgentReply({answer:'Draft',recommendations:input.recommendations},context,catalog).recommendations;
          const prior=[];
          if(input.operation!=='replace')for(const previous of context.lastRecommendations){
            if(next.some(item=>item.globalId===previous.globalId))continue;
            try{prior.push(...validateAgentReply({answer:'Retained',recommendations:[previous]},context,catalog).recommendations);}catch{/* A new fact can invalidate an old candidate without erasing unrelated candidates. */}
          }
          recommendations=validateAgentReply({answer:'Merged',recommendations:[...next,...prior]},context,catalog).recommendations;
          sources(catalog.plants.filter(p => recommendations.some(x => x.plantId === p.id)));
          return { recommendations, highlightedWhenAnswerCompletes: true, changesToExistingPlanting: false };
        }),
      proposeChanges: define('Change existing SELECTED planting, not a new recommendation. Choose mode=apply only for an explicit modification request, quoting the CURRENT user message as evidence; the UI executes it on completion. Choose suggest for advice or hypotheticals. Null species/coverage preserves the current value. Percentages use fractions (30%=0.3). Preserve untargeted locations. Coverage drives visuals and calculation.',
        { mode:{type:'string',enum:['apply','suggest']},evidence:nullable,changes: { type: 'array', maxItems: 1000, items: { type: 'object', properties: { globalId: str, plantId: nullable, coverageFraction: fractionSchema }, required: ['globalId', 'plantId', 'coverageFraction'], additionalProperties: false } } }, ['mode','evidence','changes'], input => {
          const result=validateAgentReply({answer:'Changes',changes:input.changes,changeMode:input.mode ?? 'suggest',changeEvidence:input.evidence ?? null},context,catalog);
          changes=result.changes;changeMode=result.changeMode;changeEvidence=result.changeEvidence;
          return {changes,status:changeMode==='apply'?'will-apply-when-response-completes':'draft-awaiting-user-apply'};
        }),
      comparePlans: define('Compare adopted planting against the original building. Use selected species/coverage; a coverage argument is a what-if, not an edit. Return the enabled reference carbon model separately: named roof EPD A1–A5 plus roof-conduction sensitivity only, with material quantities, sources, assumptions, exclusions and unmodelled areas. These numbers are not full lifecycle/whole-building savings. Full project-input net carbon remains unknown without sourced lifecycle and matched energy data. Costs require optional sourced project inputs. Never invent factors or claim net zero, certification or sequestration.',
        { years: { type: 'integer', minimum: 1, maximum: 100 }, coverageFraction: { type: ['number', 'null'], minimum: 0, maximum: 1 } }, ['years', 'coverageFraction'], ({ years, coverageFraction }) => {
          if (!Number.isInteger(years) || years < 1 || years > 100 || (coverageFraction !== null && (!Number.isFinite(coverageFraction) || coverageFraction < 0 || coverageFraction > 1))) throw new TypeError('Invalid comparison inputs');
          if(context.unindexedSelectedCount)throw new TypeError('Some selected user-defined regions are outside the IFC index. Use the Compare panel for whole-plan totals; an indexed subset must not be presented as the complete plan.');
          const regions = context.selected.map(x => ({ id: x.globalId, globalId: x.globalId, name: locate(x.globalId).surfaces.find(s => s.type === x.type)?.displayLabel ?? x.globalId, type: x.type, projectId: 'current-project', modelVersion: context.modelVersion,
            screening: { roofAssessment: locate(x.globalId).surfaces.find(s => s.type === x.type)?.roofAssessment },
            usableArea: { value: x.areaM2, unit: 'm2', provenance: 'assumed', source: 'User concept area from IFC display geometry' }, planting: { plantId: x.plantId, coverageFraction: coverageFraction ?? x.coverageFraction } }));
          return { factors: 'Reference model assumptions and sources are explicit; full project net carbon requires correction inputs. Costs require optional sourced project inputs.', comparison: calculateBeforeAfter({ regions, years, carbonModelSettings: context.carbonModelSettings }) };
        })
    },
    finish: answer => validateAgentReply({ answer, recommendations, changes, changeMode,changeEvidence, sources: [...evidence.values()] }, context, catalog)
  };
}
