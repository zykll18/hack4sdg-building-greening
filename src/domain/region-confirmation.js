/** Validate the complete set before the viewer mutates its region collection. */
export function confirmRegionBatch({ entries, existing = [], constraintsConfirmed = false }) {
  if (!constraintsConfirmed) throw new Error('Confirm the exterior/available regions and unresolved review requirements first');
  if (!entries.length) throw new Error('Choose at least one region');
  const staged = [...existing];
  const confirmed = [];
  const version = entries[0].data.modelVersion, project = entries[0].data.projectId;
  for (const { data, area } of entries) {
    if (data.modelVersion !== version || data.projectId !== project || staged.some(region => region.modelVersion !== version || region.projectId !== project)) throw new Error('Regions must belong to the same current model and project');
    if (data.screening?.canPrepare === false) throw new Error('A region failed compatibility screening');
    if (!Number.isFinite(area) || area <= 0 || !Number.isFinite(data.geometryAreaM2) || area > data.geometryAreaM2 * 1.001) throw new RangeError('Confirmed usable area must be positive and within each displayed region');
    if (staged.some(region => region.id === data.id || (data.globalId && region.globalId === data.globalId))) throw new Error('A component is already assigned. Remove its existing region or deselect it from this set.');
    if (data.type === 'ground' && staged.some(region => region.placement && Math.abs(region.placement.x - data.placement.x) < (region.placement.width + data.placement.width) / 2 && Math.abs(region.placement.z - data.placement.z) < (region.placement.depth + data.placement.depth) / 2)) throw new Error('Ground regions overlap; move the rectangle before adding it');
    const region = structuredClone(data);
    region.constraintAcknowledgement = 'User acknowledges outdoor/available area and unresolved professional checks; not engineering approval';
    region.usableArea = { value: area, unit: 'm2', provenance: 'user-confirmed', source: 'User-confirmed usable area for the selected presentation region; professional verification unresolved' };
    staged.push(region); confirmed.push(region);
  }
  return confirmed;
}
