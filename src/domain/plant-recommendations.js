const regions = ['roof', 'facade', 'terrace', 'ground'];
const demands = ['low', 'moderate', 'high'];
const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// This parser accepts explicit values only. It does not infer growing conditions from IFC geometry.
export function plantQuestion(question) {
  const regionMatches = [
    ['roof', /roof|屋顶|屋頂|房顶|房頂/i],
    ['facade', /facade|wall|立面|外墙|外牆|侧墙|側牆/i],
    ['terrace', /terrace|balcony|露台|阳台|陽台/i],
    ['ground', /courtyard|ground|庭院|地面/i]
  ].filter(([, expression]) => expression.test(question));
  if (regionMatches.length > 1) throw new Error('Choose one planting location type at a time / 请先选择一种位置。');
  const overrides = {};
  if (regionMatches.length) overrides.region = regionMatches[0][0];
  const depths = [...question.matchAll(/(-?\d+(?:\.\d+)?)\s*(mm|cm|毫米|厘米)/gi)];
  if (depths.length > 1) throw new Error('Specify one soil depth / 请只提供一个土层厚度。');
  const depth = depths[0];
  if (depth) overrides.soilDepthMm = Number(depth[1]) * (/cm|厘米/i.test(depth[2]) ? 10 : 1);
  if (/low[- ]water|low irrigation|低需水|少浇水|少澆水/i.test(question)) overrides.irrigation = 'low';
  if (/partial shade|半阴|半陰/i.test(question)) overrides.light = 'partial-shade';
  else if (/shade|阴处|陰處|阴凉|陰涼|背阴|背陰/i.test(question)) overrides.light = 'shade';
  else if (/full sun|全日照/i.test(question)) overrides.light = 'sun';
  const month = question.match(/(?:\bmonth\s*|月份\s*)(\d{1,2})|\b(\d{1,2})\s*月/i);
  const namedMonth = months.findIndex(name => new RegExp(`\\b${name}\\b`, 'i').test(question));
  if (month) overrides.month = Number(month[1] ?? month[2]);
  else if (namedMonth >= 0) overrides.month = namedMonth + 1;
  return overrides;
}

export function isPlantQuestion(question) {
  if (/where|哪里|哪裡|哪儿|哪兒/i.test(question)) return false;
  return /plants?\b|species|flowers?|sedum|jasmine|lantana|foxtail|zephyr|pyrostegia|thunbergia|植物|种什么|種什麼|花期|佛甲草|络石|絡石|小葉馬纓丹|小叶马缨丹|狐尾天冬|蔥蓮|葱莲|玉簾|玉帘|炮仗花|大花老鴉嘴|大花老鸦嘴|季度|季节|季節/i.test(question);
}

export function normalizePlantConditions(input = {}) {
  const number = value => value === '' || value === null || value === undefined ? null : Number(value);
  const conditions = { region: input.region ?? 'roof', soilDepthMm: number(input.soilDepthMm), light: input.light ?? 'unknown', irrigation: input.irrigation ?? 'unknown', month: number(input.month), facadeSystem: input.facadeSystem ?? 'unknown' };
  if (!regions.includes(conditions.region)) throw new Error('Choose a supported planting location.');
  if (conditions.soilDepthMm !== null && (!Number.isFinite(conditions.soilDepthMm) || conditions.soilDepthMm <= 0)) throw new Error('Enter a positive soil depth in mm, or leave it unknown.');
  if (!['unknown','sun','partial-shade','shade'].includes(conditions.light)) throw new Error('Choose a valid light condition.');
  if (!['unknown', ...demands].includes(conditions.irrigation)) throw new Error('Choose a valid irrigation capacity.');
  if (!['unknown','available','unavailable'].includes(conditions.facadeSystem)) throw new Error('Choose a valid facade-system status.');
  if (conditions.month !== null && (!Number.isInteger(conditions.month) || conditions.month < 1 || conditions.month > 12)) throw new Error('Choose a month between 1 and 12.');
  return conditions;
}

export function recommendPlants(catalog, input = {}) {
  const conditions = normalizePlantConditions(input);
  const candidates = [], excluded = [];
  for (const plant of catalog.plants) {
    const reasons = [], checks = [], conflicts = [];
    let score = 0;
    if (!plant.applicationRegions.includes(conditions.region)) conflicts.push('No application mapping for this location type.');
    if (conditions.soilDepthMm === null) checks.push(`Confirm planting depth: guide reference ${plant.referenceSoilDepthMm.min}–${plant.referenceSoilDepthMm.max} mm.`);
    else if (conditions.soilDepthMm < plant.referenceSoilDepthMm.min) conflicts.push(`Below the guide reference depth of ${plant.referenceSoilDepthMm.min} mm.`);
    else reasons.push('Entered soil depth meets the lower guide reference; this is not load approval.');
    if (conditions.irrigation === 'unknown') checks.push(`Confirm water supply for ${plant.irrigationDemand} irrigation demand.`);
    else if (demands.indexOf(conditions.irrigation) < demands.indexOf(plant.irrigationDemand)) conflicts.push(`Irrigation capacity is below the guide's ${plant.irrigationDemand} demand.`);
    else reasons.push(`Water-supply capacity covers the guide's ${plant.irrigationDemand} demand.`);
    if (conditions.light === 'unknown') checks.push('Confirm actual light and exposure.');
    else if (conditions.light.includes('shade') && plant.tolerances.shade === true) { score += 2; reasons.push('The guide records shade tolerance.'); }
    else checks.push('This guide does not establish suitability for the entered light condition.');
    if (conditions.region === 'facade') {
      if (conditions.facadeSystem === 'unavailable') conflicts.push('No reviewed facade planting system / rooting space is available.');
      else checks.push(`${plant.facadeSupport}; review rooting space, wall finish, fixings, openings and access.`);
    }
    if (['terrace','ground'].includes(conditions.region)) checks.push('This location mapping is a project interpretation; confirm local suitability and available land.');
    if (conditions.month !== null && plant.seasonalInterest?.months.includes(conditions.month)) { score += 1; reasons.push(`Guide records ${plant.seasonalInterest.kind} interest in month ${conditions.month}.`); }
    checks.push('Professional review of loading, drainage, irrigation and maintenance is unresolved.');
    if (conflicts.length) excluded.push({ plantId: plant.id, reasons: conflicts });
    else candidates.push({ plantId: plant.id, score, status: 'conditional', reasons, checks });
  }
  candidates.sort((a,b) => b.score - a.score || a.plantId.localeCompare(b.plantId));
  return { catalogVersion: catalog.version, conditions, candidates, excluded };
}

// The future AI receives a screened shortlist, not an unrestricted request for plant names.
export function buildPlantRecommendationContext(catalog, result, modelVersion = null) {
  return {
    schemaVersion: 'building-greening-plant-context-1', catalogVersion: catalog.version,
    modelVersion, method: 'catalog-rules', conditions: result.conditions,
    instructions: ['Only rank candidate plantId values supplied here.', 'Do not invent species, source facts, planting windows, carbon factors or engineering approval.', 'Ask for missing site conditions; seasonal interest is a secondary preference.', 'Return {recommendations:[{plantId, explanation}]} with at most three entries.'],
    candidates: result.candidates.map(candidate => ({ ...candidate, plant: catalog.plants.find(plant => plant.id === candidate.plantId) }))
  };
}

export function validatePlantModelReply(reply, context) {
  if (!reply || !Array.isArray(reply.recommendations) || !reply.recommendations.length || reply.recommendations.length > 3) throw new Error('Expected one to three catalog recommendations.');
  const seen = new Set();
  return reply.recommendations.map(item => {
    const candidate = context.candidates.find(candidate => candidate.plantId === item?.plantId);
    if (!candidate || seen.has(item.plantId)) throw new Error('AI returned an unknown, excluded or duplicate plant ID.');
    if (typeof item.explanation !== 'string' || !item.explanation.trim() || item.explanation.length > 800) throw new Error('AI explanation must contain 1–800 characters.');
    seen.add(item.plantId);
    // Names, sources and checks always come from our reviewed data. AI prose remains a draft.
    return { ...candidate, draftExplanation: item.explanation };
  });
}
