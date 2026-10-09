import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import workerUrl from '@thatopen/fragments/worker?url';
import { screenRegion } from '../domain/region-screening.js';
import { normalizeSelection } from './selection-data.js';
import { extractGreeningSurface, groundSurface, coveredSurface, cropGreeningSurface } from './greening-geometry.js';

/** IFC display, confirmed greening regions, scenario overlays and frontend handoff. */
export async function createBimViewer(container, { onSelection, onStatus, onModel, onRegions = () => {}, onZoom = () => {} }) {
  const components = new OBC.Components();
  const world = components.get(OBC.Worlds).create();
  let currentModel = null;
  let modelVersion = null;
  let categoryById = new Map();
  let selectionEpoch = 0;
  let loading = false;
  let displayIds = [];
  let buildingBox;
  let pendingRegion;
  let regionSequence = 0;
  let regionEpoch = 0;
  const regions = new Map();
  const overlays = new THREE.Group();
  let activePlan = null;
  let showAfter = false;

  try {
    world.scene = new OBC.SimpleScene(components);
    world.scene.setup({
      backgroundColor: new THREE.Color('#f1f3f4'),
      ambientLight: { color: new THREE.Color('#ffffff'), intensity: 1.1 },
      directionalLight: { color: new THREE.Color('#ffffff'), intensity: 1.8, position: new THREE.Vector3(40, 60, 25) }
    });
    world.scene.three.add(overlays);
    world.renderer = new OBF.PostproductionRenderer(components, container);
    world.renderer.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    const controls = world.camera.controls;
    let fittedMagnification = null;
    let lastZoomPercent = null;
    function magnification() {
      const camera = world.camera.three;
      return camera.isOrthographicCamera ? camera.zoom : camera.zoom / controls.distance;
    }
    function publishZoom() {
      const scale = magnification();
      const percent = fittedMagnification && Number.isFinite(scale) && scale > 0
        ? Math.max(1, Math.round(100 * scale / fittedMagnification)) : null;
      if (percent === lastZoomPercent) return;
      lastZoomPercent = percent;
      onZoom(percent);
    }
    function resetZoomReference() {
      fittedMagnification = magnification();
      publishZoom();
    }
    controls.azimuthRotateSpeed = 0.9;
    controls.polarRotateSpeed = 0.9;
    controls.truckSpeed = 1.8;
    controls.dollySpeed = 2.2;
    controls.smoothTime = 0.1;
    controls.draggingSmoothTime = 0.035;
    controls.dollyToCursor = true;
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

    let cameraMoving = false;
    let renderStyle = 'shaded';
    // Camera motion events cover wheel/pinch as well as pointer dragging.
    // Keep expensive passes off until damping finishes, then restore the chosen style.
    controls.addEventListener('wake', () => {
      cameraMoving = true;
      postproduction.enabled = false;
    });
    controls.addEventListener('sleep', () => {
      cameraMoving = false;
      postproduction.enabled = renderStyle !== 'basic';
    });

    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(workerUrl);
    const updateCamera = () => { fragments.core.update(); publishZoom(); };
    controls.addEventListener('update', updateCamera);
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
      color: new THREE.Color('#7a99b2'), opacity: .45, transparent: true, renderedFaces: 0
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

    function clearOverlayObjects() {
      const geometries = new Set(), materials = new Set();
      overlays.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of [].concat(object.material ?? [])) materials.add(material);
      });
      overlays.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
    function renderOverlays() {
      clearOverlayObjects();
      if (!activePlan) return;
      for (const { data, surface } of regions.values()) {
        const profile = activePlan.profiles[data.type];
        if (!profile) continue;
        const fraction = Math.min(1, data.usableArea.value / surface.surfaceAreaM2 * profile.coverageFraction);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(coveredSurface(surface, fraction), 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: activePlan.id === 'light' ? '#729753' : '#427346', roughness: .95, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.regionId = data.id;
        overlays.add(mesh);
        const planted = extractGreeningSurface([{ positions: geometry.attributes.position.array, indices: Uint32Array.from({ length: geometry.attributes.position.count }, (_, index) => index), transform: new THREE.Matrix4() }], new THREE.Matrix4(), data.type, buildingBox.getCenter(new THREE.Vector3()));
        const count = Math.min(48, planted.triangles.length);
        const plants = new THREE.InstancedMesh(new THREE.ConeGeometry(.16, .5, 5), new THREE.MeshStandardMaterial({ color: '#31583c', roughness: 1 }), count);
        const dummy = new THREE.Object3D();
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < count; i++) {
          const triangle = planted.triangles[Math.floor(i * planted.triangles.length / count)];
          const normal = new THREE.Vector3().fromArray(triangle.normal);
          const center = new THREE.Vector3();
          for (const point of triangle.points) center.add(new THREE.Vector3().fromArray(point));
          center.multiplyScalar(1 / 3);
          const scale = Math.min(1.5, Math.max(.15, Math.sqrt(triangle.area * fraction) * .5)) * (activePlan.id === 'landscape' ? 1.4 : .7);
          dummy.position.copy(center).addScaledVector(normal, .035 + scale * .25);
          dummy.quaternion.setFromUnitVectors(up, normal); dummy.scale.setScalar(scale); dummy.updateMatrix();
          plants.setMatrixAt(i, dummy.matrix);
        }
        plants.instanceMatrix.needsUpdate = true;
        overlays.add(plants);
      }
      overlays.visible = showAfter;
    }
    function publishRegions() { onRegions([...regions.values()].map(({ data }) => structuredClone(data))); }
    function resetRegions() {
      regionEpoch++; pendingRegion = null; regions.clear(); activePlan = null; showAfter = false;
      clearOverlayObjects(); publishRegions();
    }
    async function prepareRegion({ type, selection, ground, crop }) {
      if (!currentModel || loading) throw new Error('Load a model before planning a region');
      if (!['roof','facade','terrace','ground'].includes(type)) throw new Error('Select a region type');
      const model = currentModel, version = modelVersion, epoch = ++regionEpoch, selectionStamp = selectionEpoch;
      pendingRegion = null;
      const center = buildingBox.getCenter(new THREE.Vector3());
      let surface, globalId = null, localId = null, name, geometrySource, placement;
      if (type === 'ground') {
        placement = { ...ground, x: center.x + ground.offsetX, z: buildingBox.max.z + ground.offsetZ, y: buildingBox.min.y + .04 };
        surface = groundSurface(placement); name = `Courtyard region ${regionSequence + 1}`; geometrySource = 'user-defined rectangle beside the model; not an IFC site boundary';
      } else {
        if (!selection || selection.modelVersion !== version || !selection.globalId) throw new Error('Select an IFC component in the current model first');
        const meshes = (await model.getItemsGeometry([selection.localId]))[0];
        if (epoch !== regionEpoch || currentModel !== model || selectionStamp !== selectionEpoch) throw new Error('Selection changed while preparing the region');
        model.object.updateMatrixWorld(true);
        surface = extractGreeningSurface(meshes, model.object.matrixWorld, type, center);
        const screening = screenRegion({ type, selection, surface, buildingBox });
        if (!screening.canPrepare) throw new Error(screening.reasons.join(' '));
        surface = cropGreeningSurface(surface, crop);
        globalId = selection.globalId; localId = selection.localId; name = selection.name;
        geometrySource = 'IFC display triangles; selected use is user-defined, not engineering approval';
      }
      const screening = screenRegion({ type, selection, surface, buildingBox });
      if (!screening.canPrepare) throw new Error(screening.reasons.join(' '));
      const id = `${version}:region:${++regionSequence}`;
      const data = { id, projectId: 'LOCAL-BUILDING-REVIEW', modelVersion: version, type, globalId, localId, name, geometrySource, surfaceCrop: type === 'ground' ? null : crop, screening, geometryAreaM2: surface.surfaceAreaM2, geometryAreaProvenance: 'assumed', geometryAreaSource: 'Display mesh estimate assuming model coordinates are metres; user confirmation required', placement: placement ?? null };
      pendingRegion = { data, surface, selectionStamp };
      return structuredClone(data);
    }
    function confirmRegion(id, area, constraintsConfirmed = false) {
      if (!constraintsConfirmed) throw new Error('Confirm the exterior/available region and unresolved review requirements first');
      if (!pendingRegion || pendingRegion.data.id !== id || pendingRegion.data.modelVersion !== modelVersion || loading) throw new Error('Review the region again before confirming');
      if (pendingRegion.data.type !== 'ground' && pendingRegion.selectionStamp !== selectionEpoch) throw new Error('Selection changed; review the region again');
      const { data, surface } = pendingRegion;
      if (!Number.isFinite(area) || area <= 0 || area > surface.surfaceAreaM2 * 1.001) throw new RangeError('Confirmed usable area must be positive and within the displayed region');
      if (data.globalId && [...regions.values()].some(({ data: other }) => other.globalId === data.globalId)) throw new Error('This component is already assigned; remove its existing region to change its use');
      if (data.type === 'ground' && [...regions.values()].some(({ data: other }) => other.placement && Math.abs(other.placement.x - data.placement.x) < (other.placement.width + data.placement.width) / 2 && Math.abs(other.placement.z - data.placement.z) < (other.placement.depth + data.placement.depth) / 2)) throw new Error('Ground regions overlap; move this rectangle before adding it');
      data.constraintAcknowledgement = 'User acknowledges outdoor/available area and unresolved professional checks; not engineering approval';
      data.usableArea = { value: area, unit: 'm2', provenance: 'user-confirmed', source: 'User-confirmed usable area for the selected presentation region; professional verification unresolved' };
      regions.set(id, { data, surface }); pendingRegion = null;
      publishRegions(); renderOverlays(); return structuredClone(data);
    }

    async function setView(direction) {
      if (!currentModel || loading) return;
      const sphere = await world.camera.getItemsBounding({ [currentModel.modelId]: new Set(displayIds) });
      const center = sphere.center;
      const offset = direction === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1, 0.7, 1);
      offset.normalize().multiplyScalar(Math.max(sphere.radius * 3, 1));
      await world.camera.controls.setLookAt(center.x + offset.x, center.y + offset.y, center.z + offset.z, center.x, center.y, center.z, true);
      await world.camera.fitToItems({ [currentModel.modelId]: new Set(displayIds) });
      resetZoomReference();
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
          resetRegions();
          fittedMagnification = null;
          publishZoom();
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
          buildingBox = box.clone();
          grid.three.position.y = box.min.y - 0.05;
          const sphere = box.getBoundingSphere(new THREE.Sphere());
          const center = sphere.center;
          const distance = Math.max(sphere.radius * 2.5, 1);
          await world.camera.projection.set('Perspective');
          await world.camera.controls.setLookAt(center.x + distance, center.y + distance * 0.7, center.z + distance, center.x, center.y, center.z);
          await world.camera.fitToItems({ [model.modelId]: new Set(geometryIds) });
          resetZoomReference();
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
            fittedMagnification = null;
            publishZoom();
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
      prepareRegion,
      confirmRegion,
      async listRegionCandidates(type) {
        if (!currentModel || loading || type === 'ground') return [];
        const model = currentModel, version = modelVersion;
        const pattern = type === 'facade' ? /^IFCWALL/ : /^(IFCROOF|IFCSLAB)$/;
        const ids = displayIds.filter((id) => pattern.test(categoryById.get(id)));
        const [data, guids] = await Promise.all([model.getItemsData(ids), model.getGuidsByLocalIds(ids)]);
        if (model !== currentModel || version !== modelVersion) return [];
        const candidates = ids.map((localId, index) => normalizeSelection({ localId, modelVersion: version, globalId: guids[index], category: categoryById.get(localId), data: data[index] }));
        const accepted = [];
        for (const candidate of candidates) {
          if (model !== currentModel || version !== modelVersion) return [];
          try {
            const meshes = (await model.getItemsGeometry([candidate.localId]))[0];
            model.object.updateMatrixWorld(true);
            const surface = extractGreeningSurface(meshes, model.object.matrixWorld, type, buildingBox.getCenter(new THREE.Vector3()));
            const screening = screenRegion({ type, selection: candidate, surface, buildingBox });
            if (screening.canPrepare) accepted.push({ ...candidate, screening, geometryAreaM2: surface.surfaceAreaM2 });
          } catch { /* No compatible face means no candidate for this region type. */ }
        }
        if (model !== currentModel || version !== modelVersion) return [];
        return accepted.sort((a, b) => b.geometryAreaM2 - a.geometryAreaM2);

      },
      removeRegion(id) { regions.delete(id); publishRegions(); renderOverlays(); },
      setPlan(plan, after = true) { activePlan = plan; showAfter = after; if (after) void highlighter.clear('select'); renderOverlays(); },
      setBeforeAfter(after) { if (after) void highlighter.clear('select'); showAfter = after; overlays.visible = Boolean(activePlan) && after; },
      getRegions() { return [...regions.values()].map(({ data }) => structuredClone(data)); },
      setRenderStyle(style) {
        renderStyle = style;
        postproduction.enabled = !cameraMoving && style !== 'basic';
        if (style !== 'basic') {
          postproduction.style = style === 'technical' ? OBF.PostproductionAspect.PEN_SHADOWS : OBF.PostproductionAspect.COLOR_PEN_SHADOWS;
        }
      },
      setGrid(visible) { grid.visible = visible; },
      async fit() {
        if (!currentModel || loading) return;
        const box = buildingBox.clone();
        for (const { surface } of regions.values()) for (const triangle of surface.triangles) for (const point of triangle.points) box.expandByPoint(new THREE.Vector3().fromArray(point));
        await controls.fitToSphere(box.getBoundingSphere(new THREE.Sphere()), true);
        resetZoomReference();
      },
      async clearSelection() { await highlighter.clear('select'); },
      async highlightRoof(globalId) {
        if (!currentModel || loading) return;
        const [id] = await currentModel.getLocalIdsByGuids([globalId]);
        if (id === null) throw new Error('That IFC GlobalId is not present in the loaded model');
        await highlighter.highlightByID('select', { [currentModel.modelId]: new Set([id]) });
      },
      async dispose() {
        controls.removeEventListener('update', updateCamera);
        selectionEpoch++;
        resetRegions();
        components.dispose();
      }
    };
  } catch (error) {
    components.dispose();
    throw error;
  }
}
