import * as THREE from 'three';
import { screenSurfaceBySlope } from '../domain/region-screening.js';

/** Geometry estimate only: region use and structural suitability require user confirmation. */
export function extractGreeningSurface(meshes, modelMatrix, type, buildingCenter) {
  const triangles = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
  const center = new THREE.Vector3(), outward = new THREE.Vector3();
  for (const mesh of meshes) {
    if (!mesh.positions || !mesh.indices || !mesh.transform) continue;
    const matrix = new THREE.Matrix4().multiplyMatrices(modelMatrix, mesh.transform);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      a.fromArray(mesh.positions, mesh.indices[i] * 3).applyMatrix4(matrix);
      b.fromArray(mesh.positions, mesh.indices[i + 1] * 3).applyMatrix4(matrix);
      c.fromArray(mesh.positions, mesh.indices[i + 2] * 3).applyMatrix4(matrix);
      ab.subVectors(b, a); ac.subVectors(c, a); normal.crossVectors(ab, ac);
      const area = normal.length() * .5;
      if (area < 1e-8) continue;
      normal.normalize(); center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (type === 'facade') {
        outward.subVectors(center, buildingCenter); outward.y = 0; outward.normalize();
        if (Math.abs(normal.y) > .25 || normal.dot(outward) < .25) continue;
      } else if (normal.y <= 1e-6) continue;
      triangles.push({ points: [a.toArray(), b.toArray(), c.toArray()], normal: normal.toArray(), area });
    }
  }
  if (!triangles.length) throw new Error('No suitable display face found. Select another component or choose a different region type.');
  const source = { triangles, surfaceAreaM2: triangles.reduce((sum, triangle) => sum + triangle.area, 0) };
  const screened = screenSurfaceBySlope(source, type);
  if (!screened.triangles.length) throw new Error(`No suitable ${type} faces meet the local slope concept limit. Specialist review required.`);
  return screened;
}

export function groundSurface({ x, y, z, width, depth }) {
  if (![x, y, z, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) throw new RangeError('Ground dimensions must be positive and finite');
  const a = [x - width / 2, y, z - depth / 2], b = [x - width / 2, y, z + depth / 2];
  const c = [x + width / 2, y, z + depth / 2], d = [x + width / 2, y, z - depth / 2];
  return { surfaceAreaM2: width * depth, triangles: [[a,b,c],[a,c,d]].map((points) => ({ points, normal: [0,1,0], area: width * depth / 2 })) };
}

/** Cuts an edge strip from existing triangles; does not invent a balcony boundary. */
export function cropGreeningSurface(surface, { side = 'full', depth = 2 } = {}) {
  if (side === 'full') return surface;
  if (!['front','back','left','right'].includes(side) || !Number.isFinite(depth) || depth <= 0) throw new RangeError('Choose a valid edge and positive strip depth');
  const axis = ['left','right'].includes(side) ? 0 : 2;
  const values = surface.triangles.flatMap((triangle) => triangle.points.map((point) => point[axis]));
  const minimum = values.reduce((a,b) => Math.min(a,b), Infinity), maximum = values.reduce((a,b) => Math.max(a,b), -Infinity);
  const high = ['front','right'].includes(side);
  const cutoff = high ? maximum - depth : minimum + depth;
  const inside = (point) => high ? point[axis] >= cutoff - 1e-8 : point[axis] <= cutoff + 1e-8;
  const triangles = [];
  for (const triangle of surface.triangles) {
    const polygon = [];
    for (let i=0;i<3;i++) {
      const a=triangle.points[i], b=triangle.points[(i+1)%3], aInside=inside(a), bInside=inside(b);
      if (aInside) polygon.push(a);
      if (aInside !== bInside) {
        const t=(cutoff-a[axis])/(b[axis]-a[axis]);
        polygon.push(a.map((value,k) => value+(b[k]-value)*t));
      }
    }
    for (let i=1;i+1<polygon.length;i++) {
      const points=[polygon[0],polygon[i],polygon[i+1]];
      const a=new THREE.Vector3().fromArray(points[0]), b=new THREE.Vector3().fromArray(points[1]), c=new THREE.Vector3().fromArray(points[2]);
      const area=b.sub(a).cross(c.sub(a)).length()/2;
      if (area>1e-8) triangles.push({points,normal:triangle.normal,area});
    }
  }
  if (!triangles.length) throw new Error('This crop contains no display surface');
  return {...surface,triangles,surfaceAreaM2:triangles.reduce((sum,triangle)=>sum+triangle.area,0)};
}

/** A shared clipping plane creates one continuous planted strip, preserving openings. */
export function coveredSurface(surface, fraction) {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('Visual coverage must be between zero and one');
  if (fraction === 0) return new Float32Array();
  let covered = surface;
  if (fraction < 1) {
    const points = surface.triangles.flatMap(triangle => triangle.points);
    const extent = axis => points.reduce((max, p) => Math.max(max, p[axis]), -Infinity) - points.reduce((min, p) => Math.min(min, p[axis]), Infinity);
    const axis = extent(0) >= extent(2) ? 0 : 2;
    const side = axis === 0 ? 'left' : 'back';
    let low = 0, high = extent(axis);
    if (high < 1e-8) throw new Error('Surface has no horizontal planting extent');
    for (let i = 0; i < 35; i++) {
      const depth = (low + high) / 2;
      covered = cropGreeningSurface(surface, { side, depth });
      if (covered.surfaceAreaM2 < surface.surfaceAreaM2 * fraction) low = depth;
      else high = depth;
    }
  }
  return new Float32Array(covered.triangles.flatMap(({ points }) => points.flat()));
}


/** Shared vertices receive one area-weighted normal offset, avoiding cracks along curved seams. */
export function offsetSurfacePositions(positions, distance) {
  if (!Number.isFinite(distance) || distance < 0 || positions.length % 9 !== 0) throw new RangeError('A valid surface and non-negative offset are required');
  const normals = new Map(), key = point => point.map(value => Math.round(value * 1e5)).join(',');
  for (let i = 0; i < positions.length; i += 9) {
    const a = new THREE.Vector3().fromArray(positions, i), b = new THREE.Vector3().fromArray(positions, i + 3), c = new THREE.Vector3().fromArray(positions, i + 6);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    for (const point of [a,b,c]) {
      const id = key(point.toArray());
      if (!normals.has(id)) normals.set(id, new THREE.Vector3());
      normals.get(id).add(normal);
    }
  }
  const result = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const point = new THREE.Vector3().fromArray(positions, i);
    point.addScaledVector(normals.get(key(point.toArray())).clone().normalize(), distance).toArray(result, i);
  }
  return result;
}
