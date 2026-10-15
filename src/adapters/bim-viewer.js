import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as OBF from '@thatopen/components-front';
import workerUrl from '@thatopen/fragments/worker?url';
import plantCatalog from '../data/plants.json';
import { DEFAULT_PLANTING_COVERAGE, normalizePlantingSelection, plantingProfile } from '../domain/planting-selection.js';
import { createPlantingVisual } from './planting-visuals.js';
import { loadPlantVariants, disposePlantVariants } from './planting-assets.js';
import { confirmRegionBatch, previewRegionBatch } from '../domain/region-confirmation.js';
import { screenRegion, screenSurfaceBySlope, assessRoofAssemblies, assessGroundUse } from '../domain/region-screening.js';
import { normalizeSelection } from './selection-data.js';
import { extractGreeningSurface, excludeBuildingFootprint, groundSurface, coveredSurface, cropGreeningSurface, offsetSurfacePositions } from './greening-geometry.js';

/** IFC display, confirmed greening regions, scenario overlays and frontend handoff. */
export async function createBimViewer(container, { onSelection, onStatus, onModel, onRegions = () => {}, onZoom = () => {}, onPick = () => {}, onPlantAssetsState = () => {} }) {
  const components = new OBC.Components();
  const world = components.get(OBC.Worlds).create();
  let currentModel = null;
  let modelVersion = null;
  let categoryById = new Map();
  let selectionEpoch = 0;
  let loading = false;
  let programmaticSelection = 0;
  let pickQueue = Promise.resolve();
  let proposalQueue = Promise.resolve();
  let proposalState = null;
  let displayIds = [];
  let assistantIfcFile = null;
  let buildingBox;
  let pendingRegion;
  let regionSequence = 0;
  let regionEpoch = 0;
  const regions = new Map();
  const overlays = new THREE.Group();
  const candidateSurfaces = new Map();
  const screeningReports = new Map();
  let roofInventoryRequest=null, sourceRelationshipsRequest=null, groundFootprintRequest=null;
  const surfaceHighlights = new THREE.Group();
  let activePlan = null;
  let showAfter = false;
  let disposed = false;
  let shrubVariants = [];
  let fernVariants = [];
  let plantAppearance = 'model';
  const assetAbort = new AbortController();

  try {
    world.scene = new OBC.SimpleScene(components);
    world.scene.setup({
      backgroundColor: new THREE.Color('#f1f3f4'),
      ambientLight: { color: new THREE.Color('#ffffff'), intensity: 1.1 },
      directionalLight: { color: new THREE.Color('#ffffff'), intensity: 1.8, position: new THREE.Vector3(40, 60, 25) }
    });
    world.scene.three.add(overlays, surfaceHighlights);
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
      // Bound navigation relative to the fitted building, rather than an epsilon-sized distance.
      const distance = controls.distance;
      if (Number.isFinite(distance) && distance > 0) {
        controls.minDistance = Math.max(distance / 10, buildingBox?.getBoundingSphere(new THREE.Sphere()).radius * 1.05 || 0.1);
        controls.maxDistance = distance * 20;
      }
      const zoom = world.camera.three.zoom;
      controls.minZoom = zoom / 20;
      controls.maxZoom = zoom * 10;
      const camera = world.camera.three;
      const radius = buildingBox?.getBoundingSphere(new THREE.Sphere()).radius ?? 1;
      camera.near = Math.max(0.01, radius / 1000);
      camera.far = Math.max(1000, controls.maxDistance + radius * 4);
      camera.updateProjectionMatrix();
      publishZoom();
    }
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.azimuthRotateSpeed = 0.9;
    controls.polarRotateSpeed = 0.9;
    controls.truckSpeed = 1.8;
    controls.dollySpeed = 2.2;
    controls.smoothTime = 0.1;
    controls.draggingSmoothTime = 0.035;
    controls.dollyToCursor = false;
    controls.infinityDolly = false;
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
    postproduction.excludedObjectsEnabled = true;

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
      color: new THREE.Color('#7a99b2'), opacity: 1, transparent: false, priority: -1,
      preserveOriginalMaterial: true, _explicitProps: ['color', 'opacity', 'transparent']
    } });
    highlighter.multiple = 'none';
    highlighter.styles.set('inspected', { color: new THREE.Color('#7a99b2'), opacity: 1, transparent: false, priority: 2, preserveOriginalMaterial: true, _explicitProps: ['color', 'opacity', 'transparent'] });
    let inspectionQueue = Promise.resolve();
    // Focus is separate from persistent proposal membership. Every repeated click is delivered.
    highlighter.autoToggle.delete('select');
    highlighter.styles.set('recommended', { color: new THREE.Color('#72b4dd'), opacity: 1, transparent: false, priority: 0, preserveOriginalMaterial: true, _explicitProps: ['color', 'opacity', 'transparent'] });
    highlighter.styles.set('picked', { color: new THREE.Color('#24b38c'), opacity: 1, transparent: false, priority: 1, preserveOriginalMaterial: true, _explicitProps: ['color', 'opacity', 'transparent'] });

    highlighter.events.select.onHighlight.add(async (modelIdMap) => {
      const epoch = ++selectionEpoch;
      const model = currentModel;
      const version = modelVersion;
      if (!model || loading) return;
      const ids = modelIdMap[model.modelId];
      const localId = ids?.values().next().value;
      if (localId === undefined) return;
      const fromModel = programmaticSelection === 0;
      const dataPromise = Promise.all([model.getItemsData([localId]), model.getGuidsByLocalIds([localId])]);
      const resolveSelection = dataPromise.then(([data, guids]) => normalizeSelection({ modelVersion: version, localId, globalId: guids[0], category: categoryById.get(localId), data: data[0] }));
      // Inspect clicks in arrival order, even when IFC reads finish out of order.
      if (fromModel) pickQueue = pickQueue.then(async () => {
        const selection = await resolveSelection;
        if (model === currentModel && !loading) await onPick(selection);
      }).catch(error => { if (model === currentModel && !loading) onStatus(`Could not select location: ${error.message}`); });
      try {
        const selection = await resolveSelection;
        if (!fromModel && epoch === selectionEpoch && model === currentModel) onSelection(selection);
      } catch (error) {
        if (epoch === selectionEpoch) onStatus(`Could not read component: ${error.message}`);
      }
    });
    highlighter.events.select.onClear.add(() => { selectionEpoch++; });

    let proposalPulseFrame = null;
    let proposalPulseEpoch = 0;
    function clearSurfaceHighlights() {
      proposalPulseEpoch++; cancelAnimationFrame(proposalPulseFrame); proposalPulseFrame = null;
      for (const mesh of [...surfaceHighlights.children]) {
        postproduction.excludedObjectsPass.removeExcludedMaterial(mesh.material);
        mesh.geometry.dispose(); mesh.material.dispose();
      }
      surfaceHighlights.clear();
    }
    function addSurfaceHighlight(surface, style) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(offsetSurfacePositions(coveredSurface(surface, 1), .05), 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({ color: style === 'picked' ? '#24b38c' : '#72b4dd', transparent: true, opacity: style === 'picked' ? .82 : .70, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `${style} screened planting surface`;
      postproduction.excludedObjectsPass.addExcludedMaterial(material);
      surfaceHighlights.add(mesh);
    }
    function clearOverlayObjects() {
      const geometries = new Set(), materials = new Set(), excluded = new Set(), textures = new Set();
      overlays.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry && !object.userData.sharedPlantAsset) geometries.add(object.geometry);
        for (const material of [].concat(object.material ?? [])) {
          excluded.add(material);
          if (!object.userData.sharedPlantAsset) materials.add(material);
        }
      });
      overlays.clear();
      for (const material of excluded) postproduction.excludedObjectsPass.removeExcludedMaterial(material);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
    }
    function renderOverlays() {
      clearOverlayObjects();
      if (!activePlan) return;
      for (const { data, surface } of regions.values()) {
        const profile = plantingProfile(data, activePlan);
        if (!profile) continue;
        const fraction = Math.min(1, data.usableArea.value / surface.surfaceAreaM2 * profile.coverageFraction);
        const planting = createPlantingVisual({ positions: coveredSurface(surface, fraction), type: data.type, planId: activePlan.id, seed: data.globalId ?? data.id, planting: normalizePlantingSelection(data.planting ?? {}, data.type, plantCatalog), detail: plantAppearance, shrubVariants: plantAppearance === 'model' ? shrubVariants : [], fernVariants: plantAppearance === 'model' ? fernVariants : [] });
        planting.userData.regionId = data.id;
        // Restore original planting colors after BIM pen/AO passes, including technical drawing mode.
        planting.traverse(object => { if (object.material) postproduction.excludedObjectsPass.addExcludedMaterial(object.material); });
        overlays.add(planting);
      }
      overlays.visible = showAfter;
    }
    onPlantAssetsState('loading');
    let assetsSettled = 0;
    const loadAsset = async (url, save) => {
      try {
        const variants = await loadPlantVariants(url, assetAbort.signal);
        if (disposed) { disposePlantVariants(variants); return; }
        save(variants);
        renderOverlays();
      } catch { /* Each asset independently falls back to procedural planting. */ }
      finally {
        if (!disposed && ++assetsSettled === 2) {
          onPlantAssetsState(shrubVariants.length && fernVariants.length ? 'ready' : shrubVariants.length || fernVariants.length ? 'partial' : 'fallback');
        }
      }
    };
    void loadAsset('/plants/shrub-03.glb', variants => { shrubVariants = variants; });
    void loadAsset('/plants/fern-02.glb', variants => { fernVariants = variants; });
    function publishRegions() { onRegions([...regions.values()].map(({ data }) => structuredClone(data))); }
    function resetRegions() {
      regionEpoch++; pendingRegion = null; regions.clear(); activePlan = null; showAfter = false;
      clearOverlayObjects(); clearSurfaceHighlights(); candidateSurfaces.clear(); screeningReports.clear(); roofInventoryRequest=null;sourceRelationshipsRequest=null;groundFootprintRequest=null; publishRegions();
    }
    function sourceRelationships() {
      if(!sourceRelationshipsRequest)sourceRelationshipsRequest=(async()=>{
        if(!assistantIfcFile)return null;
        const {readIfcRelationships}=await import('./ifc-query-index.js');
        return readIfcRelationships(new Uint8Array(await assistantIfcFile.arrayBuffer()));
      })();
      return sourceRelationshipsRequest;
    }
    function groundFootprint() {
      if(!groundFootprintRequest){const ids=displayIds.filter(id=>/^(IFCWALL|IFCWALLSTANDARDCASE|IFCCOLUMN)$/.test(categoryById.get(id)));groundFootprintRequest=ids.length?currentModel.getMergedBox(ids):Promise.resolve(buildingBox);}
      return groundFootprintRequest;
    }
    async function enrichGroundSelection(selection, groundUse) {
      const source=await sourceRelationships();
      selection.properties.push(...(source?.elementProperties.get(selection.globalId)??[]));
      if(groundUse==='plantable')selection.properties.push({name:'UserReportedGroundUse',value:groundUse});
      return selection;
    }
    function roofInventory() {
      if(roofInventoryRequest)return roofInventoryRequest;
      const model=currentModel,version=modelVersion;
      const request=(async()=>{
        const ids=displayIds.filter(id=>/^(IFCROOF|IFCSLAB)$/.test(categoryById.get(id)));
        const [data,guids]=await Promise.all([model.getItemsData(ids),model.getGuidsByLocalIds(ids)]);
        const entries=[];
        for(let index=0;index<ids.length;index++){
          if(currentModel!==model||modelVersion!==version||loading)return {entries:[],assessments:new Map()};
          const candidate=normalizeSelection({localId:ids[index],modelVersion:version,globalId:guids[index],category:categoryById.get(ids[index]),data:data[index]});
          try {
            const meshes=(await model.getItemsGeometry([candidate.localId]))[0];model.object.updateMatrixWorld(true);
            const surface=extractGreeningSurface(meshes,model.object.matrixWorld,'roof',buildingBox.getCenter(new THREE.Vector3()),{sourceOnly:true});
            const top=surface.triangles.reduce((max,t)=>t.points.reduce((m,p)=>Math.max(m,p[1]),max),-Infinity);
            if(candidate.category==='IFCROOF'||/roof|dach/i.test(candidate.name)||top>=buildingBox.max.y-Math.max(1,(buildingBox.max.y-buildingBox.min.y)*.15))entries.push({globalId:candidate.globalId,candidate,surface});
          } catch { /* Missing/upward-incompatible geometry does not form a roof assembly. */ }
        }
        return {entries,assessments:assessRoofAssemblies(entries)};
      })();
      roofInventoryRequest=request;
      request.catch(()=>{if(roofInventoryRequest===request)roofInventoryRequest=null;});
      return request;
    }
    async function buildRegion({ type, selection, ground, crop, groundUse }, context) {
      if (!currentModel || loading) throw new Error('Load a model before planning a region');
      if (!['roof','facade','terrace','ground'].includes(type)) throw new Error('Select a region type');
      const { model, version, epoch, selectionStamp } = context;
      const center = buildingBox.getCenter(new THREE.Vector3());
      let surface, globalId = null, localId = null, name, geometrySource, placement;
      if (type === 'ground' && !selection?.globalId) {
        placement = { ...ground, x: center.x + ground.offsetX, z: buildingBox.max.z + ground.offsetZ, y: buildingBox.min.y + .04 };
        surface = groundSurface(placement); name = `Courtyard region ${regionSequence + 1}`; geometrySource = 'user-defined rectangle beside the model; not an IFC site boundary';
      } else {
        if (!selection || selection.modelVersion !== version || !selection.globalId) throw new Error('Select an IFC component in the current model first');
        if(type==='ground')await enrichGroundSelection(selection,groundUse);
        const meshes = (await model.getItemsGeometry([selection.localId]))[0];
        if (epoch !== regionEpoch || currentModel !== model || loading || (selectionStamp !== null && selectionStamp !== selectionEpoch)) throw new Error('Selection changed while preparing the region');
        model.object.updateMatrixWorld(true);
        surface = extractGreeningSurface(meshes, model.object.matrixWorld, type, center);
        if(type==='roof') {
          const inventory=await roofInventory();
          if(epoch!==regionEpoch||currentModel!==model||loading)throw new Error('Building changed while checking the complete roof');
          const assessment=inventory.assessments.get(selection.globalId);
          if(!assessment)throw new Error('Roof assembly could not be verified for default planting');
          surface.roofAssessment=assessment;
        }
        if(type==='ground')surface=excludeBuildingFootprint(surface,await groundFootprint());
        const screening = screenRegion({ type, selection, surface, buildingBox:type==='ground'?await groundFootprint():buildingBox });
        if (!screening.canPrepare) throw new Error(screening.reasons.join(' '));
        surface = cropGreeningSurface(surface, crop ?? {side:'full'});
        globalId = selection.globalId; localId = selection.localId; name = selection.name;
        geometrySource = 'IFC display triangles; selected use is user-defined, not engineering approval';
      }
      const screening = screenRegion({ type, selection, surface, buildingBox:type==='ground'&&selection?.globalId?await groundFootprint():buildingBox });
      if (!screening.canPrepare) throw new Error(screening.reasons.join(' '));
      const id = `${version}:region:${++regionSequence}`;
      const data = { id, projectId: 'LOCAL-BUILDING-REVIEW', modelVersion: version, type, globalId, localId, name, geometrySource, surfaceCrop: type === 'ground' ? null : crop, groundUse:groundUse ?? null, screening, geometryAreaM2: surface.surfaceAreaM2, geometryAreaProvenance: 'assumed', geometryAreaSource: 'Display mesh estimate assuming model coordinates are metres; user confirmation required', placement: placement ?? null };
      if (epoch !== regionEpoch || currentModel !== model || loading) throw new Error('The building or planning state changed; review the regions again');
      return { data, surface, selectionStamp };
    }
    async function prepareRegion(request) {
      const context = { model: currentModel, version: modelVersion, epoch: ++regionEpoch, selectionStamp: selectionEpoch };
      pendingRegion = null;
      pendingRegion = await buildRegion(request, context);
      return structuredClone(pendingRegion.data);
    }
    function confirmRegion(id, area, constraintsConfirmed = false, conceptPreview = false) {
      if (!conceptPreview && !constraintsConfirmed) throw new Error('Confirm the exterior/available region and unresolved review requirements first');
      if (!pendingRegion || pendingRegion.data.id !== id || pendingRegion.data.modelVersion !== modelVersion || loading) throw new Error('Review the region again before confirming');
      if (pendingRegion.data.globalId && pendingRegion.selectionStamp !== selectionEpoch) throw new Error('Selection changed; review the region again');
      const { data, surface } = pendingRegion;
      data.planting = normalizePlantingSelection({ ...data.planting, coverageFraction: data.planting?.coverageFraction ?? (conceptPreview ? DEFAULT_PLANTING_COVERAGE : null) }, data.type, plantCatalog);
      const [confirmed] = (conceptPreview ? previewRegionBatch : confirmRegionBatch)({ entries: [{ data, area }], existing: [...regions.values()].map(region => region.data), constraintsConfirmed });
      regions.set(id, { data: confirmed, surface }); pendingRegion = null; regionEpoch++;
      publishRegions(); renderOverlays(); return structuredClone(confirmed);
    }
    async function addCandidateRegions(requests, constraintsConfirmed = false, conceptPreview = false) {
      if (!currentModel || loading) throw new Error('Load a building before adding regions');
      if ((!conceptPreview && !constraintsConfirmed) || !requests.length) throw new Error('Select regions and confirm their areas and unresolved checks first');
      const context = { model: currentModel, version: modelVersion, epoch: ++regionEpoch, selectionStamp: null };
      pendingRegion = null;
      const ids = requests.map(request => request.localId);
      if (requests.some(request => request.modelVersion !== context.version || !displayIds.includes(request.localId))) throw new Error('A candidate belongs to an old or missing model');
      const [data, guids] = await Promise.all([context.model.getItemsData(ids), context.model.getGuidsByLocalIds(ids)]);
      if (context.model !== currentModel || context.epoch !== regionEpoch || loading) throw new Error('The building changed; find candidates again');
      const prepared = [];
      for (let index = 0; index < requests.length; index++) {
        const request = requests[index];
        if (!guids[index] || request.globalId !== guids[index]) throw new Error('The source component identity changed');
        const selection = normalizeSelection({ modelVersion: context.version, localId: ids[index], globalId: guids[index], category: categoryById.get(ids[index]), data: data[index] });
        const region = await buildRegion({ type: request.type, selection, crop: { side: 'full' }, groundUse:request.groundUse }, context);
        region.data.planting = normalizePlantingSelection({ ...request.planting, coverageFraction: request.planting?.coverageFraction ?? (conceptPreview ? DEFAULT_PLANTING_COVERAGE : null) }, request.type, plantCatalog);
        prepared.push({ ...region, area: request.area });
      }
      // Every geometry, identity and confirmation must pass before a single collection update.
      const confirmed = (conceptPreview ? previewRegionBatch : confirmRegionBatch)({ entries: prepared, existing: [...regions.values()].map(region => region.data), constraintsConfirmed });
      confirmed.forEach((data, index) => regions.set(data.id, { data, surface: prepared[index].surface }));
      regionEpoch++;
      publishRegions(); renderOverlays();
      return structuredClone(confirmed);
    }

    async function restoreProjectRegions(saved) {
      if (!currentModel || loading || regions.size) throw new Error('Restore into the freshly loaded project model');
      const context = { model: currentModel, version: modelVersion, epoch: ++regionEpoch, selectionStamp: null }, prepared = [];
      for (const entry of saved) {
        if (entry.modelVersion !== modelVersion) throw new Error('Saved region belongs to a different model');
        let selection = null;
        if (entry.globalId) {
          const [localId] = await currentModel.getLocalIdsByGuids([entry.globalId]);
          if (!displayIds.includes(localId)) throw new Error('Saved IFC component has no current display geometry');
          const [attributes] = await currentModel.getItemsData([localId]);
          selection = normalizeSelection({ modelVersion, localId, globalId: entry.globalId, category: categoryById.get(localId), data: attributes });
        }
        const region = await buildRegion({ type: entry.type, selection, ground: entry.placement, crop: entry.surfaceCrop, groundUse:entry.groundUse }, context);
        region.data.id = entry.id;
        region.data.planting = normalizePlantingSelection(entry.planting, entry.type, plantCatalog);
        prepared.push({ ...region, area: entry.usableArea.value });
      }
      const restored = prepared.length ? previewRegionBatch({ entries: prepared }) : [];
      if (currentModel !== context.model || regionEpoch !== context.epoch || loading) throw new Error('Model changed during restore');
      restored.forEach((data, index) => {
        data.usableArea.provenance = saved[index].usableArea.provenance === 'user-confirmed' ? 'user-confirmed' : 'assumed';
        data.usableArea.source = 'Saved user-reported area restored against current display geometry; no new approval';
        regions.set(data.id, { data, surface: prepared[index].surface });
        const sequence = Number(data.id.split(':region:').at(-1)); if (Number.isSafeInteger(sequence)) regionSequence = Math.max(regionSequence, sequence);
      });
      regionEpoch++; publishRegions(); renderOverlays(); return restored;
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
          proposalState = null;
          await highlighter.clear();
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
          assistantIfcFile = format === 'ifc' ? file : null;
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

    function applyProposalHighlights() {
      const state = proposalState, model = currentModel;
      proposalQueue = proposalQueue.catch(() => {}).then(async () => {
        if (!model || loading || currentModel !== model || state?.version !== modelVersion) return;
        const visible = new Set(displayIds);
        clearSurfaceHighlights(); surfaceHighlights.visible = true;
        const previewed = new Set(showAfter ? [...regions.values()].map(region => region.data.localId) : []);
        for (const style of ['recommended', 'picked']) {
          if (currentModel !== model || loading) return;
          const valid = state[style].filter(id => visible.has(id) && !previewed.has(id));
          for (const id of valid) {
            const surface = candidateSurfaces.get(`${state.types?.[id] ?? 'roof'}:${id}`);
            if (surface) addSurfaceHighlight(surface, style);
          }
          const componentIds = valid.filter(id => !candidateSurfaces.has(`${state.types?.[id] ?? 'roof'}:${id}`));
          if (componentIds.length) await highlighter.highlightByID(style, { [model.modelId]: new Set(componentIds) }, true, false);
          else await highlighter.clear(style);
        }
      });
      return proposalQueue;
    }

    let viewportVisible = true, viewportFrame = null;
    function resizeViewport() {
      if (disposed || !viewportVisible || !container.clientWidth || !container.clientHeight) return;
      world.renderer.resize(); world.camera.updateAspect(); postproduction.updateCamera();
      world.renderer.needsUpdate = true;
      void fragments.core.update(true).catch(error => { if (!disposed) onStatus(`Could not refresh model view: ${error.message}`); });
    }
    const viewportObserver = new ResizeObserver(resizeViewport);
    viewportObserver.observe(container);
    return {
      capturePreview() {
        if(disposed || !viewportVisible || !currentModel)return null;
        try {
          const renderer=world.renderer.three;
          renderer.render(world.scene.three,world.camera.three);
          const source=renderer.domElement;
          if(!source.width || !source.height)return null;
          const canvas=document.createElement('canvas');canvas.width=640;canvas.height=400;
          const context=canvas.getContext('2d'),scale=Math.min(canvas.width/source.width,canvas.height/source.height);
          context.fillStyle='#edf1ef';context.fillRect(0,0,canvas.width,canvas.height);
          context.drawImage(source,(canvas.width-source.width*scale)/2,(canvas.height-source.height*scale)/2,source.width*scale,source.height*scale);
          return canvas.toDataURL('image/jpeg',0.8);
        } catch { return null; }
      },
      setVisible(visible) {
        if (disposed) return;
        viewportVisible = visible; world.renderer.enabled = visible;
        cancelAnimationFrame(viewportFrame);
        if (visible) { resizeViewport(); viewportFrame = requestAnimationFrame(resizeViewport); }
      },
      openIfc: (file) => openFile(file, 'ifc'),
      openFragments: (file) => openFile(file, 'frag'),
      setView,
      prepareRegion,
      confirmRegion,
      addCandidateRegions,
      previewCandidateRegions: requests => addCandidateRegions(requests, false, true),
      previewRegion: (id, area) => confirmRegion(id, area, false, true),
      restoreProjectRegions,
      getViewState() { return { position: world.camera.controls.getPosition(new THREE.Vector3()).toArray(), target: world.camera.controls.getTarget(new THREE.Vector3()).toArray() }; },
      async restoreViewState(state) {
        if (!state) return;
        if (![...state.position, ...state.target].every(Number.isFinite)) throw new Error('Invalid saved camera');
        await world.camera.controls.setLookAt(...state.position, ...state.target, false); publishZoom();
      },
      async exportAssistantIndex() {
        if (!currentModel || loading) throw new Error('Load a building before querying');
        const model = currentModel, version = modelVersion, ids = [...categoryById.keys()];
        const components = []; let unidentifiedCount = 0;
        // Include non-display entities exposed by the engine too. No silent 80-item truncation.
        for (let offset = 0; offset < ids.length; offset += 1000) {
          const all = ids.slice(offset, offset + 1000), allGuids = await model.getGuidsByLocalIds(all);
          const batch = all.filter((id, i) => Boolean(allGuids[i])), guids = allGuids.filter(Boolean);
          unidentifiedCount += all.length - batch.length;
          const data = await model.getItemsData(batch);
          if (currentModel !== model || version !== modelVersion || loading) throw new Error('Building changed while preparing the index');
          for (let i = 0; i < batch.length; i++) {
            const selection = normalizeSelection({ modelVersion: version, localId: batch[i], globalId: guids[i], category: categoryById.get(batch[i]), data: data[i] });
            if (!selection.globalId) { unidentifiedCount++; continue; }
            components.push({ globalId: selection.globalId, name: selection.name, category: selection.category, properties: selection.properties.filter(p => !p.name.startsWith('_') && p.name !== 'Name'), surfaces: [] });
          }
        }
        let relationshipStatus = 'No source IFC file is available for this Fragments model; relationship queries are unavailable.';
        if (assistantIfcFile) {
          const relationships = await sourceRelationships();
          if (currentModel !== model || version !== modelVersion || loading) throw new Error('Building changed while reading IFC relationships');
          relationshipStatus = relationships.status;
          for (const item of components) {
            item.relations = relationships.references.get(item.globalId) ?? { spatialContainers: [], propertySets: [], openings: [] };
            item.properties.push(...(relationships.elementProperties.get(item.globalId) ?? []));
          }
        }
        return { components, unidentifiedCount, modelVersion: version, relationshipStatus };
      },
      async listRegionCandidates(type) {
        if (!currentModel || loading) return [];
        const model = currentModel, version = modelVersion;
        if(type==='ground'){
          const ids=displayIds.filter(id=>/^(IFCSITE|IFCGEOGRAPHICELEMENT|IFCSLAB|IFCBUILDINGELEMENTPROXY|IFCCOVERING)$/.test(categoryById.get(id))),accepted=[],rejected=[];
          const [data,guids,footprint]=await Promise.all([model.getItemsData(ids),model.getGuidsByLocalIds(ids),groundFootprint()]);
          for(let i=0;i<ids.length;i++){
            if(model!==currentModel||version!==modelVersion||loading)return [];
            const candidate=await enrichGroundSelection(normalizeSelection({localId:ids[i],modelVersion:version,globalId:guids[i],category:categoryById.get(ids[i]),data:data[i]}));
            const assessment=assessGroundUse(candidate);if(assessment.classification==='not-ground')continue;
            try{
              const surface=excludeBuildingFootprint(extractGreeningSurface((await model.getItemsGeometry([ids[i]]))[0],model.object.matrixWorld,'ground',footprint.getCenter(new THREE.Vector3())),footprint);
              const screening=screenRegion({type,selection:candidate,surface,buildingBox:footprint});
              screening.groundAssessment={...assessment,geometryReady:true};
              candidateSurfaces.set(`ground:${candidate.localId}`,surface);
              if(assessment.classification!=='protected')accepted.push({...candidate,screening,geometryAreaM2:surface.surfaceAreaM2});
              else rejected.push({globalId:candidate.globalId,name:candidate.name,type,screening});
            }catch{/* Missing exterior ground geometry is not available for planting preview. */}
          }
          screeningReports.set(type,{modelVersion:version,eligible:accepted.filter(x=>x.screening.canPrepare).length,rejected});
          return accepted.sort((a,b)=>b.geometryAreaM2-a.geometryAreaM2);
        }
        if(type==='roof') {
          const inventory=await roofInventory(),accepted=[],rejected=[];
          if(model!==currentModel||version!==modelVersion||loading)return [];
          for(const {candidate,surface:source} of inventory.entries){
            const surface=screenSurfaceBySlope(source,'roof');surface.roofAssessment=inventory.assessments.get(candidate.globalId);
            const screening=screenRegion({type,selection:candidate,surface,buildingBox});
            if(screening.canPrepare){candidateSurfaces.set(`${type}:${candidate.localId}`,surface);accepted.push({...candidate,screening,geometryAreaM2:surface.surfaceAreaM2});}
            else rejected.push({globalId:candidate.globalId,name:candidate.name,type,screening});
          }
          screeningReports.set(type,{modelVersion:version,eligible:accepted.length,rejected});
          return accepted.sort((a,b)=>b.geometryAreaM2-a.geometryAreaM2);
        }
        const pattern = type === 'facade' ? /^IFCWALL/ : /^(IFCROOF|IFCSLAB)$/;
        const ids = displayIds.filter((id) => pattern.test(categoryById.get(id)));
        const [data, guids] = await Promise.all([model.getItemsData(ids), model.getGuidsByLocalIds(ids)]);
        if (model !== currentModel || version !== modelVersion) return [];
        const candidates = ids.map((localId, index) => normalizeSelection({ localId, modelVersion: version, globalId: guids[index], category: categoryById.get(localId), data: data[index] }));
        const accepted = [], rejected = [];
        for (const candidate of candidates) {
          if (model !== currentModel || version !== modelVersion) return [];
          try {
            const meshes = (await model.getItemsGeometry([candidate.localId]))[0];
            model.object.updateMatrixWorld(true);
            const surface = extractGreeningSurface(meshes, model.object.matrixWorld, type, buildingBox.getCenter(new THREE.Vector3()));
            const screening = screenRegion({ type, selection: candidate, surface, buildingBox });
            if (screening.canPrepare) {
              candidateSurfaces.set(`${type}:${candidate.localId}`, surface);
              accepted.push({ ...candidate, screening, geometryAreaM2: surface.surfaceAreaM2 });
            } else if (type !== 'roof' || candidate.category === 'IFCROOF' || /roof|dach/i.test(candidate.name)) {
              rejected.push({globalId:candidate.globalId, name:candidate.name, type, screening});
            }
          } catch { /* No compatible face means no candidate for this region type. */ }
        }
        if (model !== currentModel || version !== modelVersion) return [];
        screeningReports.set(type, {modelVersion:version,eligible:accepted.length,rejected});
        return accepted.sort((a, b) => b.geometryAreaM2 - a.geometryAreaM2);

      },
      async pulseRecommendations() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        await applyProposalHighlights();
        if (disposed || loading) return;
        const meshes = surfaceHighlights.children.filter(mesh => mesh.name.startsWith('recommended'));
        const epoch = ++proposalPulseEpoch, started = performance.now();
        const animate = now => {
          if (disposed || epoch !== proposalPulseEpoch) return;
          const progress = Math.min(1, (now - started) / 850);
          for (const mesh of meshes) mesh.material.opacity = .70 - .30 * Math.sin(progress * Math.PI * 2) ** 2;
          if (progress < 1) proposalPulseFrame = requestAnimationFrame(animate);
          else proposalPulseFrame = null;
        };
        cancelAnimationFrame(proposalPulseFrame); proposalPulseFrame = requestAnimationFrame(animate);
      },
      getRegionScreeningReport(type) { return structuredClone(screeningReports.get(type) ?? {modelVersion,eligible:0,rejected:[]}); },
      setRegionPlanting(id, input) {
        if (loading || !currentModel) throw new Error('Load the current building before changing planting');
        const region = regions.get(id);
        if (!region || region.data.modelVersion !== modelVersion) throw new Error('Select a confirmed location in the current building');
        const planting = normalizePlantingSelection(input, region.data.type, plantCatalog);
        region.data.planting = planting; publishRegions(); renderOverlays();
        return structuredClone(region.data);
      },
      removeRegion(id) { regionEpoch++; pendingRegion = null; regions.delete(id); publishRegions(); renderOverlays(); },
      setPlan(plan, after = true) { surfaceHighlights.visible = true; activePlan = plan; showAfter = after; if (after) void highlighter.clear('select'); void applyProposalHighlights().catch(error => onStatus(error.message)); renderOverlays(); },
      setBeforeAfter(after) { surfaceHighlights.visible = true; if (after) void highlighter.clear('select'); showAfter = after; void applyProposalHighlights().catch(error => onStatus(error.message)); overlays.visible = Boolean(activePlan) && after; },
      getRegions() { return [...regions.values()].map(({ data }) => structuredClone(data)); },
      setPlantAppearance(style) {
        if (!['model', 'simple'].includes(style)) throw new Error('Choose a supported plant appearance');
        plantAppearance = style; renderOverlays();
      },
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
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const center = sphere.center, distance = Math.max(sphere.radius * 2.5, 1);
        // Recovery restores direction and target, not just distance along a broken view.
        await controls.setLookAt(center.x + distance, center.y + distance * .7, center.z + distance,
          center.x, center.y, center.z, false);
        await controls.fitToSphere(sphere, true);
        resetZoomReference();
        await fragments.core.update(true);
      },
      async clearSelection() { await highlighter.clear('select'); await highlighter.clear('inspected'); onSelection(null); },
      setInspectionHighlights(selections) {
        const model=currentModel, version=modelVersion;
        inspectionQueue=inspectionQueue.catch(()=>{}).then(async()=>{
          if(!model||loading||currentModel!==model||modelVersion!==version)return;
          const ids=selections.filter(item=>item.modelVersion===version).map(item=>item.localId);
          await highlighter.clear('select');
          if(ids.length)await highlighter.highlightByID('inspected',{[model.modelId]:new Set(ids)},true,false);
          else await highlighter.clear('inspected');
        });
        return inspectionQueue;
      },
      setProposalHighlights({ recommended = [], picked = [], types = {}, version }) {
        proposalState = { recommended, picked, types, version };
        return applyProposalHighlights();
      },
      async highlightRoof(globalId) {
        if (!currentModel || loading) return;
        const [id] = await currentModel.getLocalIdsByGuids([globalId]);
        if (id === null) throw new Error('That IFC GlobalId is not present in the loaded model');
        programmaticSelection++;
        try { await highlighter.highlightByID('select', { [currentModel.modelId]: new Set([id]) }); }
        finally { programmaticSelection--; }
      },
      async dispose() {
        disposed = true; assetAbort.abort();
        viewportObserver.disconnect(); cancelAnimationFrame(viewportFrame);
        controls.removeEventListener('update', updateCamera);
        selectionEpoch++;
        resetRegions();
        disposePlantVariants([...shrubVariants, ...fernVariants]); shrubVariants = []; fernVariants = [];
        components.dispose();
      }
    };
  } catch (error) {
    disposed = true; assetAbort.abort(); disposePlantVariants([...shrubVariants, ...fernVariants]);
    components.dispose();
    throw error;
  }
}
