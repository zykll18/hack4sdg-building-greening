import { IfcAPI, IFCRELVOIDSELEMENT, IFCRELFILLSELEMENT, IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELDEFINESBYPROPERTIES, IFCRELASSOCIATESMATERIAL, IFCRELDEFINESBYTYPE, IFCPROJECT } from 'web-ifc';

/** Read explicit IFC relationships locally. Only GUID references leave the browser; no inferred geometry or code execution. */
export async function readIfcRelationships(bytes, { wasmPath = '/wasm/', api = null } = {}) {
  const reader = api ?? new IfcAPI();
  let modelId;
  try {
    if (!api) { reader.SetWasmPath(wasmPath, true); await reader.Init(); }
    modelId = reader.OpenModel(bytes);
    const references = new Map(), propertyData = new Map(), guidCache = new Map();
    const elementProperties = new Map(), materialData = new Map(), typeByElement = new Map(), definitions = new Map();
    const line = ref => ref && Number.isInteger(ref.value) ? reader.GetLine(modelId, ref.value) : null;
    const projectUnits = new Map();
    const unitName = (ref, seen = new Set()) => {
      if (!ref || seen.has(ref.value)) return null;
      seen.add(ref.value);
      const unit = line(ref);
      if (!unit) return null;
      if (unit.Name?.value) return `${unit.Prefix?.value ?? ''}${unit.Name.value}`;
      if (unit.Elements) return unit.Elements.map(element => `${unitName(element.Unit, new Set(seen)) ?? 'unknown'}^${element.Exponent?.value ?? element.Exponent}`).join(' · ');
      return null;
    };
    const guid = ref => {
      if (!ref || !Number.isInteger(ref.value)) return null;
      if (!guidCache.has(ref.value)) guidCache.set(ref.value, reader.GetLine(modelId, ref.value)?.GlobalId?.value ?? null);
      return guidCache.get(ref.value);
    };
    const entry = globalId => {
      if (!references.has(globalId)) references.set(globalId, { spatialContainers: [], propertySets: [], openings: [] });
      return references.get(globalId);
    };
    const visit = (type, fn) => {
      const ids = reader.GetLineIDsWithType(modelId, type);
      for (let i = 0; i < ids.size(); i++) fn(reader.GetLine(modelId, ids.get(i)));
    };
    visit(IFCPROJECT, project => {
      for (const ref of line(project.UnitsInContext)?.Units ?? []) {
        const kind = line(ref)?.UnitType?.value, name = unitName(ref);
        if (kind && name) projectUnits.set(kind, name);
      }
    });
    const valueKinds = { LengthValue: 'LENGTHUNIT', AreaValue: 'AREAUNIT', VolumeValue: 'VOLUMEUNIT', WeightValue: 'MASSUNIT', TimeValue: 'TIMEUNIT', CountValue: 'COUNT' };
    const readDefinition = ref => {
      const definition = line(ref);
      if (!definition?.GlobalId?.value) return null;
      const id = definition.GlobalId.value;
      if (propertyData.has(id)) return id;
      const properties = [];
      const readProperty = (ref, prefix = '', seen = new Set()) => {
        if (seen.has(ref.value)) return;
        seen.add(ref.value);
        const property = line(ref);
        if (!property?.Name?.value) return;
        const name = `${prefix}${property.Name.value}`;
        for (const child of [...(property.HasProperties ?? []), ...(property.HasQuantities ?? [])]) readProperty(child, `${name}.`, new Set(seen));
        const key = Object.keys(valueKinds).find(key => property[key] !== undefined);
        const wrapped = key ? property[key] : property.NominalValue;
        const value = wrapped?.value ?? wrapped;
        if (!['string', 'number', 'boolean'].includes(typeof value)) return;
        const nominalKind = typeof wrapped?.name === 'string' ? wrapped.name.toUpperCase().replace('IFC', '').replace('MEASURE', 'UNIT') : null;
        const unit = property.Unit ? unitName(property.Unit) ?? 'Unresolved explicit IFC unit' : key ? (key === 'CountValue' ? 'count' : projectUnits.get(valueKinds[key]) ?? 'Project unit not resolved') : projectUnits.get(nominalKind);
        properties.push({ name: name.slice(0,128), value, ...(unit ? { unit } : {}) });
      };
      for (const property of [...(definition.HasProperties ?? []), ...(definition.Quantities ?? [])]) readProperty(property);
      propertyData.set(id, properties);
      definitions.set(id, definition.Name?.value ?? id);
      return id;
    };
    const fillings = new Map();
    visit(IFCRELFILLSELEMENT, relation => {
      const opening = guid(relation.RelatingOpeningElement), element = guid(relation.RelatedBuildingElement);
      if (opening && element) { if (!fillings.has(opening)) fillings.set(opening, []); fillings.get(opening).push(element); }
    });
    visit(IFCRELVOIDSELEMENT, relation => {
      const wall = guid(relation.RelatingBuildingElement), opening = guid(relation.RelatedOpeningElement);
      if (wall && opening) entry(wall).openings.push({ globalId: opening, fillingGlobalIds: fillings.get(opening) ?? [] });
    });
    visit(IFCRELCONTAINEDINSPATIALSTRUCTURE, relation => {
      const spatial = guid(relation.RelatingStructure);
      for (const ref of relation.RelatedElements ?? []) { const id = guid(ref); if (id && spatial) entry(id).spatialContainers.push(spatial); }
    });
    visit(IFCRELDEFINESBYPROPERTIES, relation => {
      const propertySet = readDefinition(relation.RelatingPropertyDefinition);
      for (const ref of relation.RelatedObjects ?? []) {
        const id = guid(ref);
        if (id && propertySet) entry(id).propertySets.push(propertySet);
      }
    });
    visit(IFCRELDEFINESBYTYPE, relation => {
      const typeId = guid(relation.RelatingType), type = line(relation.RelatingType);
      if (!typeId || !type) return;
      for (const ref of type.HasPropertySets ?? []) {
        const propertySet = readDefinition(ref);
        if (propertySet) entry(typeId).propertySets.push(propertySet);
      }
      for (const ref of relation.RelatedObjects ?? []) {
        const id = guid(ref);
        if (id) typeByElement.set(id, typeId);
      }
    });
    // Materials have no GlobalId. Follow their explicit associations and retain layer quantities.
    const readMaterial = root => {
      const output = [], seen = new Set();
      const walk = (ref, path = 'Material', inheritedName = '') => {
        if (!ref || seen.has(ref.value)) return;
        seen.add(ref.value);
        const material = line(ref);
        if (!material) return;
        const name = material.Name?.value ?? inheritedName;
        if (name) output.push({ name: `${path}.Name`.slice(0,128), value: name });
        if (material.Category?.value) output.push({ name: `${path}.Category`.slice(0,128), value: material.Category.value });
        if (material.LayerThickness?.value !== undefined) output.push({ name: `${path}.Thickness`.slice(0,128), value: material.LayerThickness.value, unit: projectUnits.get('LENGTHUNIT') ?? 'Project unit not resolved' });
        if (material.Fraction?.value !== undefined) output.push({ name: `${path}.Fraction`.slice(0,128), value: material.Fraction.value });
        for (const key of ['Material','ForLayerSet','ForProfileSet']) if (material[key]) walk(material[key], `${path}.${key}`);
        for (const key of ['MaterialLayers','MaterialConstituents','MaterialProfiles','Materials']) (material[key] ?? []).forEach((child,i) => walk(child, `${path}.${key}[${i+1}]`));
      };
      walk(root);
      return output;
    };
    visit(IFCRELASSOCIATESMATERIAL, relation => {
      const properties = readMaterial(relation.RelatingMaterial);
      for (const ref of relation.RelatedObjects ?? []) {
        const id = guid(ref);
        if (id) materialData.set(id, [...(materialData.get(id) ?? []), ...properties]);
      }
    });
    const allIds = new Set([...references.keys(), ...materialData.keys(), ...typeByElement.keys()]);
    for (const id of allIds) {
      const type = typeByElement.get(id), inherited = type ? references.get(type)?.propertySets ?? [] : [];
      const direct = references.get(id)?.propertySets ?? [];
      const properties = new Map();
      for (const setId of [...inherited, ...direct]) for (const p of propertyData.get(setId) ?? []) {
        const name = `${definitions.get(setId)}.${p.name}`.slice(0,128);
        properties.set(name, { ...p, name });
      }
      for (const p of [...(materialData.get(type) ?? []), ...(materialData.get(id) ?? [])]) properties.set(p.name, p);
      if (type) entry(id).propertySets = [...new Set([...inherited, ...direct])];
      elementProperties.set(id, [...properties.values()]);
    }
    return { references, propertyData, elementProperties, status: 'Explicit IFC properties, quantities and material associations are indexed by component, including type properties. Values retain declared explicit or project units; no numeric unit conversion or structural-capacity inference. Missing data is not proof of absent physical features.' };
  } finally {
    if (modelId !== undefined) reader.CloseModel(modelId);
    if (!api) reader.Dispose();
  }
}
