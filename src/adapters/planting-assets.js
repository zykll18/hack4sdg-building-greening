import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Separate the four source variants, removing their preview arrangement and preserving proportions. */
export function preparePlantVariants(scene) {
  scene.updateMatrixWorld(true);
  const variants = [];
  scene.traverse(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox, size = box.getSize(new THREE.Vector3());
    if (size.y <= 0) { geometry.dispose(); return; }
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    geometry.scale(1 / size.y, 1 / size.y, 1 / size.y);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    variants.push({ geometry, material: mesh.material.clone(), radius: Math.hypot(size.x, size.z) / (2 * size.y) });
  });
  if (!variants.length) throw new Error('The plant asset has no usable plant geometry');
  return variants;
}

export function disposePlantVariants(variants) {
  const textures = new Set();
  for (const { geometry, material } of variants) {
    geometry.dispose();
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) { texture.dispose(); texture.source.data?.close?.(); }
}

export async function loadPlantVariants(url, signal) {
  // Fetch one local GLB with a bounded wait; no external network is required by the app.
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)].filter(Boolean)) });
  if (!response.ok) throw new Error(`Plant asset unavailable (${response.status})`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  let prepared = false;
  try { const variants = preparePlantVariants(gltf.scene); prepared = true; return variants; }
  finally {
    const geometries = new Set(), materials = new Set();
    gltf.scene.traverse(mesh => { if (mesh.geometry) geometries.add(mesh.geometry); for (const material of [].concat(mesh.material ?? [])) materials.add(material); });
    for (const geometry of geometries) geometry.dispose();
    // Cloned variant materials retain the loaded textures until viewer disposal.
    for (const material of materials) material.dispose();
    if (!prepared) {
      const textures = new Set();
      for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const texture of textures) { texture.dispose(); texture.source.data?.close?.(); }
    }
  }
}
