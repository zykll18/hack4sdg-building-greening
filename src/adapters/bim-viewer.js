import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import workerUrl from '@thatopen/fragments/worker?url';
import { normalizeSelection } from './selection-data.js';

/** Phase 1 port: real import and selection. Roof quantities and overlays come later. */
export async function createBimViewer(container, { onSelection, onStatus, onModel }) {
  const components = new OBC.Components();
  const world = components.get(OBC.Worlds).create();
  let currentModel = null;
  let modelVersion = null;
  let categoryById = new Map();
  let selectionEpoch = 0;
  let loading = false;
  let displayIds = [];

  try {
    world.scene = new OBC.SimpleScene(components);
    world.scene.setup({
      backgroundColor: new THREE.Color('#f1f3f4'),
      ambientLight: { color: new THREE.Color('#ffffff'), intensity: 1.1 },
      directionalLight: { color: new THREE.Color('#ffffff'), intensity: 1.8, position: new THREE.Vector3(40, 60, 25) }
    });
    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    await world.camera.controls.setLookAt(25, 20, 25, 0, 0, 0);
    components.init();
    world.dynamicAnchor = false;
    const grid = components.get(OBC.Grids).create(world);
    grid.setup({ color: new THREE.Color('#b7c1c4'), primarySize: 10, secondarySize: 1, distance: 120 });
    const postproduction = world.renderer.postproduction;
    postproduction.enabled = true;
    postproduction.basePass.isolatedMaterials.push(grid.material);
    postproduction.style = OBF.PostproductionAspect.COLOR_PEN_SHADOWS;
    postproduction.edgesPass.color.set('#526368');
    postproduction.edgesPass.width = 1;
    postproduction.smaaEnabled = true;

    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(workerUrl);
    world.camera.controls.addEventListener('update', () => fragments.core.update());
    world.onCameraChanged.add((camera) => {
      for (const [, model] of fragments.list) model.useCamera(camera.three);
      postproduction.updateCamera();
      fragments.core.update(true);
    });
    fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
      if (!material.isLodMaterial) {
        material.polygonOffset = true;
        material.polygonOffsetUnits = 1;
        material.polygonOffsetFactor = 1;
      }
    });
    fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three);
      world.scene.three.add(model.object);
      fragments.core.update(true);
    });

    const loader = components.get(OBC.IfcLoader);
    await loader.setup({ autoSetWasm: false, wasm: { path: '/wasm/', absolute: true } });
    components.get(OBC.Raycasters).get(world);
    const highlighter = components.get(OBF.Highlighter);
    highlighter.setup({ world, selectMaterialDefinition: {
      color: new THREE.Color('#efb653'), opacity: 1, transparent: false, renderedFaces: 0
    } });
    highlighter.multiple = 'none';

    highlighter.events.select.onHighlight.add(async (modelIdMap) => {
      const epoch = ++selectionEpoch;
      const model = currentModel;
      const version = modelVersion;
      if (!model || loading) return;
      const ids = modelIdMap[model.modelId];
      const localId = ids?.values().next().value;
      if (localId === undefined) return;
      try {
        const [data, guids] = await Promise.all([model.getItemsData([localId]), model.getGuidsByLocalIds([localId])]);
        if (epoch !== selectionEpoch || model !== currentModel) return;
        onSelection(normalizeSelection({ modelVersion: version, localId, globalId: guids[0], category: categoryById.get(localId), data: data[0] }));
      } catch (error) {
        if (epoch === selectionEpoch) onStatus(`Could not read component: ${error.message}`);
      }
    });
    highlighter.events.select.onClear.add(() => { selectionEpoch++; onSelection(null); });

    async function setView(direction) {
      if (!currentModel || loading) return;
      const sphere = await world.camera.getItemsBounding({ [currentModel.modelId]: new Set(displayIds) });
      const center = sphere.center;
      const offset = direction === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1, 0.7, 1);
      offset.normalize().multiplyScalar(Math.max(sphere.radius * 3, 1));
      await world.camera.controls.setLookAt(center.x + offset.x, center.y + offset.y, center.z + offset.z, center.x, center.y, center.z, true);
      await world.camera.fitToItems({ [currentModel.modelId]: new Set(displayIds) });
    }

    async function openFile(file, format) {
        if (loading) throw new Error('A model import is already in progress');
        if (!file.name.toLowerCase().endsWith(`.${format}`)) throw new TypeError(`Select a ${format.toUpperCase()} file`);
        loading = true;
        highlighter.enabled = false;
        selectionEpoch++;
        onSelection(null);
        let replacing = false;
        try {
          onStatus(`Reading ${format === 'ifc' ? 'IFC' : 'official Fragments sample'}…`);
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (format === 'ifc' && !new TextDecoder().decode(bytes.slice(0, 256)).includes('ISO-10303-21')) throw new TypeError('This file does not contain a supported IFC STEP header');
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const version = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
          await highlighter.clear('select');
          replacing = true;
          if (currentModel) {
            world.scene.three.remove(currentModel.object);
            await fragments.core.disposeModel(currentModel.modelId);
          }
          currentModel = null;
          displayIds = [];
          categoryById = new Map();
          onModel(null);
          onStatus(format === 'ifc' ? 'Converting IFC geometry…' : 'Opening the official school architecture model…');
          const model = format === 'ifc' ? await loader.load(bytes, true, version, { processData: {
            progressCallback: (progress) => onStatus(`Converting IFC… ${Math.round(progress * 100)}%`)
          } }) : await fragments.core.load(bytes, { modelId: version });
          currentModel = model;
          modelVersion = version;
          const [categories, geometryIds] = await Promise.all([model.getItemsOfCategories([/.*/]), model.getItemsIdsWithGeometry()]);
          for (const [category, ids] of Object.entries(categories)) for (const id of ids) categoryById.set(id, category);
          if (!geometryIds.length) throw new Error('The IFC contains no supported display geometry');
          displayIds = geometryIds;
          const visibleIds = new Set(geometryIds);
          const categoryCounts = Object.entries(categories).map(([name, ids]) => ({ name, count: ids.filter((id) => visibleIds.has(id)).length })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count);
          const box = await model.getMergedBox(geometryIds);
          grid.three.position.y = box.min.y - 0.05;
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          const center = sphere.center;
          const distance = Math.max(sphere.radius * 2.5, 1);
          await world.camera.projection.set('Perspective');
          await world.camera.controls.setLookAt(center.x + distance, center.y + distance * 0.7, center.z + distance, center.x, center.y, center.z);
          await world.camera.fitToItems({ [model.modelId]: new Set(geometryIds) });
          await fragments.core.update(true);
          const info = { modelVersion: version, fileName: file.name, sourceFormat: format, componentCount: geometryIds.length, categoryCounts };
          onModel(info);
          onStatus(`${file.name} · ${geometryIds.length.toLocaleString()} components. Click a component to inspect it.`);
          return info;
        } catch (error) {
          if (replacing && currentModel) {
            world.scene.three.remove(currentModel.object);
            await fragments.core.disposeModel(currentModel.modelId);
            currentModel = null;
          }
          if (replacing) {
            modelVersion = null;
            displayIds = [];
            categoryById.clear();
            onModel(null);
          }
          throw error;
        } finally {
          loading = false;
          highlighter.enabled = true;
        }
      }

    return {
      openIfc: (file) => openFile(file, 'ifc'),
      openFragments: (file) => openFile(file, 'frag'),
      setView,
      setRenderStyle(style) {
        if (style === 'basic') postproduction.enabled = false;
        else {
          postproduction.enabled = true;
          postproduction.style = style === 'technical' ? OBF.PostproductionAspect.PEN_SHADOWS : OBF.PostproductionAspect.COLOR_PEN_SHADOWS;
        }
      },
      setGrid(visible) { grid.visible = visible; },
      async fit() { if (currentModel && !loading) await world.camera.fitToItems(); },
      async clearSelection() { await highlighter.clear('select'); },
      async highlightRoof(globalId) {
        if (!currentModel || loading) return;
        const [id] = await currentModel.getLocalIdsByGuids([globalId]);
        if (id === null) throw new Error('That IFC GlobalId is not present in the loaded model');
        await highlighter.highlightByID('select', { [currentModel.modelId]: new Set([id]) });
      },
      async dispose() {
        selectionEpoch++;
        components.dispose();
      }
    };
  } catch (error) {
    components.dispose();
    throw error;
  }
}
