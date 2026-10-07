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

  try {
    world.scene = new OBC.SimpleScene(components);
    world.scene.setup();
    world.scene.three.background = new THREE.Color('#edf4ee');
    world.renderer = new OBC.SimpleRenderer(components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    await world.camera.controls.setLookAt(25, 20, 25, 0, 0, 0);
    components.init();

    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(workerUrl);
    world.camera.controls.addEventListener('update', () => fragments.core.update());
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

    return {
      async openIfc(file) {
        if (loading) throw new Error('An IFC import is already in progress');
        if (!file.name.toLowerCase().endsWith('.ifc')) throw new TypeError('Select an IFC file');
        loading = true;
        highlighter.enabled = false;
        selectionEpoch++;
        onSelection(null);
        let replacing = false;
        try {
          onStatus('Reading IFC…');
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!new TextDecoder().decode(bytes.slice(0, 256)).includes('ISO-10303-21')) throw new TypeError('This file does not contain a supported IFC STEP header');
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const version = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
          await highlighter.clear('select');
          replacing = true;
          if (currentModel) {
            world.scene.three.remove(currentModel.object);
            await fragments.core.disposeModel(currentModel.modelId);
          }
          currentModel = null;
          categoryById = new Map();
          onModel(null);
          onStatus('Converting IFC geometry…');
          const model = await loader.load(bytes, true, version, { processData: {
            progressCallback: (progress) => onStatus(`Converting IFC… ${Math.round(progress * 100)}%`)
          } });
          currentModel = model;
          modelVersion = version;
          const [categories, geometryIds] = await Promise.all([model.getItemsOfCategories([/.*/]), model.getItemsIdsWithGeometry()]);
          for (const [category, ids] of Object.entries(categories)) for (const id of ids) categoryById.set(id, category);
          if (!geometryIds.length) throw new Error('The IFC contains no supported display geometry');
          await world.camera.fitToItems();
          await fragments.core.update(true);
          const info = { modelVersion: version, fileName: file.name, componentCount: geometryIds.length };
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
            categoryById.clear();
            onModel(null);
          }
          throw error;
        } finally {
          loading = false;
          highlighter.enabled = true;
        }
      },
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
