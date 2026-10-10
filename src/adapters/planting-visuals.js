import * as THREE from 'three';
import { offsetSurfacePositions } from './greening-geometry.js';

const UP = new THREE.Vector3(0, 1, 0);
function random(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
function frame(normal) {
  const n = new THREE.Vector3().fromArray(normal).normalize();
  const u = new THREE.Vector3().crossVectors(Math.abs(n.y) < .9 ? UP : new THREE.Vector3(0, 0, 1), n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { n, u, v };
}
function triangleContains(point, triangle, normal, tolerance = .06) {
  const n = new THREE.Vector3().fromArray(triangle.normal);
  if (n.dot(normal) < .92) return false;
  const a = new THREE.Vector3().fromArray(triangle.points[0]);
  if (Math.abs(point.clone().sub(a).dot(n)) > tolerance) return false;
  const projected = point.clone().addScaledVector(n, -point.clone().sub(a).dot(n));
  return new THREE.Triangle(a, new THREE.Vector3().fromArray(triangle.points[1]), new THREE.Vector3().fromArray(triangle.points[2])).containsPoint(projected);
}
/** Sample decorative footprint clearance against the clipped source, including holes. */
export function footprintFits(surface, position, normal, radius) {
  const point = new THREE.Vector3().fromArray(position), basis = frame(normal);
  if (!surface.triangles.some(triangle => triangleContains(point, triangle, basis.n))) return false;
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const edge = point.clone().addScaledVector(basis.u, Math.cos(angle) * radius).addScaledVector(basis.v, Math.sin(angle) * radius);
    if (!surface.triangles.some(triangle => triangleContains(edge, triangle, basis.n))) return false;
  }
  return true;
}
/** Area-weighted, seeded sampling: density is independent of mesh triangulation. */
export function samplePlantingSites(surface, { spacing, radius, max = 220, seed = 'planting' }) {
  if (!Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(radius) || radius < 0 || !Number.isInteger(max) || max < 0) throw new RangeError('Valid planting spacing, footprint and instance limit are required');
  const target = Math.min(max, Math.floor(surface.surfaceAreaM2 / (spacing * spacing)));
  if (!target) return [];
  const rng = random(seed), cumulative = [], sites = [], cells = new Map();
  let area = 0;
  for (const triangle of surface.triangles) { area += triangle.area; cumulative.push(area); }
  const cellKey = p => [p.x, p.y, p.z].map(value => Math.floor(value / spacing));
  for (let attempt = 0; attempt < target * 22 && sites.length < target; attempt++) {
    const desired = rng() * area;
    let low = 0, high = cumulative.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (cumulative[mid] < desired) low = mid + 1; else high = mid; }
    const triangle = surface.triangles[low];
    if (!triangle) break;
    const root = Math.sqrt(rng()), second = rng(), weights = [1 - root, root * (1 - second), root * second];
    const p = new THREE.Vector3();
    triangle.points.forEach((point, i) => p.addScaledVector(new THREE.Vector3().fromArray(point), weights[i]));
    const cell = cellKey(p);
    let crowded = false;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const neighbors = cells.get([cell[0] + x, cell[1] + y, cell[2] + z].join(',')) ?? [];
      if (neighbors.some(other => p.distanceToSquared(other) < spacing * spacing * .64)) crowded = true;
    }
    if (crowded || !footprintFits(surface, p.toArray(), triangle.normal, radius)) continue;
    const site = { position: p.toArray(), normal: triangle.normal.slice() };
    sites.push(site);
    const key = cell.join(','); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(p);
  }
  return sites;
}
function leafGeometry() {
  const g = new THREE.BufferGeometry();
  // A folded, pointed leaf has depth and responds to light without an image billboard.
  g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, -.24,.42,0, 0,.48,.07, 0,0,0, 0,.48,.07, .24,.42,0, -.24,.42,0, 0,1,0, 0,.48,.07, 0,.48,.07, 0,1,0, .24,.42,0], 3));
  g.computeVertexNormals(); return g;
}
function surfaceTriangles(positions) {
  const triangles = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i); b.fromArray(positions, i + 3); c.fromArray(positions, i + 6);
    const cross = b.clone().sub(a).cross(c.clone().sub(a)), area = cross.length() * .5;
    if (area > 1e-8) triangles.push({ points: [a.toArray(), b.toArray(), c.toArray()], normal: cross.normalize().toArray(), area });
  }
  return { triangles, surfaceAreaM2: triangles.reduce((sum, triangle) => sum + triangle.area, 0) };
}
function groundTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4), rng = random('vegetation-albedo');
  for (let i = 0; i < size * size; i++) {
    const patch = Math.sin((i % size) * .13) * Math.sin(Math.floor(i / size) * .17);
    const variation = rng() * .25 + patch * .08;
    pixels[i * 4] = 108 + variation * 55; pixels[i * 4 + 1] = 143 + variation * 50; pixels[i * 4 + 2] = 72 + variation * 40; pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
function instanced(group, geometry, material, entries, name) {
  if (!entries.length) { geometry.dispose(); material.dispose(); return; }
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  mesh.name = name; const transform = new THREE.Object3D(), color = new THREE.Color();
  entries.forEach((entry, i) => {
    transform.position.copy(entry.position); transform.quaternion.copy(entry.quaternion ?? new THREE.Quaternion()); transform.scale.copy(entry.scale); transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix); if (entry.color) mesh.setColorAt(i, color.set(entry.color));
  });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere(); mesh.computeBoundingBox(); group.add(mesh);
}
function layer(group, positions, surface, type, dense, coverageM2) {
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  const uvs = [];
  for (const triangle of surface.triangles) {
    const basis = frame(triangle.normal);
    for (const point of triangle.points) { const p = new THREE.Vector3().fromArray(point); uvs.push(p.dot(basis.u) * .65, p.dot(basis.v) * .65); }
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const openSupport = type === 'facade' && !dense || type === 'terrace';
  const material = new THREE.MeshStandardMaterial({ color: openSupport ? '#6f8275' : '#ffffff', map: openSupport ? null : groundTexture(), roughness: .98, side: THREE.DoubleSide, transparent: openSupport, opacity: openSupport ? .12 : 1, depthWrite: !openSupport });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Calculated planting footprint'; mesh.userData.coverageM2 = coverageM2; group.add(mesh);
  if (openSupport) return;
  // Only the perimeter receives a bed edge; internal triangle diagonals stay invisible.
  const edges = new Map(), sides = [], depth = type === 'facade' ? .075 : dense ? .18 : .075;
  const key = p => p.map(value => Math.round(value * 10000)).join(',');
  for (const triangle of surface.triangles) for (let i = 0; i < 3; i++) {
    const a = triangle.points[i], b = triangle.points[(i + 1) % 3], id = [key(a), key(b)].sort().join('|');
    if (edges.has(id)) edges.delete(id); else edges.set(id, { a, b, normal: triangle.normal });
  }
  for (const { a, b, normal } of edges.values()) {
    const bottom = p => p.map((value, axis) => value - normal[axis] * depth);
    sides.push(...a, ...bottom(a), ...b, ...b, ...bottom(a), ...bottom(b));
  }
  const sideGeometry = new THREE.BufferGeometry(); sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3)); sideGeometry.computeVertexNormals();
  const border = new THREE.Mesh(sideGeometry, new THREE.MeshStandardMaterial({ color: type === 'facade' ? '#344b41' : '#736251', roughness: 1, side: THREE.DoubleSide })); border.name = 'Planting bed edge'; group.add(border);
}
/** Decorative systems sit above the exact analytical footprint; they do not change quantities. */
export function createPlantingVisual({ positions, type, planId, seed = 'region', shrubVariants = [], fernVariants = [] }) {
  const group = new THREE.Group(); group.name = 'Concept planting system';
  const dense = planId === 'landscape';
  const analyticalSurface = surfaceTriangles(positions);
  group.userData.coverageM2 = analyticalSurface.surfaceAreaM2; group.userData.type = type;
  if (!analyticalSurface.triangles.length) return group;
  const offset = .035 + (type === 'roof' || type === 'ground' ? dense ? .18 : .075 : 0);
  positions = offsetSurfacePositions(positions, offset);
  const surface = surfaceTriangles(positions);
  group.userData.surfaceOffsetM = offset;
  layer(group, positions, surface, type, dense, analyticalSurface.surfaceAreaM2);
  const leaves = [], stems = [], crowns = [], boxes = [], rails = [], blooms = [], rng = random(seed + ':foliage');
  const assetBatches = [
    { name: 'Textured shrub', variants: shrubVariants, entries: shrubVariants.map(() => []) },
    { name: 'Textured fern', variants: fernVariants, entries: fernVariants.map(() => []) }
  ];
  const addAsset = (assetIndex, position, height) => {
    const batch = assetBatches[assetIndex], index = Math.floor(rng() * batch.variants.length);
    batch.entries[index].push({ position, quaternion: new THREE.Quaternion().setFromAxisAngle(UP, rng() * Math.PI * 2), scale: new THREE.Vector3(height, height, height) });
  };
  const leafPalette = dense ? ['#214f37','#326b42','#4a824c','#689651'] : ['#386c43','#54854b','#749951','#91aa61'];
  const addLeaf = (position, direction, length, variation = 1) => {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, rng() * Math.PI * 2));
    leaves.push({ position, quaternion: q, scale: new THREE.Vector3(length * variation, length, length), color: leafPalette[Math.floor(rng() * leafPalette.length)] });
  };
  const addBush = (site, radius, height, lift = 0, wall = false) => {
    const base = new THREE.Vector3().fromArray(site.position), basis = frame(site.normal);
    const growth = wall ? basis.n : UP;
    const center = base.clone().addScaledVector(growth, lift + height * .43);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, growth);
    // Irregular lobes establish volume; individually folded leaves add close-up detail.
    for (let l = 0; l < 3; l++) {
      const angle = l * Math.PI * 2 / 3 + rng(), lateral = radius * .27;
      const position = center.clone().addScaledVector(basis.u, Math.cos(angle) * lateral).addScaledVector(wall ? basis.v : new THREE.Vector3(0,0,1), Math.sin(angle) * lateral);
      crowns.push({ position, quaternion: q, scale: new THREE.Vector3(radius * .72, height * .37, radius * .72), color: leafPalette[Math.floor(rng() * leafPalette.length)] });
    }
    for (let j = 0; j < (wall ? 24 : 38); j++) {
      const angle = rng() * Math.PI * 2, y = rng() * 2 - 1, ring = Math.sqrt(1 - y * y);
      const offset = wall ? basis.u.clone().multiplyScalar(Math.cos(angle) * ring * radius * .5).addScaledVector(basis.v, Math.sin(angle) * ring * radius * .5).addScaledVector(basis.n, y * height * .3) : new THREE.Vector3(Math.cos(angle) * ring * radius * .5, y * height * .4, Math.sin(angle) * ring * radius * .5);
      addLeaf(center.clone().add(offset), offset.clone().addScaledVector(growth, height * .3), wall ? radius * .43 : Math.min(radius * .4, .16 + rng() * .06));
    }
  };
  if (type === 'facade') {
    const sites = samplePlantingSites(surface, { spacing: dense ? .48 : .65, radius: dense ? .22 : .19, max: 260, seed: seed + ':facade' });
    for (const site of sites) {
      const p = new THREE.Vector3().fromArray(site.position), basis = frame(site.normal);
      addBush(site, dense ? .22 : .18, dense ? .27 : .12, .035, true);
      if (!dense) {
        const q = new THREE.Quaternion().setFromUnitVectors(UP, basis.v);
        rails.push({ position: p.clone().addScaledVector(basis.n, .026), quaternion: q, scale: new THREE.Vector3(.013,.33,.013) });
      }
    }
  } else if (type === 'terrace') {
    const sites = samplePlantingSites(surface, { spacing: 1.45, radius: .57, max: 32, seed: seed + ':planters' });
    for (const site of sites) {
      const base = new THREE.Vector3().fromArray(site.position), height = dense ? .42 : .30;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3().fromArray(site.normal));
      boxes.push({ position: base.clone().addScaledVector(UP, height / 2), quaternion: q, scale: new THREE.Vector3(.85,height,.60) });
      if (fernVariants.length) {
        const plantHeight = Math.min(dense ? .26 : .20, .27 / Math.max(...fernVariants.map(variant => variant.radius)));
        addAsset(1, base.clone().addScaledVector(UP, height), plantHeight);
      } else addBush(site, .35, dense ? .9 : .48, height);
    }
  } else {
    const textured = (dense || type === 'ground') && (shrubVariants.length > 0 || fernVariants.length > 0);
    const fernHeight = dense ? .32 : .23, shrubHeight = .80;
    const radius = textured ? Math.max(.32, ...fernVariants.map(variant => variant.radius * fernHeight), ...(dense ? shrubVariants.map(variant => .10 + variant.radius * shrubHeight) : [])) : dense ? .32 : .19;
    const sites = samplePlantingSites(surface, { spacing: textured ? Math.max(1.05, radius * 1.8) : dense ? .9 : .42, radius, max: textured ? 80 : dense ? 140 : 240, seed: seed + ':beds' });
    sites.forEach((site, siteIndex) => {
      const base = new THREE.Vector3().fromArray(site.position), basis = frame(site.normal);
      if (textured) {
        if (fernVariants.length) addAsset(1, base.clone(), fernHeight * (.82 + rng() * .18));
        if (dense && shrubVariants.length && (siteIndex % 2 === 0 || !fernVariants.length)) {
          for (let clump = 0; clump < 2; clump++) {
            const angle = clump * Math.PI + rng() * .5;
            // Anchor lateral offsets on the actual plane, including sloped roofs.
            const position = base.clone().addScaledVector(basis.u, Math.cos(angle) * .10).addScaledVector(basis.v, Math.sin(angle) * .10);
            addAsset(0, position, .55 + rng() * .25);
          }
        } else if (!fernVariants.length && !dense) addBush(site, radius, .23);
      } else if (dense) addBush(site, radius, .55 + rng() * .3);
      else {
        for (let j = 0; j < 9; j++) {
          const angle = rng() * Math.PI * 2;
          const p = base.clone().addScaledVector(basis.u, Math.cos(angle) * .05).addScaledVector(basis.v, Math.sin(angle) * .05);
          addLeaf(p, new THREE.Vector3(Math.cos(angle) * .45, 1, Math.sin(angle) * .45), .16 + rng() * .11, .45);
        }
      }
      if (type === 'roof' && !dense && rng() < .25) blooms.push({ position: base.clone().addScaledVector(UP,.23), scale: new THREE.Vector3(.025,.025,.025), color: rng() > .6 ? '#e7dba2' : '#c99e91' });
    });
    if (type === 'ground' && dense) {
      const trees = samplePlantingSites(surface, { spacing: 3.8, radius: 1.05, max: 12, seed: seed + ':trees' });
      for (const site of trees) {
        const p = new THREE.Vector3().fromArray(site.position), height = 2.3 + rng() * .6;
        stems.push({ position: p.clone().addScaledVector(UP,height / 2), scale: new THREE.Vector3(.10,height,.10) });
        for (let l = 0; l < 4; l++) crowns.push({ position: p.clone().add(new THREE.Vector3((rng()-.5)*.44,height-.35 + rng()*.4,(rng()-.5)*.44)), scale: new THREE.Vector3(.8,.7,.8), color: leafPalette[l] });
      }
    }
  }
  for (const batch of assetBatches) batch.entries.forEach((entries, index) => {
    if (!entries.length) return;
    const { geometry, material } = batch.variants[index];
    const mesh = new THREE.InstancedMesh(geometry, material, entries.length), transform = new THREE.Object3D();
    mesh.name = `${batch.name} variant ${index + 1}`;
    mesh.userData.sharedPlantAsset = true;
    entries.forEach((entry, i) => { transform.position.copy(entry.position); transform.quaternion.copy(entry.quaternion); transform.scale.copy(entry.scale); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox(); group.add(mesh);
  });
  instanced(group, leafGeometry(), new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.86, side:THREE.DoubleSide }), leaves, 'Folded foliage');
  instanced(group, new THREE.IcosahedronGeometry(1,2), new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.97 }), crowns, 'Shrub and tree foliage');
  instanced(group, new THREE.CylinderGeometry(.75,1,1,7), new THREE.MeshStandardMaterial({ color:'#72523c', roughness:1 }), stems, 'Tree trunks');
  instanced(group, new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ color: dense ? '#9c9385' : '#69736c', roughness:.92 }), boxes, 'Terrace planter boxes');
  instanced(group, new THREE.CylinderGeometry(1,1,1,4), new THREE.MeshStandardMaterial({ color:'#69786e', roughness:.8 }), rails, 'Climber support stems');
  instanced(group, new THREE.IcosahedronGeometry(1,1), new THREE.MeshStandardMaterial({ color:'#ffffff', roughness:.85 }), blooms, 'Sedum flower heads');
  group.traverse(object => { if (object.isMesh) object.userData.decorativePlanting = object.name !== 'Calculated planting footprint'; });
  return group;
}
