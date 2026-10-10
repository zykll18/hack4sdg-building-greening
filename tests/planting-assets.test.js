import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { preparePlantVariants, disposePlantVariants } from '../src/adapters/planting-assets.js';
import { createPlantingVisual, footprintFits } from '../src/adapters/planting-visuals.js';
import { groundSurface, coveredSurface } from '../src/adapters/greening-geometry.js';

function decodeGlb(data) {
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonLength = data.readUInt32LE(12), gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength;
  assert.equal(data.readUInt32LE(binStart + 4), 0x004e4942);
  return { gltf, binary: data.subarray(binStart + 8) };
}

test('both downloaded GLBs match provenance hashes and retain self-contained geometry and textures', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/plants/manifest.json', import.meta.url)));
  assert.equal(manifest.assets.length, 2);
  for (const asset of manifest.assets) {
    const data = await readFile(new URL(`../public/plants/${asset.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    assert.equal(data.length, asset.bytes);
    const { gltf, binary } = decodeGlb(data);
    assert.equal(gltf.buffers.length, 1);
    assert.ok(gltf.buffers.every(buffer => !buffer.uri));
    assert.equal(gltf.meshes.length, 4);
    assert.equal(gltf.meshes.reduce((sum, mesh) => sum + gltf.accessors[mesh.primitives[0].indices].count / 3, 0), asset.file === 'fern-02.glb' ? 6232 : 8287);
    for (const image of gltf.images) {
      assert.equal(image.mimeType, 'image/jpeg'); assert.ok(!image.uri);
      const view = gltf.bufferViews[image.bufferView];
      assert.ok(view.byteOffset + view.byteLength <= gltf.buffers[0].byteLength);
      assert.equal(binary.readUInt16BE(view.byteOffset), 0xffd8);
    }
  }
});

test('variant preparation removes preview offsets, preserves proportions/source and shares textures until cache disposal', () => {
  const scene = new THREE.Group(), texture = new THREE.Texture(), geometry = new THREE.BoxGeometry(2, 4, 1), material = new THREE.MeshStandardMaterial({ map: texture });
  const source = new THREE.Mesh(geometry, material); source.position.set(10, 3, -7); scene.add(source);
  const original = Array.from(geometry.attributes.position.array), variants = preparePlantVariants(scene), box = variants[0].geometry.boundingBox;
  assert.deepEqual(Array.from(geometry.attributes.position.array), original);
  assert.equal(box.min.y, 0); assert.equal(box.max.y, 1);
  assert.equal(box.min.x, -.25); assert.equal(box.max.x, .25);
  assert.equal(box.min.z, -.125); assert.equal(box.max.z, .125);
  assert.equal(variants[0].material.map, texture);
  let disposed = 0; texture.addEventListener('dispose', () => disposed++);
  disposePlantVariants(variants); assert.equal(disposed, 1);
  geometry.dispose(); material.dispose();
});

test('textured roof and courtyard shrubs reuse prototypes, remain within footprint and leave quantities unchanged', () => {
  const source = new THREE.Group(); source.add(new THREE.Mesh(new THREE.BoxGeometry(.4, 1, .3), new THREE.MeshStandardMaterial()));
  const variants = preparePlantVariants(source), surface = groundSurface({x:0,y:0,z:0,width:12,depth:8}), positions = coveredSurface(surface, .6), original = Array.from(positions);
  let released = false; variants[0].geometry.addEventListener('dispose', () => released = true);
  for (const type of ['roof', 'ground']) {
    const group = createPlantingVisual({positions,type,planId:'landscape',shrubVariants:variants,seed:'stable'});
    const imported = group.children.filter(mesh => mesh.userData.sharedPlantAsset);
    assert.ok(imported.length > 0); assert.ok(imported.reduce((sum, mesh) => sum + mesh.count, 0) <= 160);
    assert.ok(Math.abs(group.userData.coverageM2 - 57.6) < .002);
    assert.deepEqual(Array.from(positions), original);
    for (const mesh of imported) {
      assert.equal(mesh.geometry, variants[0].geometry); assert.equal(mesh.material, variants[0].material);
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), scale = new THREE.Vector3(); mesh.getMatrixAt(i, matrix); matrix.decompose(p, new THREE.Quaternion(), scale);
        assert.ok(matrix.elements.every(Number.isFinite)); assert.ok(scale.y >= .549 && scale.y <= .801);
        p.y -= .215; assert.ok(footprintFits(surface, p.toArray(), [0,1,0], variants[0].radius * scale.y));
      }
    }
    const textures = new Set();
    group.traverse(mesh => {
      if (mesh.isInstancedMesh) mesh.dispose();
      if (mesh.userData.sharedPlantAsset) return;
      mesh.geometry?.dispose();
      for (const mat of [].concat(mesh.material ?? [])) { if (mat.map) textures.add(mat.map); mat.dispose(); }
    });
    for (const tex of textures) tex.dispose();
    assert.equal(released, false);
  }
  disposePlantVariants(variants); assert.equal(released, true);
  source.children[0].geometry.dispose(); source.children[0].material.dispose();
});

async function sourceVariants(file) {
  const { gltf, binary } = decodeGlb(await readFile(new URL(`../public/plants/${file}`, import.meta.url)));
  const scene = new THREE.Group();
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const primitive = gltf.meshes[node.mesh].primitives[0], accessor = gltf.accessors[primitive.attributes.POSITION], view = gltf.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? 12, values = [];
    for (let i = 0; i < accessor.count; i++) for (let axis = 0; axis < 3; axis++) values.push(binary.readFloatLE(offset + i * stride + axis * 4));
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));
    const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
    if (node.translation) mesh.position.fromArray(node.translation);
    if (node.rotation) mesh.quaternion.fromArray(node.rotation);
    if (node.scale) mesh.scale.fromArray(node.scale);
    scene.add(mesh);
  }
  const variants = preparePlantVariants(scene);
  scene.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
  return variants;
}
function disposeDisplay(group) {
  const textures = new Set();
  group.traverse(mesh => {
    if (mesh.isInstancedMesh) mesh.dispose();
    if (mesh.userData.sharedPlantAsset) return;
    mesh.geometry?.dispose();
    for (const material of [].concat(mesh.material ?? [])) { if (material.map) textures.add(material.map); material.dispose(); }
  });
  textures.forEach(texture=>texture.dispose());
}
test('real mixed assets stay bounded on sloped roofs and planters, keep quantities and survive independent fallback', async () => {
  const shrubVariants = await sourceVariants('shrub-03.glb'), fernVariants = await sourceVariants('fern-02.glb');
  const flat = groundSurface({x:0,y:0,z:0,width:12,depth:8}), angle = .22;
  const rotation = new THREE.Matrix4().makeRotationX(angle), normal = new THREE.Vector3(0,1,0).applyMatrix4(rotation).toArray();
  const surface = {surfaceAreaM2:flat.surfaceAreaM2,triangles:flat.triangles.map(t=>({...t,normal,points:t.points.map(p=>new THREE.Vector3().fromArray(p).applyMatrix4(rotation).toArray())}))};
  const positions = new Float32Array(surface.triangles.flatMap(t=>t.points.flat()));
  const originals = Array.from(positions), prototypes = [...shrubVariants,...fernVariants];
  let released = 0; prototypes.forEach(v=>v.geometry.addEventListener('dispose',()=>released++));
  for (const options of [{shrubVariants,fernVariants},{fernVariants},{shrubVariants}]) {
    const group=createPlantingVisual({positions,type:'roof',planId:'landscape',seed:'slope',...options});
    assert.ok(Math.abs(group.userData.coverageM2-96)<.001); assert.deepEqual(Array.from(positions),originals);
    const imported=group.children.filter(mesh=>mesh.userData.sharedPlantAsset);
    assert.ok(imported.length>0); assert.ok(imported.reduce((sum,m)=>sum+m.count,0)<=160);
    for (const mesh of imported) {
      const variant=prototypes.find(v=>v.geometry===mesh.geometry);assert.ok(variant);
      for(let i=0;i<mesh.count;i++) {
        const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),scale=new THREE.Vector3();mesh.getMatrixAt(i,matrix);matrix.decompose(p,new THREE.Quaternion(),scale);
        assert.ok(matrix.elements.every(Number.isFinite));p.addScaledVector(new THREE.Vector3().fromArray(normal),-.215);
        assert.ok(footprintFits(surface,p.toArray(),normal,variant.radius*scale.y));
        assert.ok(Math.abs(new THREE.Vector3().fromArray(normal).dot(p))<.00001,'plant base stays on the sloped plane');
      }
    }
    disposeDisplay(group);assert.equal(released,0);
  }
  const terrace=createPlantingVisual({positions:coveredSurface(flat,1),type:'terrace',planId:'landscape',fernVariants});
  const planters=terrace.children.find(m=>m.name==='Terrace planter boxes'),ferns=terrace.children.filter(m=>m.userData.sharedPlantAsset);
  assert.equal(ferns.reduce((sum,m)=>sum+m.count,0),planters.count);
  for(const mesh of ferns)for(let i=0;i<mesh.count;i++) {
    const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),scale=new THREE.Vector3();mesh.getMatrixAt(i,matrix);matrix.decompose(p,new THREE.Quaternion(),scale);
    const variant=fernVariants.find(v=>v.geometry===mesh.geometry);assert.ok(variant.radius*scale.y<=.27001);assert.ok(Math.abs(p.y-(.035+.42))<.00001);
  }
  disposeDisplay(terrace);assert.equal(released,0);
  disposePlantVariants(prototypes);assert.equal(released,8);
});
