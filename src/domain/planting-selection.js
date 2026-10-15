export const DEFAULT_PLANTING_COVERAGE = 0.5;
export const DEFAULT_PLANTS = { roof: 'sedum-lineare', facade: 'ficus-pumila', terrace: 'ophiopogon-japonicus', ground: 'arachis-pintoi' };

export function normalizePlantingSelection(input = {}, type, catalog) {
  const plantId = input.plantId ?? DEFAULT_PLANTS[type];
  const plant = catalog.plants.find(plant => plant.id === plantId);
  if (!plant || !plant.applicationRegions.includes(type)) throw new Error('This plant is not mapped to the selected location type. / 该植物不适用于此位置类型。');
  const density = input.density ?? 1;
  const coverageFraction = input.coverageFraction ?? null;
  if (!Number.isFinite(density) || density < .5 || density > 2) throw new RangeError('Visual density must be between 0.5 and 2.');
  if (coverageFraction !== null && (!Number.isFinite(coverageFraction) || coverageFraction < 0 || coverageFraction > 1)) throw new RangeError('Planting coverage must be between 0 and 100%.');
  return { plantId, density, coverageFraction, modelKind: 'procedural-concept', status: 'conditional' };
}

// The same effective coverage is used by rendering, calculations and exports.
export function plantingProfile(region, plan) {
  const profile = plan.profiles[region.type];
  if (!profile) throw new Error('Unsupported region type');
  const fraction = region.planting?.coverageFraction;
  if (fraction == null) return profile;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('Planting coverage must be between 0 and 100%.');
  return { ...profile, coverageFraction: fraction };
}


/** Model-scoped selection chronology. Editing an existing key does not select it again. */
export function createPlantingOrder() {
  const sequence = new Map();
  let next = 0;
  return {
    sort(targets) {
      for (const target of targets) if (!sequence.has(target.key)) sequence.set(target.key, ++next);
      return [...targets].sort((a, b) => sequence.get(b.key) - sequence.get(a.key));
    },
    remove(key) { sequence.delete(key); },
    clear() { sequence.clear(); next = 0; }
  };
}

/** Inspection is independent of planting membership: toggling never edits a planting plan. */
export function createInspectionSelection() {
  const locations = new Map();
  return {
    toggle(selection, modelVersion) {
      if (!selection?.globalId || selection.modelVersion !== modelVersion) return false;
      if (locations.has(selection.globalId)) { locations.delete(selection.globalId); return false; }
      locations.set(selection.globalId, selection); return true;
    },
    remove(globalId) { locations.delete(globalId); },
    items() { return [...locations.values()].reverse(); },
    clear() { locations.clear(); }
  };
}
