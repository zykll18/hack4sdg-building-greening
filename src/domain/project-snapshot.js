import { normalizePlantingSelection } from './planting-selection.js';
import catalog from '../data/plants.json' with { type: 'json' };
import { cleanPlantingPlan } from './greening-agent.js';
import { assessProjectCost } from './cost-assessment.js';
import { assessInterventionCarbon } from './carbon-assessment.js';
import { normalizeCarbonModelSettings, DEFAULT_CARBON_MODEL } from './carbon-model.js';
import { validateSavedProjectBackground } from './project-background.js';

export const PROJECT_SCHEMA = 'ecometrolink-project-1';
export const MAX_MODEL_BYTES = 80 * 1024 * 1024;
const text = (value, max, label) => { if (typeof value !== 'string' || value.length > max) throw new TypeError(`Invalid saved ${label}`); return value; };
export function validateProjectSnapshot(raw) {
  if (!raw || raw.schemaVersion !== PROJECT_SCHEMA) throw new TypeError('选择完整项目备份，不是对比报告 / Unsupported project backup');
  if (JSON.stringify(raw).length > 8 * 1024 * 1024) throw new RangeError('Project data exceeds 8 MB');
  const model = raw.model;
  if (!model || !/^sha256:[a-f0-9]{64}$/.test(model.modelVersion) || !['ifc', 'frag'].includes(model.sourceFormat)) throw new TypeError('Invalid saved model identity');
  text(model.fileName, 300, 'file name');
  if (!Number.isInteger(raw.inputs?.years) || raw.inputs.years < 1 || raw.inputs.years > 1000 || (raw.inputs.budgetHkd !== null && (!Number.isFinite(raw.inputs.budgetHkd) || raw.inputs.budgetHkd < 0))) throw new TypeError('Invalid saved comparison inputs');
  if (!Array.isArray(raw.regions) || raw.regions.length > 1000) throw new TypeError('Invalid saved regions');
  const ids = new Set(), guids = new Set();
  const regions = raw.regions.map(region => {
    text(region.id, 256, 'region ID');
    if (ids.has(region.id) || region.modelVersion !== model.modelVersion || !['roof', 'facade', 'terrace', 'ground'].includes(region.type) || !Number.isFinite(region.usableArea?.value) || region.usableArea.value <= 0) throw new TypeError('Saved regions must have unique IDs and match the model');
    ids.add(region.id);
    if (region.type !== 'ground' || region.globalId) { text(region.globalId, 128, 'GlobalId'); if (!region.globalId || guids.has(region.globalId)) throw new TypeError('Duplicate or missing saved IFC identity'); guids.add(region.globalId); }
    else if (!region.placement || !['width', 'depth', 'offsetX', 'offsetZ'].every(key => Number.isFinite(region.placement[key])) || region.placement.width <= 0 || region.placement.depth <= 0) throw new TypeError('Invalid saved ground dimensions');
    const surfaceCrop = region.surfaceCrop ?? { side: 'full' };
    if (!['full', 'front', 'back', 'left', 'right'].includes(surfaceCrop.side) || (surfaceCrop.side !== 'full' && (!Number.isFinite(surfaceCrop.depth) || surfaceCrop.depth <= 0))) throw new TypeError('Invalid saved crop');
    return { id: region.id, modelVersion: model.modelVersion, type: region.type, globalId: region.globalId ?? null,
      usableArea: { value: region.usableArea.value, provenance: region.usableArea.provenance }, status: region.status,
      placement: region.placement ? Object.fromEntries(['width', 'depth', 'offsetX', 'offsetZ'].map(key => [key, region.placement[key]])) : null,
      surfaceCrop: { side: surfaceCrop.side, ...(surfaceCrop.side === 'full' ? {} : { depth: surfaceCrop.depth }) },
      groundUse: region.groundUse == null ? null : text(region.groundUse, 100, 'ground use'),
      planting: normalizePlantingSelection(region.planting, region.type, catalog) };
  });
  if (!['before', 'current'].includes(raw.preview)) throw new TypeError('Invalid saved view');
  const assistant = raw.assistant ?? {};
  if (!Array.isArray(assistant.turns ?? []) || (assistant.turns?.length ?? 0) > 20 || !Array.isArray(assistant.projectState ?? []) || (assistant.projectState?.length ?? 0) > 100) throw new TypeError('Invalid saved conversation');
  const turns = (assistant.turns ?? []).map(turn => ({ question: text(turn.question, 1000, 'question'), answer: text(turn.answer, 20000, 'answer'),
    // History is restored as transcript data; old apply actions are never replayed.
    reply: { answer: text(turn.reply?.answer ?? turn.answer, 20000, 'reply'), recommendations: (turn.reply?.recommendations ?? []).map(item => {
      if (!['roof', 'facade', 'terrace','ground'].includes(item.type) || (item.plantId !== null && !catalog.plants.some(plant => plant.id === item.plantId && plant.applicationRegions.includes(item.type))) || !Number.isFinite(item.coverageFraction) || item.coverageFraction < 0 || item.coverageFraction > 1) throw new TypeError('Invalid saved recommendation');
      return { globalId: text(item.globalId, 128, 'recommendation ID'), type: item.type, plantId: item.plantId, coverageFraction: item.coverageFraction, plantingPlan: cleanPlantingPlan(item.plantingPlan) };
    }), changes: [] } }));
  const projectState = (assistant.projectState ?? []).map(record => {
    if (!['fact', 'preference', 'hypothesis'].includes(record.kind) || !['soilDepthMm', 'light', 'irrigation', 'month', 'facadeSystem', 'maintenance', 'goal'].includes(record.field)) throw new TypeError('Invalid saved conditions');
    text(record.scope, 128, 'condition scope'); text(record.evidence, 1000, 'condition evidence');
    if (typeof record.value === 'number' ? !Number.isFinite(record.value) : typeof record.value !== 'string' || record.value.length > 300) throw new TypeError('Invalid saved condition value');
    return { scope: record.scope, kind: record.kind, field: record.field, value: record.value, evidence: record.evidence, source: 'user-reported' };
  });
  const camera = raw.camera ?? null;
  if (camera && (!Array.isArray(camera.position) || !Array.isArray(camera.target) || camera.position.length !== 3 || camera.target.length !== 3 || ![...camera.position, ...camera.target].every(Number.isFinite))) throw new TypeError('Invalid saved camera');
  const view = raw.view ?? {};
  if (!Array.isArray(assistant.conditions ?? []) || (assistant.conditions?.length ?? 0) > 1000 || !Array.isArray(assistant.systems ?? []) || (assistant.systems?.length ?? 0) > 1000) throw new TypeError('Invalid saved planting context');
  const conditions = (assistant.conditions ?? []).map(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || !entry[1] || typeof entry[1] !== 'object') throw new TypeError('Invalid saved form conditions');
    return [text(entry[0], 128, 'form scope'), Object.fromEntries(Object.entries(entry[1]).filter(([key]) => ['soilDepthMm', 'light', 'irrigation', 'month', 'facadeSystem'].includes(key)).map(([key, value]) => [key, typeof value === 'number' && Number.isFinite(value) ? value : text(value, 100, 'form value')]))];
  });
  const systems = (assistant.systems ?? []).map(item => ({ globalId: text(item.globalId, 128, 'system location'), type: text(item.type, 20, 'system region'), plantId: item.plantId == null ? null : text(item.plantId, 100, 'system plant'), plan: cleanPlantingPlan(item.plan) }));
  if (raw.cost?.accepted) assessProjectCost({ input: raw.cost.accepted, basis: raw.cost.accepted.basis, years: raw.inputs.years });
  let carbonModel = null;
  if (raw.carbonModel != null) {
    const saved = raw.carbonModel;
    const settings = normalizeCarbonModelSettings(saved.settings);
    if (typeof saved.pending !== 'boolean') throw new TypeError('Invalid saved model parameter state');
    const fields = Object.fromEntries(Object.entries(saved.fields ?? {}).filter(([key]) => key in DEFAULT_CARBON_MODEL && key !== 'version').map(([key, value]) => {
      if (key === 'enabled' ? typeof value !== 'boolean' : typeof value !== 'string' || value.length > 100) throw new TypeError('Invalid saved model parameter field');
      return [key, value];
    }));
    carbonModel = { settings, pending: saved.pending, fields };
  }
  if (raw.carbon) {
    if (!Array.isArray(raw.carbon) || raw.carbon.length > 1) throw new TypeError('Invalid saved carbon data');
    for (const value of raw.carbon) { if (value.planId !== 'current') throw new TypeError('Invalid saved carbon plan'); if (value.accepted) assessInterventionCarbon({ input: value.accepted, basis: value.accepted.basis, years: raw.inputs.years }); }
  }
  return { schemaVersion: PROJECT_SCHEMA, savedAt: text(raw.savedAt ?? '', 100, 'timestamp'), model: { fileName: model.fileName, sourceFormat: model.sourceFormat, modelVersion: model.modelVersion },
    inputs: { years: raw.inputs.years, budgetHkd: raw.inputs.budgetHkd }, regions, preview: raw.preview, camera,
    view: { renderStyle: ['shaded', 'technical', 'basic'].includes(view.renderStyle) ? view.renderStyle : 'shaded', appearance: view.appearance === 'simple' ? 'simple' : 'model', grid: Boolean(view.grid) },
    carbon: raw.carbon ?? null, carbonModel, cost: raw.cost ?? null, projectBackground: validateSavedProjectBackground(raw.projectBackground),
    assistant: { turns, projectState, conditions, systems } };
}
export async function verifyProjectFile(state, file) {
  if (!file || file.size <= 0 || file.size > MAX_MODEL_BYTES || file.name !== state.model.fileName || !file.name.toLowerCase().endsWith(`.${state.model.sourceFormat}`)) throw new TypeError('Invalid or oversized saved model file');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const version = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (version !== state.model.modelVersion) throw new TypeError('项目模型校验失败，文件与方案不匹配 / Model checksum mismatch');
}
export async function encodeProjectBackup(state, file) {
  state = validateProjectSnapshot(state); await verifyProjectFile(state, file);
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return JSON.stringify({ ...state, modelFile: { name: file.name, byteLength: bytes.length, base64: btoa(binary) } });
}
export async function decodeProjectBackup(value) {
  if (typeof value !== 'string' || value.length > 120 * 1024 * 1024) throw new RangeError('Project backup is too large');
  const parsed = JSON.parse(value), modelFile = parsed.modelFile; delete parsed.modelFile;
  const state = validateProjectSnapshot(parsed);
  if (!modelFile || !Number.isInteger(modelFile.byteLength) || modelFile.byteLength <= 0 || modelFile.byteLength > MAX_MODEL_BYTES || typeof modelFile.base64 !== 'string' || modelFile.base64.length !== 4 * Math.ceil(modelFile.byteLength / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(modelFile.base64)) throw new TypeError('Invalid embedded model data');
  const binary = atob(modelFile.base64); if (binary.length !== modelFile.byteLength) throw new TypeError('Invalid embedded model length');
  const file = new File([Uint8Array.from(binary, character => character.charCodeAt(0))], modelFile.name);
  await verifyProjectFile(state, file); return { state, file };
}
