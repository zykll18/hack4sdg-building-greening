const unwrap = (attribute) => attribute && typeof attribute === 'object' && 'value' in attribute ? attribute.value : attribute;

/** Converts engine data without inventing a GlobalId or a usable roof quantity. */
export function normalizeSelection({ modelVersion, localId, globalId, category, data }) {
  const properties = Object.entries(data ?? {})
    .filter(([, attribute]) => !Array.isArray(attribute))
    .map(([name, attribute]) => ({ name, value: unwrap(attribute) }))
    .filter(({ value }) => value !== undefined && value !== null && typeof value !== 'object');
  const name = unwrap(data?.Name);
  const guid = globalId ?? unwrap(data?.GlobalId) ?? null;
  return {
    modelVersion, localId,
    globalId: typeof guid === 'string' && guid ? guid : null,
    name: typeof name === 'string' && name ? name : 'Unnamed component',
    category: category ?? 'Unknown IFC type',
    provenance: 'ifc',
    properties
  };
}
