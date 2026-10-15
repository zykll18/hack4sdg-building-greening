import { normalizePlantingSelection } from '../src/domain/planting-selection.js';

/** Validate the entire batch before changing any region. Untargeted locations retain their exact settings. */
export function prepareAssistantPlantingUpdates(changes, current, expected, catalog) {
  const seen = new Set();
  return changes.map(change => {
    const region = current.find(r => r.globalId === change.globalId && r.type === change.type);
    const before = expected.find(r => r.globalId === change.globalId && r.type === change.type);
    if (!region || !before || seen.has(change.globalId)) throw new Error('A selected location changed. Ask again / 选区已更改，请重新提问。');
    seen.add(change.globalId);
    if (region.planting.plantId !== before.plantId || (region.planting.coverageFraction ?? .5) !== before.coverageFraction || region.usableArea.value !== before.areaM2) {
      throw new Error('Planting settings changed while AI was working. Ask again / 种植设置已更改，请重新提问。');
    }
    return { id: region.id, planting: normalizePlantingSelection({ ...region.planting, plantId: change.plantId, coverageFraction: change.coverageFraction }, region.type, catalog) };
  });
}

/** Build a model-scoped batch. Existing planting is never overwritten by a whole-building recommendation. */
export function prepareAutomaticPlanting(recommendations, rows, current, catalog, modelVersion, projectState = []) {
  const seen = new Set(), requests = [];
  for (const item of recommendations) {
    const row = rows.find(row => row.type === item.type && row.candidate.globalId === item.globalId);
    if (!row || row.candidate.modelVersion !== modelVersion || seen.has(item.globalId)) throw new Error('Recommended location is missing, duplicated or belongs to another model.');
    seen.add(item.globalId);
    if (current.some(region => region.globalId === item.globalId)) continue;
    if (!Number.isFinite(item.coverageFraction) || item.coverageFraction <= 0 || item.coverageFraction > 1) throw new Error('AI must provide a planting coverage above 0% and at most 100%.');
    const area = Number(row.area.value);
    if (!Number.isFinite(area) || area <= 0 || area > row.candidate.geometryAreaM2 * 1.001) throw new Error('Recommended surface has no valid usable area.');
    requests.push({type: item.type, localId: row.candidate.localId, globalId: item.globalId, modelVersion,
      area, groundUse: projectState.findLast(record => record.kind === 'fact' && record.scope === item.globalId && record.field === 'groundUse')?.value,
      planting: normalizePlantingSelection({plantId: item.plantId, density: 1, coverageFraction: item.coverageFraction}, item.type, catalog)});
  }
  return {requests};
}
