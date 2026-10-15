import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSpeciesModel, disposeSpeciesModel } from '../src/adapters/species-models.js';

export function showPlantModelPreview(container, plantId) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor('#edf2ef');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .01, 20);
  const model = createSpeciesModel(plantId); scene.add(model);
  scene.add(new THREE.HemisphereLight('#ffffff','#8da78b',2));
  const light = new THREE.DirectionalLight('#fff9eb',3);light.position.set(2,3,2);scene.add(light);
  const box = new THREE.Box3().setFromObject(model), centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.x,size.y,size.z,.15)*1.9;
  camera.position.copy(centre).add(new THREE.Vector3(.6,.25,1).normalize().multiplyScalar(distance));
  const controls = new OrbitControls(camera,renderer.domElement);controls.target.copy(centre);controls.enablePan=false;controls.minDistance=distance*.5;controls.maxDistance=distance*3;controls.update();
  const render = () => renderer.render(scene,camera);
  container.replaceChildren(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive concept plant model');
  function resize(){const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();}
  controls.addEventListener('change',render);
  const observer=new ResizeObserver(resize);observer.observe(container);resize();
  return () => { observer.disconnect();controls.dispose();disposeSpeciesModel(model);renderer.dispose();renderer.forceContextLoss();container.replaceChildren(); };
}
