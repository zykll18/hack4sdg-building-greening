// Concept thresholds only; specialist system design may support different slopes.
export const SURFACE_SLOPE_LIMITS = Object.freeze({ roof: 20, terrace: 5 });
const degrees = normal => Math.acos(Math.min(1, Math.max(-1, normal[1]))) * 180 / Math.PI;

/** Partition source display faces locally; the excluded area never enters usable coverage. */
export function screenSurfaceBySlope(surface, type) {
  const limit = SURFACE_SLOPE_LIMITS[type];
  if (limit === undefined) return surface;
  const triangles = surface.triangles.filter(triangle => degrees(triangle.normal) <= limit + 1e-6);
  const candidateAreaM2 = triangles.reduce((sum, triangle) => sum + triangle.area, 0);
  const slopes = surface.triangles.map(triangle => degrees(triangle.normal));
  return { triangles, surfaceAreaM2: candidateAreaM2, slopeScreening: {
    originalAreaM2: surface.surfaceAreaM2, candidateAreaM2,
    excludedAreaM2: Math.max(0, surface.surfaceAreaM2 - candidateAreaM2),
    minSourceSlopeDegrees: slopes.length ? slopes.reduce((minimum, value) => Math.min(minimum, value), Infinity) : null,
    maxSourceSlopeDegrees: slopes.length ? slopes.reduce((maximum, value) => Math.max(maximum, value), -Infinity) : null,
    limitDegrees: limit, source: 'Local display-face slope; concept threshold, not an engineering standard'
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
    if (!partition.triangles.length) reject('No roof faces meet the local 20° concept limit. A specialist system is required.');
    else if (partition.slopeScreening.excludedAreaM2 > 1e-6) reject('Remove locally steep faces before confirming this roof; an average slope is insufficient.');
    if (!blocked) {
      const stats = surface.slopeScreening ?? partition.slopeScreening;
      reasons.push(`Locally screened roof: ${stats.candidateAreaM2.toFixed(2)} m² of ${stats.originalAreaM2.toFixed(2)} m² passes the ${stats.limitDegrees}° concept limit; ${stats.excludedAreaM2.toFixed(2)} m² excluded. Selected surface: ${surface.surfaceAreaM2.toFixed(2)} m².`);
      missing.push('Excluded steep areas need specialist review; roof openings/edges and above-roof obstacles still require checks.');
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
    const xs = points.map((point) => point[0]), zs = points.map((point) => point[2]);
    if (Math.min(...xs) < buildingBox.max.x && Math.max(...xs) > buildingBox.min.x && Math.min(...zs) < buildingBox.max.z && Math.max(...zs) > buildingBox.min.z) reject('The proposed rectangle overlaps the building footprint. Move it outside the footprint.');
    if (!blocked) reasons.push('User-defined rectangle outside the building bounding footprint; not an IFC land boundary.');
    missing.push('Confirm available land, ground level, utilities and clear access.');
  } else reject('Unsupported region type.');
  return { slopeScreening: surface.slopeScreening ?? null, status: blocked ? 'blocked' : 'conditional', canPrepare: !blocked, reasons, missing, source: 'Geometry and IFC identity screening rules; thresholds are presentation assumptions, not code compliance.' };
}
