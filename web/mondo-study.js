import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createMondoGrassReferenceLeafModuleAndConceptClumpModel } from '../model-studies/mondo-grass/createMondoGrassModel.ts';
import { createSpeciesModel, disposeSpeciesModel } from '../src/adapters/species-models.js';

const container = document.getElementById('model-preview');
try {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#edf2ef'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .001, 10);
  scene.add(new THREE.HemisphereLight('#ffffff', '#7f9a85', 1.6));
  const key = new THREE.DirectionalLight('#fff9ee', 2.5); key.position.set(1, 2, 2); scene.add(key);
  const rim = new THREE.DirectionalLight('#dcebe6', .8); rim.position.set(-1, 1, -1); scene.add(rim);
  container.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  let model, centre, distance, shapeOnly = false;
  const mapFields = ['map', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'displacementMap'];
  function releaseModel() {
    const textures = new Set();
    model.traverse(node => {
      for (const material of [].concat(node.material ?? [])) {
        for (const field of mapFields) {
          const texture = material.userData.studyMaps?.[field] ?? material[field];
          if (texture) textures.add(texture);
        }
      }
    });
    textures.forEach(texture => texture.dispose());
    disposeSpeciesModel(model);
  }
  function showShapeOnly() {
    const materials = new Set();
    model.traverse(node => [].concat(node.material ?? []).forEach(material => materials.add(material)));
    for (const material of materials) {
      material.userData.studyMaps ??= Object.fromEntries(mapFields.map(field => [field, material[field]]));
      for (const field of mapFields) material[field] = shapeOnly ? null : material.userData.studyMaps[field];
      material.needsUpdate = true;
    }
    document.getElementById('shape-view').setAttribute('aria-pressed', String(shapeOnly));
    render();
  }
  const render = () => renderer.render(scene, camera);
  function changeModel(old = false) {
    if (model) { scene.remove(model); releaseModel(); }
    model = old ? createSpeciesModel('ophiopogon-japonicus') : createMondoGrassReferenceLeafModuleAndConceptClumpModel({ textureSize: 128, castShadow: false, receiveShadow: false });
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    if (![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw new Error('模型尺寸包含无效值');
    centre = box.getCenter(new THREE.Vector3()); distance = Math.max(size.x, size.y, size.z) * 2;
    let triangles = 0;
    model.traverse(node => {
      if (!node.isMesh) return;
      if (!Array.from(node.geometry.attributes.position.array).every(Number.isFinite)) throw new Error('叶片几何包含无效值');
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    });
    document.getElementById('stats').textContent = `${Math.trunc(triangles).toLocaleString()} 个三角形 · ${old ? '原概念模型' : 'img2threejs 第一阶段草稿'}`;
    controls.target.copy(centre); controls.minDistance = distance * .25; controls.maxDistance = distance * 3;
    setAngle(0);
    showShapeOnly();
    document.getElementById('old-model').hidden = old;
    document.getElementById('new-model').hidden = !old;
  }
  function setAngle(degrees) {
    const radians = degrees * Math.PI / 180;
    camera.position.copy(centre).add(new THREE.Vector3(Math.sin(radians), .2, Math.cos(radians)).normalize().multiplyScalar(distance));
    controls.target.copy(centre); controls.update(); render();
    for (const button of document.querySelectorAll('[data-angle]')) button.setAttribute('aria-pressed', String(Number(button.dataset.angle) === degrees));
  }
  controls.addEventListener('change', render);
  for (const button of document.querySelectorAll('[data-angle]')) button.addEventListener('click', () => setAngle(Number(button.dataset.angle)));
  document.getElementById('reference-view').addEventListener('click', () => {
    camera.position.copy(centre).add(new THREE.Vector3(.3, .95, .2).normalize().multiplyScalar(distance * .38)); controls.target.copy(centre); controls.update(); render();
    for (const button of document.querySelectorAll('[data-angle]')) button.setAttribute('aria-pressed', 'false');
  });
  document.getElementById('old-model').addEventListener('click', () => changeModel(true));
  document.getElementById('new-model').addEventListener('click', () => changeModel());
  document.getElementById('shape-view').addEventListener('click', () => { shapeOnly = !shapeOnly; showShapeOnly(); });
  function resize() { const { clientWidth: width, clientHeight: height } = container; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); }
  const observer = new ResizeObserver(resize); observer.observe(container);
  changeModel(); resize();
  if (import.meta.hot) import.meta.hot.dispose(() => { observer.disconnect(); controls.dispose(); releaseModel(); renderer.dispose(); renderer.forceContextLoss(); container.replaceChildren(); });
} catch (error) {
  document.getElementById('error').textContent = `模型预览失败：${error.message}`;
}
