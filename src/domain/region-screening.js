// Concept thresholds only; specialist system design may support different slopes.
export const SURFACE_SLOPE_LIMITS = Object.freeze({ terrace: 5 });
export const DEFAULT_ROOF_SLOPE_LIMIT = 5; // Descriptive classification only, never a preview cutoff.
const degrees = normal => Math.acos(Math.min(1, Math.max(-1, normal[1]))) * 180 / Math.PI;

/** Assess the entire original component before slope filtering/cropping can hide its shape. */
export function assessRoofForm(surface) {
  const slopes = surface.triangles.map(t => degrees(t.normal));
  const maxSlopeDegrees = slopes.length ? slopes.reduce((maximum,value)=>Math.max(maximum,value),-Infinity) : null;
  const groups = [];
  for (const triangle of surface.triangles) {
    const group = groups.find(g => g.normal.reduce((sum,n,i)=>sum+n*triangle.normal[i],0) >= Math.cos(3*Math.PI/180));
    if (group) group.area += triangle.area;
    else groups.push({normal:triangle.normal,area:triangle.area});
  }
  const significant = groups.filter(g => g.area >= surface.surfaceAreaM2*.01);
  const shape = maxSlopeDegrees === null ? 'unknown' : maxSlopeDegrees <= DEFAULT_ROOF_SLOPE_LIMIT + 1e-6 ? 'near-flat' : significant.length >= 3 ? 'curved-or-complex' : 'pitched';
  return {shape,maxSlopeDegrees,normalGroups:significant.length,defaultEligible:slopes.length>0,source:'Original display-face normals; estimated form, not a verified roof construction',defaultSlopeLimitDegrees:null};
}

/** IFC may split one arch into planar strips. Two shared source vertices link roof parts. */
export function assessRoofAssemblies(entries) {
  const parent=entries.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const vertices=new Map(),shared=new Map();
  entries.forEach(({surface},index)=>{
    const keys=new Set(surface.triangles.flatMap(t=>t.points.map(p=>p.map(n=>Math.round(n*1000)).join(','))));
    for(const key of keys){
      const owners=vertices.get(key)??[];
      for(const other of owners){const pair=`${other}:${index}`,count=(shared.get(pair)??0)+1;shared.set(pair,count);if(count>=2)parent[find(index)]=find(other);}
      owners.push(index);vertices.set(key,owners);
    }
  });
  const groups=new Map();entries.forEach((entry,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(entry);});
  const result=new Map();
  for(const group of groups.values()){
    const triangles=group.flatMap(e=>e.surface.triangles),surfaceAreaM2=triangles.reduce((sum,t)=>sum+t.area,0);
    const assessment={...assessRoofForm({triangles,surfaceAreaM2}),componentCount:group.length,source:'Connected original roof faces with at least two shared vertices; estimated assembly, not an IFC parent relation'};
    for(const entry of group)result.set(entry.globalId,assessment);
  }
  return result;
}

/** Partition source display faces locally; the excluded area never enters usable coverage. */
export function screenSurfaceBySlope(surface, type) {
  const limit = SURFACE_SLOPE_LIMITS[type];
  if (limit === undefined && type !== 'roof') return surface;
  const triangles = type === 'roof' ? surface.triangles.filter(triangle => triangle.normal[1] > 1e-6) : surface.triangles.filter(triangle => degrees(triangle.normal) <= limit + 1e-6);
  const candidateAreaM2 = triangles.reduce((sum, triangle) => sum + triangle.area, 0);
  const slopes = surface.triangles.map(triangle => degrees(triangle.normal));
  return { ...surface, triangles, surfaceAreaM2: candidateAreaM2, ...(type==='roof'?{roofAssessment:surface.roofAssessment ?? assessRoofForm(surface)}:{}), slopeScreening: {
    originalAreaM2: surface.surfaceAreaM2, candidateAreaM2,
    excludedAreaM2: Math.max(0, surface.surfaceAreaM2 - candidateAreaM2),
    minSourceSlopeDegrees: slopes.length ? slopes.reduce((minimum, value) => Math.min(minimum, value), Infinity) : null,
    maxSourceSlopeDegrees: slopes.length ? slopes.reduce((maximum, value) => Math.max(maximum, value), -Infinity) : null,
    limitDegrees: limit ?? null, source: type === 'roof' ? 'All upward original roof faces; no slope cutoff. Not engineering approval.' : 'Local display-face slope; concept threshold, not an engineering standard'
  } };
}

/** Conservative concept screening, not an engineering standard or suitability certificate. */
export function screenRegion({ type, selection, surface, buildingBox }) {
  const reasons = [], missing = ['Structural capacity, drainage and access require professional review.'];
  let blocked = false;
  const reject = (reason) => { blocked = true; reasons.push(reason); };
  const category = selection?.category ?? '';
  const attributes = Object.fromEntries((selection?.properties ?? []).map(({ name, value }) => [name, value]));
  const identity = `${selection?.name ?? ''} ${attributes.PredefinedType ?? ''} ${attributes.ObjectType ?? ''}`;
  const points = surface.triangles.flatMap((triangle) => triangle.points);
  const top = points.reduce((max, point) => Math.max(max, point[1]), -Infinity);
  if (type === 'roof') {
    if (!/^(IFCROOF|IFCSLAB)$/.test(category)) reject('Only roof or roof-slab geometry can be considered for a roof system.');
    if (!/roof|dach/i.test(identity) && category !== 'IFCROOF' && top < buildingBox.max.y - Math.max(1, (buildingBox.max.y - buildingBox.min.y) * .15)) reject('This slab is below the upper building envelope; it is not an identified roof.');
    const partition = screenSurfaceBySlope(surface, 'roof');
    const roof = surface.roofAssessment ?? partition.roofAssessment;
    if (!partition.triangles.length) reject('No upward roof display faces are available.');
    if (!blocked) {
      const stats = surface.slopeScreening ?? partition.slopeScreening;
      reasons.push(`Original ${roof.shape} roof geometry is available for concept planting without a slope cutoff. Selected surface: ${surface.surfaceAreaM2.toFixed(2)} m²; estimated maximum slope ${roof.maxSlopeDegrees?.toFixed(1) ?? 'unknown'}°.`);
      missing.push('Roof openings/edges and above-roof obstacles require checks.');
      if (roof.shape !== 'near-flat') missing.push('Sloped/curved roof planting needs project-specific retention, anti-slip/erosion, drainage and anchorage design. Preview is not suitability approval.');
    }
    missing.push('Roof exposure, waterproofing and loading are unverified.');
  } else if (type === 'facade') {
    if (!/^IFCWALL/.test(category)) reject('A facade system requires a wall component, not windows, doors or a floor.');
    if (/internal|interior|innenwand|partition|内墙|內牆/i.test(identity)) reject('The component identity indicates an internal/partition wall.');
    if (attributes.IsExternal === false || attributes.IsExternal === '.F.') reject('The supplied IFC attribute marks this wall as internal.');
    if (!blocked) reasons.push('Outward, near-vertical display faces are present. This does not prove they are exterior or unobstructed.');
    missing.push('Confirm an exterior face, window/door clearances, fixings, fire access and irrigation.');
  } else if (type === 'terrace') {
    if (!/^(IFCSLAB|IFCROOF)$/.test(category) || !/balcon|terrace|terrasse|露台|阳台|陽台/i.test(identity)) reject('No balcony/terrace identity was found. An ordinary floor or cropped floor edge cannot be treated as a terrace.');
    if (surface.triangles.some(triangle => degrees(triangle.normal) > SURFACE_SLOPE_LIMITS.terrace + 1e-6)) reject('A local face exceeds the 5° terrace concept limit.');
    if (!blocked) reasons.push('Named balcony/terrace with an approximately horizontal display surface. Outdoor exposure remains unverified.');
    missing.push('Confirm outdoor exposure, loading, usable boundaries and unobstructed escape routes.');
  } else if (type === 'ground') {
    if(selection?.globalId){
      const assessment=assessGroundUse(selection);
      const confirmed=attributes.UserReportedGroundUse==='plantable';
      if(top>buildingBox.min.y+Math.max(2,(buildingBox.max.y-buildingBox.min.y)*.2))reject('This surface is above the ground-level envelope; inspect it as a roof or terrace instead.');
      if(assessment.classification==='protected'||assessment.classification==='not-ground')reject('This IFC object is a circulation/protected area or is not an identified ground surface.');
      else if(assessment.classification==='review'&&!confirmed)reject('Ground use is unspecified. Ask whether it is an available planting area or a route that must remain clear.');
      if(points.some(point=>point[0]>buildingBox.min.x+1e-6&&point[0]<buildingBox.max.x-1e-6&&point[2]>buildingBox.min.z+1e-6&&point[2]<buildingBox.max.z-1e-6))reject('Ground display surface still overlaps the building footprint.');
      if(!blocked)reasons.push('IFC-ground display surface outside the building envelope; intended planting use is IFC-labelled or user-reported, not engineering approval.');
    }else{
      const xs = points.map(point=>point[0]),zs=points.map(point=>point[2]);
      if(Math.min(...xs)<buildingBox.max.x&&Math.max(...xs)>buildingBox.min.x&&Math.min(...zs)<buildingBox.max.z&&Math.max(...zs)>buildingBox.min.z)reject('The proposed rectangle overlaps the building footprint. Move it outside the footprint.');
      if(!blocked)reasons.push('User-defined rectangle outside the building bounding footprint; not an IFC land boundary.');
    }
    missing.push('Confirm available land, ground level, utilities, drainage and clear access.');
  } else reject('Unsupported region type.');
  return { roofAssessment:type==='roof'?(surface.roofAssessment ?? assessRoofForm(surface)):null, slopeScreening: surface.slopeScreening ?? null, status: blocked ? 'blocked' : 'conditional', canPrepare: !blocked, reasons, missing, source: 'Geometry and IFC identity screening rules; thresholds are presentation assumptions, not code compliance.' };
}

/** IFC labels indicate intended use, not permission or engineering approval. */
export function assessGroundUse(selection) {
  const properties=selection?.properties ?? [];
  const identity=[selection?.name ?? '',...properties.filter(p=>/(PredefinedType|ObjectType|Use|Usage|Purpose|Classification|Material.*Name|用途|分类)/i.test(p.name)).map(p=>String(p.value))].join(' ');
  const protectedUse=/road|driveway|car.?park|parking|fire.?lane|fire.?access|escape|access.?route|walkway|pavement|paving|入口|道路|车道|車道|通道|停车|停車|消防|铺装|鋪裝/i.test(identity);
  const plantingUse=/planting.?bed|planting.?area|landscap(?:ed|ing)|garden.?bed|lawn|grass|vegetation|花坛|花壇|种植区|種植區|绿地|綠地|草地|植被/i.test(identity);
  const groundLike=/^(IFCSITE|IFCGEOGRAPHICELEMENT|IFCSLAB|IFCBUILDINGELEMENTPROXY|IFCCOVERING)$/.test(selection?.category ?? '') && (/^(IFCSITE|IFCGEOGRAPHICELEMENT)$/.test(selection?.category ?? '')||/ground|terrain|courtyard|garten|gelaende|gelände|landscap|garden|地面|庭院|场地|場地|planting|lawn|grass/i.test(identity));
  return { classification: protectedUse?'protected':groundLike&&plantingUse?'planting':groundLike?'review':'not-ground', evidence:identity.slice(0,800), source:'IFC identity, use labels and material names; not independent site verification' };
}
