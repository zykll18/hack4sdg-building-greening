import jasminePhoto from '../public/plants/library/trachelospermum-jasminoides.jpg?inline';
import { calculateBeforeAfter, CURRENT_PLAN, REGION_TYPES } from '../src/domain/greening-plan.js';
import plantCatalog from '../src/data/plants.json';
import { createPlantLibrary } from './plant-library.js';
import { createWorkspaceShell } from './workspace-shell.js';
import { createCarbonInputs } from './carbon-inputs.js';
import { carbonValue, carbonResultMarkup } from './carbon-presentation.js';
import { createCarbonModelInputs, carbonModelMarkup, modelRange } from './carbon-model.js';
import { comparisonOverviewMarkup } from './comparison-presentation.js';
import { adoptedPlantingReport, adoptedPlantingMarkup } from './report-planting.js';
import { createCostInputs, costResultMarkup, historicalCostMarkup } from './cost-inputs.js';
import { createProjectStore } from './project-store.js';
import { PROJECT_SCHEMA, validateProjectSnapshot, verifyProjectFile, encodeProjectBackup, decodeProjectBackup } from '../src/domain/project-snapshot.js';
import { DEFAULT_PLANTING_COVERAGE, createInspectionSelection, createPlantingOrder, normalizePlantingSelection } from '../src/domain/planting-selection.js';
import { recommendPlants, plantQuestion, isPlantQuestion, buildPlantRecommendationContext } from '../src/domain/plant-recommendations.js';
import { createAssistantClient } from './assistant-client.js';
import { prepareAssistantPlantingUpdates, prepareAutomaticPlanting } from './assistant-planting.js';
import { assistantHistory, formatAssistantText, createAssistantTrace } from './assistant-presentation.js';
import { buildAgentContext, isSurfacePreviewable, validateAgentReply } from '../src/domain/greening-agent.js';
import { createProjectBackground, projectBackgroundMarkup } from './project-background.js';
import { isHongKongBackground } from '../src/domain/project-background.js';

const $ = (id) => document.getElementById(id);
const floraImage = $('dashboard-flora-image'), floraFallback = $('dashboard-flora-fallback');
floraImage.addEventListener('load', () => { floraImage.hidden = false; floraFallback.hidden = true; });
floraImage.addEventListener('error', () => { floraImage.hidden = true; floraFallback.hidden = false; });
floraImage.src = jasminePhoto;

// Delegation also covers dynamically created region-removal buttons.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function buttonRipple(event) {
  if (reducedMotion.matches || (event.type === 'pointerdown' && event.button !== 0) ||
      (event.type === 'click' && event.detail !== 0)) return;
  const button = event.target instanceof Element ? event.target.closest('button, label.upload') : null;
  if (!button || !button.closest('#workspace') || button.matches(':disabled') ||
      button.querySelector('input:disabled')) return;
  const box = button.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const fromPointer = event.type === 'pointerdown';
  const x = fromPointer ? event.clientX - box.left : box.width / 2;
  const y = fromPointer ? event.clientY - box.top : box.height / 2;
  const size = 2 * Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
  const ripple = document.createElement('span');
  ripple.className = 'button-ripple';
  ripple.setAttribute('aria-hidden', 'true');
  Object.assign(ripple.style, { left: `${x - button.clientLeft}px`, top: `${y - button.clientTop}px`, width: `${size}px`, height: `${size}px` });
  button.append(ripple);
  const animation = ripple.animate([
    { transform: 'translate(-50%, -50%) scale(0)', opacity: .28 },
    { transform: 'translate(-50%, -50%) scale(.65)', opacity: .17, offset: .55 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }
  ], { duration: 650, easing: 'cubic-bezier(.2,.6,.3,1)' });
  animation.finished.then(() => ripple.remove(), () => ripple.remove());
}
document.addEventListener('pointerdown', buttonRipple);
document.addEventListener('click', buttonRipple);
const money = (value) => value === null || value === undefined ? '待补数据' : `HK$${Math.round(value).toLocaleString('en-HK')}`;
const number = (value) => Math.round(value).toLocaleString('en-HK');
let selected = null;
let viewer;
let importing = false;
let selectedComponent = null;
const inspectionSelection = createInspectionSelection();
let inspectionHighlightKey = null;
let plannedRegions = [];
const pendingPlantings = new Map();
const plantingCards = new Map();
const locationOrder = createPlantingOrder();
let plantingTargetKey = null;
let libraryPlantingTargetKey = null;
let draftRegion = null;
let preparationEpoch = 0;
const lastPlan = CURRENT_PLAN.id;
let candidateEpoch = 0;
let assistantEpoch = 0;
let analysing = false;
let assistantWorking = false;
let assistantRequest = null;
let assistantTimer = null;
let toastTimer = null;
let assistantUnread = false;
let applyingCombination = false;
let combinationEpoch = 0;
let proposalRows = [];
let recommendedGuids = new Map();
let recommendationVersion = null;
let lastHighlightKey = null;
let activeLocationGuid = null;
const candidateCache = new Map();
async function screenedCandidates(type) {
  if (!viewer || !loadedModel || importing) return [];
  const model = loadedModel, version = model.modelVersion, key = `${version}:${type}`;
  if (candidateCache.has(key)) return candidateCache.get(key);
  const request = viewer.listRegionCandidates(type);
  candidateCache.set(key, request);
  try {
    const candidates = await request;
    if (loadedModel !== model || importing) return [];
    return candidates;
  } catch (error) { if (candidateCache.get(key) === request) candidateCache.delete(key); throw error; }
}
async function refreshCandidates() {
  const epoch = ++candidateEpoch, type = $('region-type').value;
  $('candidate-fields').hidden = type === 'ground';
  $('region-candidate').disabled = true;
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Select a candidate component…';
  $('region-candidate').replaceChildren(placeholder);
  if (!viewer || !loadedModel || importing || type === 'ground') return;
  try {
    const candidates = await screenedCandidates(type);
    if (epoch !== candidateEpoch) return;
    for (const candidate of candidates) {
      if (!candidate.globalId) continue;
      const option = document.createElement('option'); option.value = candidate.globalId; option.textContent = `${candidate.name} · ${candidate.geometryAreaM2.toFixed(1)} m² · needs review`;
      $('region-candidate').append(option);
    }
    $('region-candidate').value = selectedComponent?.globalId ?? '';
    $('region-candidate').disabled = false;
  } catch (error) { if (epoch === candidateEpoch) $('region-draft-status').textContent = error.message; }
}
$('region-candidate').addEventListener('change', async (event) => {
  if (!event.target.value) return;
  try { await viewer.highlightRoof(event.target.value); }
  catch (error) { $('region-draft-status').textContent = error.message; }
});
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
function calculationInputs() {
  return { regions: plannedRegions, years: Number($('years').value), budgetHkd: $('budget').value === '' ? undefined : Number($('budget').value) };
}
let carbonInputs = null;
let carbonModelInputs = null;
let costInputs = null;
let projectBackground = null;
let modelFile = null, restoringProject = false, saveTimer = null, saveQueue = Promise.resolve(), lastSavedSignature = null;
const projectStore = createProjectStore();
let recoveryUnavailable = false;
let savedProjectRecord = null, workspacePreview = null;
function showSavedProject(record) {
  savedProjectRecord = record;
  $('saved-project-name').textContent = record?.state.projectBackground?.values?.buildingName || record?.state.projectBackground?.draft?.buildingName || record?.state.model.fileName || '尚无已保存项目';
  $('saved-project-detail').textContent = record ? `${record.state.regions.length} 个种植位置 · ${new Date(record.state.savedAt).toLocaleString('zh-HK')}` : '在建筑上添加植物后会自动保存。';
  $('restore-project').disabled = !record || importing || restoringProject;
  const image=$('saved-project-image'); image.hidden=!record?.preview;
  if(record?.preview)image.src=record.preview; else image.removeAttribute('src');
}
function captureWorkspacePreview() {
  const image=viewer?.capturePreview?.();
  if(image && loadedModel)workspacePreview={modelVersion:loadedModel.modelVersion,image};
  return workspacePreview && loadedModel && workspacePreview.modelVersion===loadedModel.modelVersion ? workspacePreview.image : null;
}
const localRecovery = projectStore.load().then(record => { showSavedProject(record); $('project-save-status').textContent = record ? `发现已保存项目：${record.state.model.fileName}` : '尚无本地项目；修改后自动保存。'; return record; }).catch(error => { recoveryUnavailable = true; $('project-save-status').textContent = `本地存储不可用：${error.message}。可使用完整备份。`; return null; });
function referenceModelSettings() { return isHongKongBackground(projectBackground?.get()) ? carbonModelInputs?.get() : null; }
function historicalRoofCostArea() {
  if (!isHongKongBackground(projectBackground?.get())) return 0;
  return plannedRegions.filter(region => region.type === 'roof' && region.planting?.plantId === 'sedum-lineare').reduce((area, region) => area + region.usableArea.value * region.planting.coverageFraction, 0);
}
function currentComparison() { return calculateBeforeAfter({ ...calculationInputs(), carbonEvidence: carbonInputs?.get(CURRENT_PLAN.id), costEvidence: costInputs?.get(), carbonModelSettings: referenceModelSettings() }); }
function planResults() { return [currentComparison().proposal]; }
let loadedModel = null;
let shell = null;
let viewerMounting = false;
let initialSamplePending = true;
const workspacePanels = [...document.querySelectorAll('.workspace-panel')];
const panelLaunchers = [...document.querySelectorAll('[data-panel][aria-expanded]')];

function syncPanelLaunchers() {
  for (const launcher of panelLaunchers) {
    launcher.setAttribute('aria-expanded', String($(launcher.dataset.panel).open));
  }
}

function closePanel(panel, { restoreFocus = true } = {}) {
  if (!panel?.open) return;
  if (panel.id === 'inspector-panel') stopVoice();
  panel.close();
  if (panel.id === 'inspector-panel' && assistantUnread) { $('assistant-result-dot').hidden = false; clearTimeout(toastTimer); $('assistant-toast').classList.remove('is-timed'); }
  syncPanelLaunchers();
  if (restoreFocus) panelLaunchers.find((button) => button.dataset.panel === panel.id)?.focus();
}

function openPanel(id, { focus = true } = {}) {
  if (id === 'plant-library-panel') { plantLibrary.open(); return; }
  shell?.navigate('calculator');
  const panel = $(id);
  if (id === 'inspector-panel') { assistantUnread = false; $('assistant-result-dot').hidden = true; }
  if (panel.open) return;
  const previousFocus = document.activeElement;
  for (const other of workspacePanels) closePanel(other, { restoreFocus: false });
  // Nonmodal dialogs leave the model interactive; only the panel occupies pointer space.
  panel.show();
  syncPanelLaunchers();
  if (!focus) (previousFocus === document.body ? $('bim-container') : previousFocus)?.focus({ preventScroll: true });
}

for (const button of document.querySelectorAll('[data-panel]')) button.addEventListener('click', () => {
  const panel = $(button.dataset.panel);
  if (panel.open) closePanel(panel);
  else openPanel(panel.id);
  if (button.classList.contains('text-button')) {
    document.querySelector('.input-details').open = true;
    $('years').focus({ preventScroll: false });
  }
});
for (const button of document.querySelectorAll('[data-close-panel]')) button.addEventListener('click', () => closePanel(button.closest('dialog')));
for (const panel of workspacePanels) panel.addEventListener('close', syncPanelLaunchers);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const panel = workspacePanels.find((item) => item.open);
  if (panel) {
    event.preventDefault();
    closePanel(panel);
  }
});
let assistantMode = 'location';
const assistantClient=createAssistantClient();
let assistantConfigured=false;
let assistantTurns=[];
let assistantProjectState=[];
let assistantIndexCache=null;
const assistantFormByLocation=new Map();
let assistantConditionScope=null;
function renderProjectContext() {
  const container=$('assistant-project-state');container.replaceChildren();
  container.hidden=!assistantProjectState.length;
  for (const record of assistantProjectState) {
    const row=document.createElement('p'),label=document.createElement('span'),remove=document.createElement('button');
    const scope=record.scope==='project'?'Project':proposalRows.find(row=>row.candidate.globalId===record.scope)?.label ?? 'Component';
    label.textContent=`${scope} · ${{fact:'User-reported / 用户提供',preference:'Preference / 偏好',hypothesis:'Hypothesis / 假设'}[record.kind]} · ${record.field}: ${record.value}`;
    row.title=record.evidence;remove.textContent='Remove / 删除';remove.type='button';
    remove.addEventListener('click',()=>{if(assistantWorking)return;assistantProjectState=assistantProjectState.filter(item=>item!==record);recommendedGuids.clear();$('assistant-ai-options').replaceChildren();renderProjectContext();showLocationRecommendations();});
    row.append(label,remove);container.append(row);
  }
}
function renderAssistantHistory() {
  const turns=assistantTurns.map(turn=>{
    const item=document.createElement('li');
    const question=document.createElement('p');question.className='submitted-question';question.textContent=turn.question;question.setAttribute('aria-label','Your question');
    const answer=document.createElement('p');answer.className='assistant-reply';answer.textContent=turn.answer;answer.setAttribute('aria-label','AI reply');
    item.append(question,answer);return item;
  });
  $('assistant-history').replaceChildren(...turns);
  scheduleProjectSave();
}
function resetAssistantConversation() {
  assistantTurns=[];$('assistant-history').replaceChildren();
  $('assistant-submitted').hidden=true;$('assistant-submitted').textContent='';
  $('assistant-answer').textContent='Ask for a recommendation, or click the building to choose locations.';
  $('assistant-question').value='';$('assistant-question').placeholder='Where to plant? Which roof plants?';
  resizeQuestion();
  $('assistant-question-label').textContent='Ask about locations or plants';$('assistant-new-chat').hidden=true;
  $('assistant-input-status').textContent='';$('assistant-input-status').hidden=true;
  $('assistant-ai-options').replaceChildren();$('assistant-ai-options').hidden=true;
}
$('assistant-new-chat').addEventListener('click',()=>{
  if(importing||assistantWorking||analysing||applyingCombination)return;
  resetAssistantConversation();recommendedGuids.clear();for(const row of proposalRows){delete row.recommendedPlantId;delete row.recommendedCoverageFraction;delete row.recommendedPlantingPlan;}showLocationRecommendations();
  clearTimeout(toastTimer);$('assistant-toast').hidden=true;assistantUnread=false;$('assistant-result-dot').hidden=true;
  $('assistant-question').focus();
});
void assistantClient.status().then(state=>{
  assistantConfigured=state.configured;
  $('assistant-service-status').textContent=state.configured?'Qwen configured / 已配置':state.reachable===false?'AI service offline / 服务未启动':'AI not configured · manual selection available';
});
async function analyseLocations(question = '', { open = true } = {}) {
  assistantMode = 'location';
  if (open) openPanel('inspector-panel');
  if (!loadedModel || importing) { $('assistant-answer').textContent = 'Load a building before finding planting candidates.'; return; }
  if (applyingCombination) return;
  const epoch = ++assistantEpoch, version = loadedModel.modelVersion;
  analysing = true;
  $('assistant-ask').disabled = true;
  const previousRows = proposalRows, previousSections = [...$('assistant-candidates').children];
  const previous = new Map(proposalRows.filter(row => row.picked).map(row => [row.candidate.globalId, { type: row.type, area: row.area.value }]));
  proposalRows = [];
   $('combination-status').textContent = '';
  $('assistant-candidates').replaceChildren();
  const counts = {};
  const requested = /roof|屋頂|屋顶/i.test(question) ? ['roof'] : /facade|wall|立面|外牆|外墙/i.test(question) ? ['facade'] : /terrace|balcony|露台|陽台|阳台/i.test(question) ? ['terrace'] : /ground|courtyard|地面|庭院/i.test(question) ? ['ground'] : ['roof','facade','terrace','ground'];
  try {
    for (const type of ['roof', 'facade', 'terrace', 'ground']) {
      const candidates = await screenedCandidates(type);
      if (epoch !== assistantEpoch || loadedModel?.modelVersion !== version || importing) return;
      counts[type] = candidates.length;
      const section = document.createElement('section'), heading = document.createElement('h3');
      heading.textContent = `${REGION_TYPES[type]} · selected locations`; section.hidden = true; section.append(heading);
      candidates.forEach((candidate, index) => {
        if (!candidate.globalId) return;
        const row = document.createElement('div'); row.className = 'proposal-candidate';
        const choice = document.createElement('div'); choice.className = 'candidate-choice';
        const name = document.createElement('strong'); const label = `${REGION_TYPES[type]} · ${type[0].toUpperCase()}${String(index + 1).padStart(2, '0')}`; name.textContent = label;
        choice.append(name);
        const estimate = document.createElement('p'); estimate.className = 'note'; estimate.textContent = `${candidate.geometryAreaM2.toFixed(1)} m² screened display estimate · conditional${candidate.screening.slopeScreening ? ` · ${candidate.screening.slopeScreening.excludedAreaM2.toFixed(1)} m² excluded by local slope` : ''}`;
        const details = document.createElement('details'), summary = document.createElement('summary'), reason = document.createElement('p');
        summary.textContent = 'Reasons & IFC details'; reason.className = 'note';
        reason.textContent = [...candidate.screening.reasons, ...candidate.screening.missing].join(' '); details.append(summary, reason);
        const systems = document.createElement('p'); systems.className = 'note'; systems.textContent = type === 'roof' ? 'Consider low planting. Loading and drainage need review.' : type === 'facade' ? 'Consider climbing plants or a living wall. Confirm exterior exposure and clearances.' : 'Consider planter boxes. Confirm outdoor exposure and clear access.';
        reason.textContent += ` IFC: ${candidate.name} · ${candidate.globalId}. ${CURRENT_PLAN.profiles[type].name}`;
        const areaLabel = document.createElement('label'); areaLabel.className = 'candidate-area'; areaLabel.append('Usable area (m²)');
        const area = document.createElement('input'); area.type = 'number'; area.min = '.01'; area.step = '.01'; area.max = String(candidate.geometryAreaM2);
        area.value = previous.get(candidate.globalId)?.area ?? (Math.floor(candidate.geometryAreaM2 * 100) / 100).toFixed(2); areaLabel.append(area);
        const areaError = document.createElement('p'); areaError.className = 'candidate-area-error'; areaError.id = `proposal-area-${type}-${candidate.localId}`; areaError.hidden = true; areaError.setAttribute('role', 'alert');
        area.setAttribute('aria-describedby', areaError.id);
        const locate = document.createElement('button'); locate.type = 'button'; locate.textContent = 'Locate on model';
        locate.addEventListener('click', async () => {
          if (loadedModel?.modelVersion !== version || importing || applyingCombination) return;
          $('region-type').value = type; updateRegionType();
          try { await viewer.highlightRoof(candidate.globalId); openPanel('inspector-panel'); }
          catch (error) { showPlantingStatus(error.message); }
        });
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove from selection';
        const edit = document.createElement('details'); const editSummary = document.createElement('summary'); editSummary.textContent = 'Adjust usable area'; edit.append(editSummary, areaLabel, areaError);
        const areaReadout = document.createElement('p'); areaReadout.className = 'location-area';
        const record = { label, edit, areaReadout, type, candidate, picked: previous.get(candidate.globalId)?.type === type, area, areaError, locate, remove, row, section };
        remove.addEventListener('click', () => addModelLocation(candidate));
        area.addEventListener('input', () => {  updateCombinationControls(); });
        const actions = document.createElement('div'); actions.className = 'location-actions'; actions.append(locate, remove);
        details.prepend(estimate); row.append(choice, systems, areaReadout, edit, details, actions);
        proposalRows.push(record); section.append(row);
      });
      $('assistant-candidates').append(section);
    }
    recommendationVersion = version;
    recommendedGuids = new Map();
    const chinese = /[\u3400-\u9fff]/.test(question) || (!question && $('voice-language').value.startsWith('zh'));
    const summary = Object.entries(counts).map(([type, count]) => `${chinese ? {roof:'屋顶',facade:'立面',terrace:'露台',ground:'庭院'}[type] : REGION_TYPES[type]}: ${count}`).join(' · ');
    const roofReport=viewer.getRegionScreeningReport('roof');
    $('screening-summary').textContent = summary;
    $('roof-screening-note').textContent = '斜屋顶、曲面屋顶已开放概念预览，并沿原始表面种植；防滑固定、承载、防水和排水需项目核验。';
    if (!assistantWorking && !assistantTurns.length) $('assistant-answer').textContent = 'Ask for a recommendation, or click the building to choose locations.';

  } catch (error) { if (epoch === assistantEpoch) { proposalRows = previousRows; $('assistant-candidates').replaceChildren(...previousSections); $('assistant-answer').textContent = `Location screening failed: ${error.message}. Earlier selections are preserved. Try finding locations again.`; } }
  finally { if (epoch === assistantEpoch) { analysing = false;  refreshImportControls(); } }
}
$('assistant-ask').addEventListener('click', () => void askAssistant());
function resizeQuestion() {
  const input = $('assistant-question');
  input.style.height = 'auto';
  input.style.height = `${Math.min(180, Math.max(64, input.scrollHeight))}px`;
}
$('assistant-question').addEventListener('input', resizeQuestion);
function setAssistantFeedback(working) {
  $('inspection-guidance').setAttribute('aria-busy', String(working));
  $('assistant-ask').classList.toggle('is-loading', working);
  $('assistant-ask').setAttribute('aria-label', working ? 'Generating recommendations' : 'Send question');
  $('assistant-ask-label').textContent = working ? 'Generating recommendations' : 'Send question';
  document.querySelector('.assistant-composer').classList.toggle('is-working', working);
}
function stopAssistantWork() {
  clearInterval(assistantTimer); assistantTimer = null;
  assistantWorking = false; analysing = false; assistantRequest = null;
  $('assistant-progress').hidden = true;
  setAssistantFeedback(false);
  refreshImportControls();
}
let toastExit = null;
function dismissRecommendation() {
  clearTimeout(toastTimer);
  const toast = $('assistant-toast');
  toastExit?.cancel();
  if (toast.hidden || reducedMotion.matches) { toast.hidden = true; return; }
  const animation = toast.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(8px) scale(.98)' }], { duration: 160, easing: 'ease-out' });
  toastExit = animation;
  animation.finished.then(() => { if (toastExit === animation) { toast.hidden = true; toastExit = null; } }, () => {});
}
function notifyRecommendation(message, failed = false) {
  clearTimeout(toastTimer);
  toastExit?.cancel(); toastExit = null;
  $('assistant-toast-title').textContent = message;
  $('assistant-toast-description').textContent = failed ? 'Your selected locations are kept. / 已保留选区。' : 'Open Inspect to review the reply. / 查看回复与位置。';
  $('assistant-toast-view').textContent = failed ? 'Review request / 查看请求' : 'View recommendation ↗';
  $('assistant-toast').classList.toggle('failed', failed);
  $('assistant-toast').hidden = false;
  $('assistant-toast').classList.toggle('is-timed', $('inspector-panel').open);
  if (!reducedMotion.matches) $('assistant-toast').animate([{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'translateY(-2px) scale(1.01)', offset: .75 }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' });
  assistantUnread = !failed;
  $('assistant-result-dot').hidden = $('inspector-panel').open || failed;
  toastTimer = $('inspector-panel').open ? setTimeout(dismissRecommendation, 8000) : null;
}
$('assistant-toast-dismiss').addEventListener('click', dismissRecommendation);
$('assistant-toast-view').addEventListener('click', () => {
  openPanel('inspector-panel'); revealInspectorSection($('inspection-guidance'));
  dismissRecommendation();
});
$('assistant-cancel').addEventListener('click', () => assistantRequest?.abort());
$('recommend-building').addEventListener('click', () => {
  if ($('recommend-building').disabled) return;
  openPanel('inspector-panel');
  $('assistant-question').value = '请为整栋建筑推荐适合的种植位置和植物，并为每个位置给出覆盖率及种植配置。优先推荐尚未种植的位置，保留已有种植，不需要先追问偏好；未知现场条件作为建议中待确认项。请调用 proposePlanting 返回可展示的方案。';
  resizeQuestion();
  void askAssistant({autoPlant: true});
});
async function askAssistant({autoPlant = false} = {}) {
  if (assistantWorking || analysing || importing || applyingCombination) return;
  const question = $('assistant-question').value.trim();
  const inputStatus=message=>{$('assistant-input-status').textContent=message;$('assistant-input-status').hidden=false;};
  $('assistant-input-status').hidden=true;
  if (!question) { inputStatus('Enter a question / 请先输入问题。'); return; }
  if (!loadedModel) { inputStatus('Load a building first / 请先加载建筑。'); return; }
  const backgroundVersion = loadedModel.modelVersion;
  if (!projectBackground.ensure(() => { if (loadedModel?.modelVersion === backgroundVersion && !importing) { openPanel('inspector-panel'); void askAssistant({autoPlant}); } })) {
    for (const panel of workspacePanels) closePanel(panel, { restoreFocus: false });
    inputStatus('请先确认左侧便利贴上的项目背景。'); return;
  }
  const previousOptions=[...$('assistant-ai-options').children];
  const previousState=JSON.stringify(assistantProjectState);
  const request = new AbortController(), version = loadedModel.modelVersion;
  stopVoice();renderAssistantHistory();
  assistantRequest = request; assistantWorking = analysing = true;
  const started = performance.now();
  const trace=createAssistantTrace();
  const recordTrace=event=>{trace.record(event);const events=trace.snapshot();try{sessionStorage.setItem('bg-assistant-tool-trace',JSON.stringify(events));}catch{}};
  recordTrace({type:'preparing'});
  toastExit?.cancel(); toastExit = null;
  $('assistant-toast').hidden = true; assistantUnread = false; $('assistant-result-dot').hidden = true;
  $('assistant-ai-options').replaceChildren(); $('assistant-ai-options').hidden = true;
  $('assistant-submitted').textContent = question; $('assistant-submitted').hidden = false;
  $('assistant-new-chat').hidden=false;
  $('assistant-answer').textContent = '';
  $('assistant-progress').hidden = false;
  $('assistant-progress-label').textContent = 'Generating recommendation / 正在生成推荐…';
  $('assistant-elapsed').textContent = '0s';
  setAssistantFeedback(true);
  assistantTimer = setInterval(() => { $('assistant-elapsed').textContent = `${Math.floor((performance.now() - started) / 1000)}s`; }, 1000);
  refreshImportControls(); revealInspectorSection($('assistant-submitted'));
  try {
    if (!assistantConfigured) {
      const state = await assistantClient.status(); assistantConfigured = state.configured;
      if (assistantRequest !== request || version !== loadedModel?.modelVersion || importing) return;
      request.signal.throwIfAborted();
      if (!assistantConfigured) throw new Error('AI is not connected / AI 尚未连接，可点击建筑手动选位置。');
    }
    if (recommendationVersion !== version) await analyseLocations('', { open: false });
    if (assistantRequest !== request || version !== loadedModel?.modelVersion || importing) return;
    request.signal.throwIfAborted();
    const epoch = assistantEpoch;
    $('assistant-progress-label').textContent = 'Preparing building queries / 正在准备建筑查询…';
    if (!assistantIndexCache || assistantIndexCache.version !== version) {
      const promise = viewer.exportAssistantIndex();
      assistantIndexCache = {version, promise};
      promise.catch(() => { if (assistantIndexCache?.promise === promise) assistantIndexCache = null; });
    }
    const snapshot = await assistantIndexCache.promise;
    if (assistantRequest !== request || epoch !== assistantEpoch || version !== loadedModel?.modelVersion || importing) return;
    request.signal.throwIfAborted();
    const buildingIndex = snapshot.components.map(item => ({...item, surfaces:[]}));
    const byId = new Map(buildingIndex.map(item => [item.globalId,item]));
    for (const row of proposalRows) {
      const item = byId.get(row.candidate.globalId);
      if (!item) continue;
      item.surfaces.push({type:row.type, displayLabel:row.label, areaM2:row.candidate.geometryAreaM2, previewable:row.candidate.screening.canPrepare,groundAssessment:row.candidate.screening.groundAssessment ?? null,
        reasons:row.candidate.screening.reasons, checks:row.candidate.screening.missing, roofAssessment:row.candidate.screening.roofAssessment ?? null});
    }
    for (const type of ['roof','facade','terrace']) {
      for (const [i,rejected] of viewer.getRegionScreeningReport(type).rejected.entries()) {
        const item = byId.get(rejected.globalId);
        if (!item || item.surfaces.some(surface=>surface.type===type)) continue;
        item.surfaces.push({type,displayLabel:`${REGION_TYPES[type]} · review ${i+1}`,areaM2:null,previewable:false,
          reasons:rejected.screening.reasons,checks:rejected.screening.missing,roofAssessment:rejected.screening.roofAssessment ?? null,groundAssessment:rejected.screening.groundAssessment ?? null});
      }
    }
    const chosen = plantingTargets().filter(target=>target.region && byId.has(target.region.globalId)).map(target=>target.region).map(region=>({globalId:region.globalId,type:region.type,areaM2:region.usableArea.value,plantId:region.planting.plantId,coverageFraction:region.planting.coverageFraction ?? .5}));
    const scope = autoPlant ? null : activeLocationGuid ?? selectedComponent?.globalId ?? null;
    const payload = {question,history:autoPlant ? [] : assistantHistory(assistantTurns,10),modelVersion:version,buildingName:loadedModel.fileName,buildingIndex,
      unindexedSelectedCount:plannedRegions.filter(region=>!byId.has(region.globalId)).length, unidentifiedCount:snapshot.unidentifiedCount, relationshipStatus:snapshot.relationshipStatus, selected:chosen,inspectedGlobalIds:autoPlant ? [] : inspectionSelection.items().map(item=>item.globalId).filter(id=>byId.has(id)),focusedGlobalId:scope,projectState:assistantProjectState,
      lastRecommendations:assistantTurns.findLast(turn=>turn.reply.recommendations.length)?.reply.recommendations.map(({globalId,type,plantId,explanation,coverageFraction,coverageRationale,plantingPlan})=>({globalId,type,plantId,explanation,coverageFraction,coverageRationale,plantingPlan})) ?? [],
      formConditions:{scope:byId.has(scope)?scope:null,values:assistantFormByLocation.get(scope) ?? {}},language:$('voice-language').value,carbonModelSettings:referenceModelSettings() ?? null,projectBackground:projectBackground.get()};
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 16*1024*1024) throw new Error('Building query index exceeds 16 MB. No components were silently omitted / 建筑索引超出大小限制，未截断构件。');
    const conditionStamp = JSON.stringify(payload.formConditions), context = buildAgentContext(payload, plantCatalog);
    analysing = true; refreshImportControls();
    let streamedAnswer = '';
    const labels = {queryBuilding:'Querying building / 正在查询建筑',inspectLocation:'Inspecting location / 正在查看位置',searchPlants:'Searching plants / 正在查询植物',retrieveGuidance:'Retrieving sources / 正在查阅资料',recordContext:'Saving project context / 正在记录项目条件',comparePlans:'Calculating comparison / 正在计算方案',proposePlanting:'Preparing highlighted locations / 正在整理推荐位置',proposeChanges:'Preparing planting changes / 正在整理修改方案'};
    recordTrace({type:'sent'});
    const reply = await assistantClient.ask(payload, {signal:request.signal,onEvent:event=>{
      if (assistantRequest !== request || version !== loadedModel?.modelVersion || request.signal.aborted) return;
      recordTrace(event);
      if (event.type==='ready') $('assistant-progress-label').textContent='Considering your question / 正在处理问题…';
      if (event.type==='tool-start') $('assistant-progress-label').textContent=labels[event.tool] ?? 'Querying / 正在查询…';
      if (event.type==='tool-end') $('assistant-progress-label').textContent=event.success?'Query complete · continuing / 查询完成，继续处理…':'Query needs adjustment / 正在调整查询…';
      if (event.type==='answer-start') streamedAnswer='';
      if (event.type==='text') {streamedAnswer+=event.text;$('assistant-answer').textContent=formatAssistantText(streamedAnswer,proposalRows,plantCatalog.plants);$('assistant-progress-label').textContent='Writing answer / 正在回答…';}
    }});
    if (assistantRequest !== request || epoch !== assistantEpoch || version !== loadedModel?.modelVersion || importing) return;
    request.signal.throwIfAborted();
    if (JSON.stringify(payload.projectBackground) !== JSON.stringify(projectBackground.get())) throw new Error('项目背景已更改，请重新提问。');
    if (conditionStamp !== JSON.stringify({scope:payload.formConditions.scope,values:assistantFormByLocation.get(scope) ?? {}}) || question !== $('assistant-question').value.trim()) throw new Error('Question or conditions changed. Ask again / 问题或条件已更改，请重新提问。');
    if (reply.modelVersion !== version || reply.catalogVersion !== context.catalogVersion) throw new Error('AI result belongs to a different model/catalog.');
    const updatedContext = buildAgentContext({...payload,projectState:reply.projectState},plantCatalog);
    const checked = validateAgentReply(reply,updatedContext,plantCatalog);
    assistantProjectState = checked.projectState;
    renderProjectContext();
    const contextChanged=previousState!==JSON.stringify(assistantProjectState);
    if (checked.recommendations.length || contextChanged) recommendedGuids = new Map(checked.recommendations.map(item => [item.globalId, item.type]));
    else if (!checked.changes.length) $('assistant-ai-options').append(...previousOptions);
    for(const record of assistantProjectState)if(record.kind==='fact'&&record.scope!=='project') {
      const values=assistantFormByLocation.get(record.scope) ?? {};
      assistantFormByLocation.set(record.scope,{...values,[record.field]:record.value});
    }
    assistantConditionScope=null;syncConditionScope();
    const answer=formatAssistantText(checked.answer, proposalRows, plantCatalog.plants);
    $('assistant-answer').textContent=answer;
    const applyChanges=()=>{
      if (loadedModel?.modelVersion!==version || importing || applyingCombination) throw new Error('Building changed. Ask again / 建筑已更改，请重新提问。');
      if(JSON.stringify(assistantProjectState)!==JSON.stringify(checked.projectState))throw new Error('Project conditions changed. Ask again / 项目条件已更改，请重新提问。');
      const updates=prepareAssistantPlantingUpdates(checked.changes,plannedRegions,payload.selected,plantCatalog);
      for(const update of updates)viewer.setRegionPlanting(update.id,update.planting);
      setPreview(selected ?? lastPlan);showLocationRecommendations();
    };
    let changesApplied=false;
    if(!autoPlant && checked.changes.length && checked.changeMode==='apply') {applyChanges();changesApplied=true;}
    for (const [index, item] of checked.recommendations.entries()) {
      const row = proposalRows.find(row => row.type === item.type && row.candidate.globalId === item.globalId);
      if (!row) continue;
      row.recommendedPlantId = item.plantId;
      row.recommendedCoverageFraction=item.coverageFraction;
      row.recommendedPlantingPlan=item.plantingPlan;
      const card = document.createElement('article'); card.className = 'plant-card recommendation-card'; card.style.setProperty('--card-delay', `${index * 60}ms`);
      const heading = document.createElement('strong'); heading.textContent = row.label;
      const scope=document.createElement('small');scope.className='recommendation-scope';scope.textContent=`Suggested coverage ${Math.round(item.coverageFraction*100)}% · 建议覆盖率（概念目标）`;
      const coverageNote=document.createElement('p');coverageNote.className='note';coverageNote.textContent=item.coverageRationale;
      const explanation = document.createElement('p'); explanation.className = 'note'; explanation.textContent = formatAssistantText(item.explanation, proposalRows, plantCatalog.plants);
      const systemPlan = createPlantingSystemSummary(item.plantingPlan);
      const locate = document.createElement('button'); locate.textContent = 'View location'; locate.addEventListener('click', async () => {
        if (loadedModel?.modelVersion !== version) return;
        try { activeLocationGuid = item.globalId; showLocationRecommendations(); await viewer.highlightRoof(item.globalId); }
        catch (error) { showStatus(error.message); }
      });
      card.append(heading, scope, coverageNote, explanation);
      if(systemPlan){systemPlan.open=true;card.append(systemPlan);}
      card.append(locate);
      if (item.plantId) {
        const plant = plantCatalog.plants.find(p => p.id === item.plantId);
        const photo = document.createElement('img'); photo.className = 'recommendation-photo'; photo.src = plant.image.src; photo.alt = plant.image.alt; photo.width = photo.height = 56; card.prepend(photo);
        const use = document.createElement('button'); use.textContent = `Choose ${plant.commonNameEn} · ${plant.commonNameZh}`;
        use.addEventListener('click', async () => {
          if (loadedModel?.modelVersion !== version || importing || applyingCombination || assistantWorking) return;
          try {
          const region = plannedRegions.find(r => r.globalId === item.globalId); activeLocationGuid = item.globalId;
          if (region && region.type !== item.type) throw new Error('This surface already has a different planting use. Adjust its existing card.');
          if (region) viewer.setRegionPlanting(region.id, { ...region.planting, plantId: item.plantId, density: 1,coverageFraction:item.coverageFraction });
          else {
            row.picked = true;
            pendingPlantings.set(`${row.type}:${item.globalId}`, normalizePlantingSelection({ ...pendingPlantings.get(`${row.type}:${item.globalId}`), plantId: item.plantId, density: 1, coverageFraction:item.coverageFraction }, row.type, plantCatalog));
          }
          plantingTargetKey = region ? regionPlantingKey(region) : `${row.type}:${item.globalId}`; showLocationRecommendations();
          if (!region) await applyPendingPlanting();
          else setPreview(selected ?? lastPlan);
          focusPlantingCard(plantingTargetKey);
          } catch (error) { showPlantingStatus(error.message); }
        }); card.append(use);
      }
      $('assistant-ai-options').append(card);
    }
    if (checked.changes.length) {
      const card = document.createElement('article'); card.className='plant-card';
      const title=document.createElement('strong'); title.textContent=`Planting changes · ${checked.changes.length} locations / 种植修改`;
      const summary=document.createElement('p');summary.className='note';summary.textContent=checked.changes.map(change=>`${proposalRows.find(row=>row.candidate.globalId===change.globalId)?.label ?? change.globalId}: ${Math.round(change.coverageFraction*100)}% · ${plantCatalog.plants.find(plant=>plant.id===change.plantId)?.commonNameEn}`).join(' · ');
      const apply=document.createElement('button');apply.textContent='Apply changes / 应用修改';
      if(changesApplied){apply.disabled=true;apply.textContent='Applied / 已应用';}
      apply.addEventListener('click',()=>{
        if(assistantWorking)return;
        try{applyChanges();apply.disabled=true;apply.textContent='Applied / 已应用';}
        catch(error){showPlantingStatus(error.message);}
      });
      card.append(title,summary,apply);$('assistant-ai-options').append(card);
    }
    if (checked.sources.length) {
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`Retrieved sources / 检索来源 (${checked.sources.length})`;details.append(summary);
      for (const source of checked.sources) {const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`${source.title}${source.page ? ' · p.' + source.page : source.locator ? ' · ' + source.locator : ''}`;const line=document.createElement('p');line.append(link);details.append(line);}
      $('assistant-ai-options').append(details);
    }
    if (autoPlant) {
      if (!checked.recommendations.length) throw new Error('AI did not return a planting proposal / AI 未返回可展示的种植方案。');
      const batch = prepareAutomaticPlanting(checked.recommendations, proposalRows, plannedRegions, plantCatalog, version, assistantProjectState);
      $('assistant-progress-label').textContent = 'Displaying plants / 正在展示植物…';
      // Viewer validates all new geometry before publishing the batch; existing planting is retained.
      if (batch.requests.length) await viewer.previewCandidateRegions(batch.requests);
      if (assistantRequest !== request || version !== loadedModel?.modelVersion || request.signal.aborted) return;
      setPreview(CURRENT_PLAN.id);
      showPlantingStatus(`已展示 ${checked.recommendations.length} 处 AI 推荐种植，可调整植物和覆盖率。`);
    }
    $('assistant-ai-options').hidden = !$('assistant-ai-options').children.length;
    showLocationRecommendations();
    recordTrace({type:'complete'});
    assistantTurns.push({question,answer,reply:checked});assistantTurns=assistantTurns.slice(-20);
    $('assistant-question').value='';$('assistant-question').placeholder='Ask a follow-up / 继续追问…';
    resizeQuestion();
    $('assistant-question-label').textContent='Continue this conversation / 继续追问';
    revealInspectorSection($('assistant-submitted'));
    void viewer.pulseRecommendations().catch(() => {});
    notifyRecommendation(autoPlant ? `${checked.recommendations.length} 处推荐植物已展示` : changesApplied ? `${checked.changes.length} locations updated / 已更新 ${checked.changes.length} 处种植设置` : checked.recommendations.length ? `${checked.recommendations.length} recommended location${checked.recommendations.length === 1 ? "" : "s"} / 推荐已生成` : 'Response ready / 回复已生成');
  } catch (error) {
    if (assistantRequest === request && version === loadedModel?.modelVersion) {
      const cancelled = request.signal.aborted;
      recordTrace({type:cancelled?'cancelled':'failed'});
      $('assistant-answer').textContent = cancelled ? 'Request cancelled. Your selections are kept. / 已取消，选区保留。' : `${error.message} Please try again; your selections are kept. / 请重试，选区保留。`;
      if (!cancelled) notifyRecommendation('Could not generate recommendations / 推荐失败，请重试', true);
    }
  } finally { if (assistantRequest === request) stopAssistantWork(); }
}

let plantShortlist = null;
const plantLibrary = createPlantLibrary({ catalog: plantCatalog, onChoose: chooseLibraryPlant, onOpen: () => { libraryPlantingTargetKey = plantingTargetKey; shell.navigate('flora'); shell.update(); } });
$('browse-plant-library').addEventListener('click', () => plantLibrary.open());
function regionPlantingKey(region) { return region.globalId ? `${region.type}:${region.globalId}` : region.id; }
function plantingTargets() {
  const targets = [
    ...plannedRegions.map(region => ({ key: regionPlantingKey(region), type: region.type, name: proposalRows.find(row => row.type === region.type && row.candidate.globalId === region.globalId)?.label ?? `${REGION_TYPES[region.type]} · ${region.name}`, guid: region.globalId, region })),
    ...proposalRows.filter(row => row.picked && !plannedRegions.some(region => region.globalId === row.candidate.globalId)).map(row => ({ key: `${row.type}:${row.candidate.globalId}`, type: row.type, name: row.label ?? row.candidate.name, guid: row.candidate.globalId, row }))
  ];
  return locationOrder.sort(targets);
}
function currentPlantingTarget() { return plantingTargets().find(target => target.key === plantingTargetKey); }
function targetPlanting(target) {
  const choice = normalizePlantingSelection(target.region?.planting ?? pendingPlantings.get(target.key) ?? {}, target.type, plantCatalog);
  return { ...choice, coverageFraction: choice.coverageFraction ?? DEFAULT_PLANTING_COVERAGE };
}
function focusPlantingCard(key) {
  plantingTargetKey = key;
  activeLocationGuid = currentPlantingTarget()?.guid ?? null;
  const card = plantingCards.get(key)?.card;
  if (card) revealInspectorSection(card);
}
function createPlantingSystemSummary(plan) {
  if (!plan) return null;
  const details = document.createElement('details'); details.className = 'location-card-details planting-system-details';
  const title = document.createElement('summary'); title.textContent = 'Proposed planting system / 建议种植配置'; details.append(title);
  const list = document.createElement('dl');
  for (const [label, field] of [['Planting method / 种植方式','plantingMethod'],['Substrate / 基质与深度','substrate'],['Planter & support / 种植槽与支撑','planter'],['Irrigation / 灌溉','irrigation']]) {
    const term=document.createElement('dt'),value=document.createElement('dd');term.textContent=label;value.textContent=plan[field];list.append(term,value);
  }
  details.append(list);
  if(plan.checks.length){const checks=document.createElement('ul');for(const check of plan.checks){const item=document.createElement('li');item.textContent=check;checks.append(item);}details.append(checks);}
  return details;
}
function createPlantingCard(target) {
  const card = document.createElement('article'); card.className = 'planting-location-card';
  // The opaque IFC identity stays in data, while the visible title uses the friendly location label.
  card.dataset.locationKey = target.key; card.setAttribute('aria-label', target.name);
  const title = document.createElement('h4'), state = document.createElement('span'); state.className = 'location-state';
  const heading = document.createElement('div'); heading.className = 'location-card-heading'; heading.append(title, state);
  const area = document.createElement('p'); area.className = 'location-card-area';
  const actions = document.createElement('div'); actions.className = 'location-card-actions';
  const locate = document.createElement('button'); locate.type = 'button'; locate.textContent = 'Locate on model';
  locate.addEventListener('click', async () => {
    const latest = plantingTargets().find(item => item.key === target.key); if (!latest) return;
    plantingTargetKey = latest.key; activeLocationGuid = latest.guid;
    try { if (latest.guid) await viewer.highlightRoof(latest.guid); refreshLocationPlanting(); }
    catch (error) { showPlantingStatus(error.message); }
  });
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${target.name}`);
  remove.addEventListener('click', () => {
    const latest = plantingTargets().find(item => item.key === target.key); if (!latest) return;
    removePlantingLocation(latest.key);
  }); actions.append(locate, remove);
  const plantLabel = document.createElement('label'); plantLabel.textContent = 'Plant species / 品种';
  const species = document.createElement('select'); species.setAttribute('aria-label', `Plant species for ${target.name}`);
  for (const plant of plantCatalog.plants.filter(plant => plant.applicationRegions.includes(target.type))) {
    const option = document.createElement('option'); option.value = plant.id; option.textContent = `${plant.commonNameEn} · ${plant.commonNameZh}`; species.append(option);
  }
  plantLabel.append(species);
  const photo = document.createElement('img'); photo.width = photo.height = 54;
  const info = document.createElement('p'); info.className = 'note';
  const browse = document.createElement('button'); browse.type = 'button'; browse.textContent = 'Library'; browse.setAttribute('aria-label', `Browse plants for ${target.name}`);
  browse.addEventListener('click', () => { plantingTargetKey = target.key; activeLocationGuid = target.guid; plantLibrary.open(species.value); });
  const plantInfo = document.createElement('div'); plantInfo.className = 'location-plant-info'; plantInfo.append(info, browse);
  const plantFields = document.createElement('div'); plantFields.className = 'location-plant-fields'; plantFields.append(plantLabel, plantInfo);
  const plantSummary = document.createElement('div'); plantSummary.className = 'location-plant-row'; plantSummary.append(photo, plantFields);
  const coverageLabel = document.createElement('label'); coverageLabel.textContent = 'Coverage / 覆盖率';
  const coverageValue = document.createElement('output'), coverage = document.createElement('input');
  coverage.type = 'range'; coverage.min = '0'; coverage.max = '100'; coverage.step = '1'; coverage.className = 'planting-coverage'; coverage.setAttribute('aria-label', `Coverage for ${target.name}`);
  const slider = document.createElement('span'); slider.className = 'coverage-slider';
  const track = document.createElement('span'); track.className = 'coverage-track'; track.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span'); fill.className = 'coverage-fill'; track.append(fill);
  const thumb = document.createElement('span'); thumb.className = 'coverage-thumb'; thumb.setAttribute('aria-hidden', 'true');
  const tooltip = document.createElement('span'); tooltip.className = 'coverage-tooltip'; tooltip.setAttribute('aria-hidden', 'true');
  slider.append(track, thumb, tooltip, coverage);
  coverageLabel.append(coverageValue, slider);
  coverage.addEventListener('pointermove', event => {
    if (coverage.disabled || event.buttons) return;
    const rect = coverage.getBoundingClientRect();
    const preview = Math.max(0, Math.min(100, Math.round((event.clientX - rect.left - 9) / Math.max(1, rect.width - 18) * 100)));
    slider.style.setProperty('--tooltip-position', `${preview}%`); tooltip.textContent = `${preview}%`;
  });
  const restoreTooltip = () => { slider.style.setProperty('--tooltip-position', `${coverage.value}%`); tooltip.textContent = `${coverage.value}%`; };
  coverage.addEventListener('pointerleave', restoreTooltip);
  coverage.addEventListener('focus', restoreTooltip);
  const coveredArea = document.createElement('p'); coveredArea.className = 'planting-covered-area';
  for (const control of [species, coverage]) control.addEventListener('input', () => {
    try { saveLocationPlanting(species.value, target.key, Number(coverage.value) / 100); }
    catch (error) { showPlantingStatus(error.message); }
  });
  const details = document.createElement('details'); details.className = 'location-card-details';
  const detailsTitle = document.createElement('summary'); detailsTitle.textContent = 'Surface details & usable area';
  const sourceInfo = document.createElement('p'); sourceInfo.className = 'note';
  const areaLabel = document.createElement('label'); areaLabel.textContent = 'Usable area (m²)';
  const areaInput = document.createElement('input'); areaInput.type = 'number'; areaInput.min = '.01'; areaInput.step = '.01'; areaInput.setAttribute('aria-label', `Usable area for ${target.name}`);
  const areaError = document.createElement('p'); areaError.className = 'candidate-area-error'; areaError.setAttribute('role', 'alert'); areaError.hidden = true;
  areaInput.addEventListener('input', () => {
    const latest = plantingTargets().find(item => item.key === target.key);
    if (latest?.row) { latest.row.area.value = areaInput.value; updateCombinationControls(); }
  });
  areaLabel.append(areaInput); details.append(detailsTitle, sourceInfo, areaLabel, areaError);
  const meta = document.createElement('div'); meta.className = 'location-card-meta'; meta.append(area, actions);
  const systemPlan = document.createElement('div');
  card.append(heading, meta, plantSummary, coverageLabel, coveredArea, systemPlan, details);
  return { card, title, state, area, locate, remove, systemPlan, species, photo, info, browse, coverage, slider, tooltip, coverageValue, coveredArea, areaLabel, areaInput, areaError, sourceInfo };
}
function refreshLocationPlanting() {
  const targets = plantingTargets(), keys = new Set(targets.map(target => target.key));
  if (!keys.has(plantingTargetKey)) plantingTargetKey = targets.find(target => target.guid && target.guid === activeLocationGuid)?.key ?? targets[0]?.key ?? null;
  const container = $('planting-location-cards');
  for (const [key, controls] of plantingCards) if (!keys.has(key)) { controls.card.remove(); plantingCards.delete(key); }
  $('region-count').textContent = String(targets.length);
  $('location-empty').hidden = Boolean(targets.length);
  const busy = importing || applyingCombination || analysing || assistantWorking;
  for (const [index, target] of targets.entries()) {
    let controls = plantingCards.get(target.key);
    if (!controls) { controls = createPlantingCard(target); plantingCards.set(target.key, controls); }
    // Keep inputs mounted during drag and typing; do not steal focus or interrupt a slider gesture.
    if (container.children[index] !== controls.card) container.insertBefore(controls.card, container.children[index] ?? null);
    const planting = targetPlanting(target), plant = plantCatalog.plants.find(plant => plant.id === planting.plantId);
    const area = target.region?.usableArea.value ?? Number(target.row.area.value);
    controls.title.textContent = target.name;
    controls.state.textContent = target.region ? 'Planted' : 'Adding plants…';
    controls.card.classList.toggle('is-focused', Boolean(target.guid) && target.guid === activeLocationGuid);
    controls.area.textContent = `${Number.isFinite(area) ? area.toFixed(1) : '—'} m² usable surface`;
    controls.species.value = planting.plantId;
    const proposal = proposalRows.find(row => row.candidate.globalId === target.guid && row.type === target.type && row.recommendedPlantId === planting.plantId)?.recommendedPlantingPlan;
    const signature = JSON.stringify(proposal ?? null);
    if(controls.systemPlan.dataset.signature!==signature){controls.systemPlan.dataset.signature=signature;controls.systemPlan.replaceChildren();const summary=createPlantingSystemSummary(proposal);if(summary)controls.systemPlan.append(summary);}
    controls.photo.src = plant.image.src; controls.photo.alt = plant.image.alt;
    controls.info.textContent = `${plant.referenceSoilDepthMm.min}–${plant.referenceSoilDepthMm.max} mm guide soil · ${plant.irrigationDemand} water`;
    controls.coverage.value = planting.coverageFraction * 100;
    controls.coverageValue.textContent = `${Math.round(Number(controls.coverage.value))}%`;
    controls.slider.style.setProperty('--coverage-fraction', String(Number(controls.coverage.value) / 100));
    controls.slider.style.setProperty('--tooltip-position', `${controls.coverage.value}%`);
    controls.tooltip.textContent = `${controls.coverage.value}%`;
    controls.coveredArea.textContent = `${Number.isFinite(area) ? (area * Number(controls.coverage.value) / 100).toFixed(1) : '—'} m² planting · ${Number.isFinite(area) ? (area * (1 - Number(controls.coverage.value) / 100)).toFixed(1) : '—'} m² uncovered`;
    controls.coverage.setAttribute('aria-valuetext', `${controls.coverage.value}%${Number.isFinite(area) ? `, ${(area * Number(controls.coverage.value) / 100).toFixed(1)} square metres planted` : ''}`);
    controls.locate.disabled = busy || !target.guid;
    for (const control of [controls.remove, controls.species, controls.coverage, controls.browse]) control.disabled = busy;
    controls.areaLabel.hidden = !target.row;
    if (target.row) {
      if (document.activeElement !== controls.areaInput) controls.areaInput.value = target.row.area.value;
      controls.areaInput.max = String(target.row.candidate.geometryAreaM2); controls.areaInput.disabled = busy;
      const invalid = !Number.isFinite(area) || area <= 0 || area > target.row.candidate.geometryAreaM2 * 1.001;
      controls.areaInput.setAttribute('aria-invalid', String(invalid)); controls.areaError.hidden = !invalid;
      controls.areaError.textContent = invalid ? `Enter a positive area within ${target.row.candidate.geometryAreaM2.toFixed(2)} m².` : '';
      controls.sourceInfo.textContent = [...target.row.candidate.screening.reasons, ...target.row.candidate.screening.missing].join(' ');
    } else { controls.areaError.hidden = true; controls.sourceInfo.textContent = 'Concept preview surface. Use the custom surface editor to change its extent. Engineering suitability remains conditional.'; }
  }
}
function showPlantingStatus(message) { $('planting-setting-status').hidden = !message; $('planting-setting-status').textContent = message; }
function saveLocationPlanting(plantId, key = plantingTargetKey, coverageFraction) {
  const target = plantingTargets().find(target => target.key === key);
  if (importing || analysing || applyingCombination || assistantWorking) throw new Error('Wait for building review to finish before changing planting.');
  if (!target) throw new Error('Select a location on the building first. / 请先在建筑上选一个位置。');
  const existing = targetPlanting(target);
  const planting = normalizePlantingSelection({ plantId, density: 1, coverageFraction: coverageFraction ?? existing.coverageFraction }, target.type, plantCatalog);
  plantingTargetKey = key;
  if (target.region) viewer.setRegionPlanting(target.region.id, planting);
  else { pendingPlantings.set(target.key, planting); refreshLocationPlanting(); }
  showPlantingStatus(target.region ? `${target.name}: current planting and before/after comparison updated.` : `${target.name}: planting settings updated.`);
  render();
}
function chooseLibraryPlant(plantId) {
  if (!libraryPlantingTargetKey) throw new Error('Choose a location before using a plant from the library. / 请先选择位置。');
  saveLocationPlanting(plantId, libraryPlantingTargetKey);
  openPanel('inspector-panel'); focusPlantingCard(plantingTargetKey);
}
function plantConditions() {
  return { region: $('plant-region').value, soilDepthMm: $('plant-depth').value, light: $('plant-light').value, irrigation: $('plant-water').value, month: $('plant-month').value, facadeSystem: $('plant-facade').value };
}
function invalidatePlantShortlist() {
  plantShortlist = null;
  $('plant-results').replaceChildren();
  $('plant-exclusion-list').replaceChildren();
  $('plant-exclusions').hidden = true;
  $('export-plant-shortlist').hidden = true;
  $('plant-facade-field').hidden = $('plant-region').value !== 'facade';
  $('plant-answer').textContent = 'Conditions changed. Choose Find plants in library to refresh the shortlist.';
}
const conditionFields={soilDepthMm:'plant-depth',light:'plant-light',irrigation:'plant-water',month:'plant-month',facadeSystem:'plant-facade'};
function syncConditionScope() {
  const scope=activeLocationGuid ?? selectedComponent?.globalId ?? null;
  if(scope===assistantConditionScope)return;
  assistantConditionScope=scope;
  const values=assistantFormByLocation.get(scope) ?? {};
  for(const [field,id] of Object.entries(conditionFields))$(id).value=String(values[field] ?? (['soilDepthMm','month'].includes(field)?'':'unknown'));
  const row=proposalRows.find(row=>row.candidate.globalId===scope);
  if(row)$('plant-region').value=row.type;
  $('plant-condition-scope').textContent=row?`Conditions for ${row.label} / 此位置的现场条件`:'Focus a location to save site conditions / 请先查看一个位置，再填写现场条件';
  invalidatePlantShortlist();
}
for (const id of ['plant-region','plant-depth','plant-light','plant-water','plant-month','plant-facade']) $(id).addEventListener('input',()=>{
  invalidatePlantShortlist();
  const scope=activeLocationGuid ?? selectedComponent?.globalId ?? null;
  if(!scope)return;
  assistantFormByLocation.set(scope,plantConditions());
  const field=Object.entries(conditionFields).find(([,element])=>element===id)?.[0];
  assistantProjectState=assistantProjectState.filter(record=>!(record.kind==='fact'&&record.scope===scope&&record.field===field));
  recommendedGuids.clear();$('assistant-ai-options').replaceChildren();renderProjectContext();showLocationRecommendations();
});

function showPlantRecommendations(question = '') {
  assistantMode = 'plant';
  $('plant-recommendations').open = true;
  invalidatePlantShortlist();
  try {
    const overrides = plantQuestion(question);
    const fields = { region: 'plant-region', soilDepthMm: 'plant-depth', light: 'plant-light', irrigation: 'plant-water', month: 'plant-month' };
    const result = recommendPlants(plantCatalog, { ...plantConditions(), ...overrides });
    for (const [key, value] of Object.entries(overrides)) $(fields[key]).value = String(value);
    $('plant-facade-field').hidden = result.conditions.region !== 'facade';
    const roofReport=viewer?.getRegionScreeningReport('roof');
    if(result.conditions.region==='roof'&&loadedModel&&roofReport?.modelVersion===loadedModel.modelVersion&&!roofReport.eligible&&roofReport.rejected.length){
      const message='本模型暂无通过筛选的屋顶位置。先选择合适的立面或其他位置，再筛选植物；植物库仍可浏览。 / No screened roof location in this model. Choose another screened location before selecting plants.';
      $('plant-answer').textContent=message;$('export-plant-shortlist').hidden=true;
      revealInspectorSection($('plant-recommendations'));return;
    }
    plantShortlist = buildPlantRecommendationContext(plantCatalog, result, loadedModel?.modelVersion ?? null);
    const chinese = /[\u3400-\u9fff]/.test(question);
    const summary = chinese ? `植物库筛选：${result.candidates.length} 种候选，均待现场核实。先看位置、土层和供水，月份只影响观赏排序。` : `${result.candidates.length} conditional matches. Location, soil and water are screened first; month only changes display-interest ranking.`;
    $('plant-answer').textContent = summary;
    for (const candidate of result.candidates.slice(0, 3)) {
      const plant = plantCatalog.plants.find(plant => plant.id === candidate.plantId);
      const card = document.createElement('article'); card.className = 'plant-card';
      const name = document.createElement('h3'); name.textContent = `${plant.commonNameEn} · ${plant.commonNameZh}`;
      const latin = document.createElement('p'); latin.className = 'plant-latin'; latin.textContent = plant.scientificName;
      const meta = document.createElement('p'); meta.className = 'note'; meta.textContent = `${plant.referenceSoilDepthMm.min}–${plant.referenceSoilDepthMm.max} mm guide depth · ${plant.irrigationDemand} irrigation · ${plant.evergreen ? 'evergreen' : 'deciduous'}`;
      const description = document.createElement('p'); description.className = 'note'; description.textContent = plant.description;
      const reasons = document.createElement('ul');
      for (const reason of candidate.reasons) { const item = document.createElement('li'); item.textContent = reason; reasons.append(item); }
      const checks = document.createElement('details'), label = document.createElement('summary'), checkList = document.createElement('ul');
      label.textContent = 'Conditions to confirm';
      for (const check of candidate.checks) { const item = document.createElement('li'); item.textContent = check; checkList.append(item); }
      checks.append(label, checkList);
      const source = document.createElement('a'); source.href = plant.sources[0].url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Hong Kong official plant guide ↗';
      const photo = document.createElement('img'); photo.src = plant.image.src; photo.alt = plant.image.alt; photo.loading = 'lazy'; photo.className = 'plant-suggestion-photo';
      const detailButton = document.createElement('button'); detailButton.type = 'button'; detailButton.textContent = 'View plant details ↗'; detailButton.addEventListener('click', () => plantLibrary.open(plant.id));
      const useButton = document.createElement('button'); useButton.type = 'button'; useButton.textContent = 'Use at selected location'; useButton.addEventListener('click', () => { try { saveLocationPlanting(plant.id); focusPlantingCard(plantingTargetKey); } catch(error) { $('plant-answer').textContent = error.message; } });
      card.append(photo, name, latin, meta, description, reasons, checks, source, detailButton, useButton); $('plant-results').append(card);
    }
    if (result.candidates.length > 3) { const note = document.createElement('p'); note.className = 'note'; note.textContent = `Showing 3 of ${result.candidates.length}. The download includes every eligible candidate.`; $('plant-results').append(note); }
    if (!result.candidates.length) $('plant-answer').textContent = chinese ? '当前条件没有匹配植物。请查看排除原因，调整方案或咨询园艺专家。' : 'No plants match these conditions. Review exclusions, revise the design or consult a planting specialist.';
    for (const excluded of result.excluded) {
      const plant = plantCatalog.plants.find(plant => plant.id === excluded.plantId);
      const item = document.createElement('li'); item.textContent = `${plant.commonNameEn}: ${excluded.reasons.join(' ')}`; $('plant-exclusion-list').append(item);
    }
    $('plant-exclusions').hidden = !result.excluded.length;
    $('export-plant-shortlist').hidden = !result.candidates.length;
  } catch (error) {
    $('plant-answer').textContent = error.message;
  }
  revealInspectorSection($('plant-recommendations'));
}
$('recommend-plants').addEventListener('click', () => showPlantRecommendations());
$('export-plant-shortlist').addEventListener('click', () => {
  if (plantShortlist) downloadReport(JSON.stringify(plantShortlist, null, 2), 'application/json', 'plant-shortlist.json');
});
function revealInspectorSection(section) {
  const body = document.querySelector('#inspector-panel .panel-body');
  const bounds = body.getBoundingClientRect(), target = section.getBoundingClientRect();
  const delta = target.top < bounds.top ? target.top - bounds.top : target.bottom > bounds.bottom ? Math.min(target.top - bounds.top, target.bottom - bounds.bottom) : 0;
  if (delta) body.scrollTop += delta;
}
function removePlantingLocation(key) {
  if (importing || analysing || assistantWorking || applyingCombination) return false;
  const target = plantingTargets().find(item => item.key === key);
  if (!target) return false;
  // Remove membership in both stages, so a preview cannot resurrect a cancelled selection.
  for (const row of proposalRows) if (target.guid && row.candidate.globalId === target.guid) {
    row.picked = false;
    pendingPlantings.delete(`${row.type}:${row.candidate.globalId}`);
  }
  pendingPlantings.delete(target.key);
  locationOrder.remove(target.key);
  if (libraryPlantingTargetKey === key) libraryPlantingTargetKey = null;
  if (plantingTargetKey === key) plantingTargetKey = null;
  if (activeLocationGuid === target.guid) activeLocationGuid = null;
  invalidateRegionDraft();
  showPlantingStatus(''); $('combination-status').textContent = '';
  if (target.region) viewer.removeRegion(target.region.id);
  updateCombinationControls(); render();
  if (target.guid && selectedComponent?.globalId === target.guid) void viewer.clearSelection().catch(error => showStatus(error.message));
  showStatus(`Removed ${target.name}. ${plantingTargets().length} locations remain selected.`);
  return true;
}
function showLocationRecommendations() {
  // Selection/recommendation highlights coexist with the current planting preview.
  lastHighlightKey = null;
  render();
  updateCombinationControls();
}
function updateCombinationControls() {
  refreshInspectionSelection();
  const busy = importing || analysing || assistantWorking || applyingCombination || !loadedModel;
  let activeRow = null;
  for (const row of proposalRows) {
    const assigned = plannedRegions.find(region => region.globalId === row.candidate.globalId);
    if (assigned) row.picked = false;
    row.disabled = Boolean(busy || assigned) || !isSurfacePreviewable({type:row.type,previewable:row.candidate.screening.canPrepare,groundAssessment:row.candidate.screening.groundAssessment},assistantProjectState,row.candidate.globalId) || row.candidate.modelVersion !== loadedModel?.modelVersion;
    row.row.hidden = row.candidate.globalId !== activeLocationGuid;
    if (!row.row.hidden && (!activeRow || row.picked || (!activeRow.picked && row.type === 'terrace'))) activeRow = row;
    row.section.hidden = true;
    row.remove.disabled = row.disabled;
    row.remove.textContent = assigned ? 'Added to plan / 已加入方案' : row.picked ? 'Adding…' : 'Add to plan / 添加到方案';
    row.area.disabled = row.disabled || !row.picked;
    row.edit.hidden = assigned || !row.picked;
    const invalid = row.picked && (!Number.isFinite(Number(row.area.value)) || Number(row.area.value) <= 0 || Number(row.area.value) > row.candidate.geometryAreaM2 * 1.001);
    const displayArea = assigned ? assigned.usableArea.value : row.picked ? Number(row.area.value) : row.candidate.geometryAreaM2;
    row.areaReadout.textContent = `${Number.isFinite(displayArea) ? displayArea.toFixed(1) : '—'} m² · ${assigned ? 'in current planting' : row.picked ? 'selected area' : 'display estimate'}`;
    row.area.setAttribute('aria-invalid', String(invalid)); row.areaError.hidden = !invalid;
    if (invalid) row.edit.open = true;
    row.areaError.textContent = invalid ? `Enter a positive area within ${row.candidate.geometryAreaM2.toFixed(2)} m².` : '';
    row.locate.disabled = busy;
  }
  if (activeRow) {
    for (const row of proposalRows) if (row.candidate.globalId === activeLocationGuid) row.row.hidden = row !== activeRow;
    activeRow.section.hidden = false;
  }
  refreshLocationPlanting();
  syncConditionScope();
  $('location-empty').hidden = Boolean(plantingTargets().length);
  $('location-empty').textContent = selectedComponent && !proposalRows.some(row => row.candidate.globalId === selectedComponent.globalId) ? `${selectedComponent.name} is not a planting candidate. Choose another wall or suitable roof.` : 'No planting added. Click a building location to inspect it, then choose Add to plan.';
  const chosen = proposalRows.filter(row => row.picked);
  const total = chosen.reduce((sum, row) => sum + Number(row.area.value), 0) + plannedRegions.reduce((sum, region) => sum + region.usableArea.value, 0);
  const inspectedCount=inspectionSelection.items().length;
  $('combination-summary').textContent = chosen.length || plannedRegions.length ? `${chosen.length + plannedRegions.length} planting locations · ${Number.isFinite(total) ? total.toFixed(1) : '—'} m² · ${inspectedCount} selected` : inspectedCount ? `${inspectedCount} components selected · No planting added` : 'No locations selected';
  $('add-combination').disabled = busy;
  $('select-suggested').hidden = !recommendedGuids.size;
  $('select-suggested').disabled = busy || !proposalRows.some(row => !row.disabled && recommendedGuids.get(row.candidate.globalId) === row.type);
  $('add-ground').disabled = busy;
  $('review-selected').disabled = busy || (!chosen.length && !plannedRegions.length && !inspectedCount);
  $('clear-candidates').disabled = busy || (!chosen.length && !plannedRegions.length); $('clear-candidates').hidden = !chosen.length && !plannedRegions.length;
  $('add-combination').textContent = applyingCombination ? 'Adding plants…' : 'Finished';
  $('combination-status').hidden = !$('combination-status').textContent;
  $('proposal-legend').hidden = recommendationVersion !== loadedModel?.modelVersion || !proposalRows.some(row => row.picked || (recommendedGuids.get(row.candidate.globalId) === row.type && !plannedRegions.some(region => region.globalId === row.candidate.globalId)));

  const recommended = proposalRows.filter(row => recommendedGuids.get(row.candidate.globalId) === row.type && !plannedRegions.some(region => region.globalId === row.candidate.globalId));
  $('proposal-count').textContent = `${chosen.length} adding · ${plannedRegions.length} planted · ${new Set(recommended.map(row => row.candidate.globalId)).size} recommended`;
  const ids = { recommended: [...new Set(recommended.map(row => row.candidate.localId))], picked: chosen.map(row => row.candidate.localId), types: Object.fromEntries([...recommended, ...chosen].map(row => [row.candidate.localId, row.type])), version: loadedModel?.modelVersion };
  const key = JSON.stringify({ ...ids, previewed: plannedRegions.map(region => region.localId) });
  if (viewer && key !== lastHighlightKey) { lastHighlightKey = key; void viewer.setProposalHighlights(ids).catch(error => { lastHighlightKey = null; showStatus(`Could not highlight locations: ${error.message}`); }); }
}
function refreshInspectionSelection() {
  const selections=inspectionSelection.items();
  $('inspection-count').textContent=String(selections.length);
  $('inspection-selections').hidden=!selections.length;
  const list=$('inspection-selection-cards');list.replaceChildren();
  for(const selection of selections){
    const card=document.createElement('article');card.className='planting-location-card';
    const row=proposalRows.find(row=>row.candidate.globalId===selection.globalId);
    const title=document.createElement('strong');title.textContent=row?.label ?? selection.name;
    const info=document.createElement('p');info.className='note';info.textContent=row?.type==='ground'&&row.candidate.screening.groundAssessment?.classification==='review'?'Ground use needs confirmation / 请在聊天中确认这块地面可用于种植，还是需保留通行':selection.category;
    const actions=document.createElement('div');actions.className='location-card-actions';
    const add=document.createElement('button');add.type='button';
    const planted=plannedRegions.some(region=>region.globalId===selection.globalId);
    add.textContent=planted?'Added to plan / 已加入方案':'Add to plan / 添加到方案';
    add.disabled=planted||!row||!isSurfacePreviewable({type:row?.type,previewable:row?.candidate.screening.canPrepare,groundAssessment:row?.candidate.screening.groundAssessment},assistantProjectState,selection.globalId)||importing||analysing||assistantWorking||applyingCombination;
    add.addEventListener('click',()=>{void addModelLocation(selection).catch(error=>showPlantingStatus(error.message));});
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Deselect / 取消选中';
    cancel.addEventListener('click',()=>{inspectionSelection.remove(selection.globalId);refreshInspectionSelection();showSelection(inspectionSelection.items()[0]??null);updateCombinationControls();});
    actions.append(add,cancel);card.append(title,info,actions);list.append(card);
  }
  const highlightKey=JSON.stringify([loadedModel?.modelVersion,selections.map(item=>item.localId)]);
  if(viewer && inspectionHighlightKey!==highlightKey){inspectionHighlightKey=highlightKey;void viewer.setInspectionHighlights(selections).catch(error=>{inspectionHighlightKey=null;showStatus(error.message);});}
}
function inspectModelLocation(selection) {
  if (importing || selection.modelVersion !== loadedModel?.modelVersion) return;
  const added=inspectionSelection.toggle(selection,loadedModel.modelVersion);
  const focus=added?selection:inspectionSelection.items()[0]??null;
  showSelection(focus);
  const existing = focus && plantingTargets().find(target => target.guid === focus.globalId);
  if (existing) plantingTargetKey = existing.key;
  updateCombinationControls();
  openPanel('inspector-panel', { focus: false });
}
async function addModelLocation(selection) {
  if (importing || analysing || assistantWorking || applyingCombination || selection.modelVersion !== recommendationVersion) return;
  const existing = plantingTargets().find(target => target.guid === selection.globalId);
  if (existing) { focusPlantingCard(existing.key); return; }
  const matches = proposalRows.filter(row => row.candidate.globalId === selection.globalId);
  const row = matches.find(item => item.picked) ?? matches.find(item=>recommendedGuids.get(selection.globalId)===item.type) ?? matches.find(item => item.type === 'terrace') ?? matches[0];
  if (row && !isSurfacePreviewable({type:row.type,previewable:row.candidate.screening.canPrepare,groundAssessment:row.candidate.screening.groundAssessment},assistantProjectState,selection.globalId)){showStatus('Confirm the use of this ground location in chat before planting / 请先在聊天中确认地面用途');return;}
  if (!row) { showStatus(`${selection.name}: not a screened planting candidate. Inspect source details for manual review; windows, ordinary floors and incompatible faces are not added.`); return; }
  activeLocationGuid = selection.globalId;
  plantingTargetKey = `${row.type}:${selection.globalId}`;
  row.picked = true;
  if (!pendingPlantings.has(plantingTargetKey)) {
    const recommendation= recommendedGuids.get(selection.globalId)===row.type;
    pendingPlantings.set(plantingTargetKey,recommendation?normalizePlantingSelection({plantId:row.recommendedPlantId ?? undefined,density:1,coverageFraction:row.recommendedCoverageFraction ?? DEFAULT_PLANTING_COVERAGE},row.type,plantCatalog):targetPlanting({key:plantingTargetKey,type:row.type}));
  }
    $('combination-status').textContent = '';
  updateCombinationControls();
  await applyPendingPlanting();
}
$('select-suggested').addEventListener('click', async () => {
  for (const row of proposalRows) if (!row.disabled && recommendedGuids.get(row.candidate.globalId) === row.type) {
    for (const other of proposalRows) if (other.candidate.globalId === row.candidate.globalId) other.picked = false;
    row.picked = true;
    const key = `${row.type}:${row.candidate.globalId}`;
    if (!pendingPlantings.has(key)) pendingPlantings.set(key, normalizePlantingSelection({ plantId: row.recommendedPlantId ?? undefined, density: 1, coverageFraction: row.recommendedCoverageFraction ?? DEFAULT_PLANTING_COVERAGE }, row.type, plantCatalog));
  }
  activeLocationGuid ??= proposalRows.find(row => row.picked)?.candidate.globalId ?? null;
  render();
    $('combination-status').textContent = '';
  updateCombinationControls();
  await applyPendingPlanting();
});
$('clear-candidates').addEventListener('click', () => {
  if ($('clear-candidates').disabled) return;
  for (const target of plantingTargets()) removePlantingLocation(target.key);
  void viewer.clearSelection().catch(error => showStatus(error.message));
  showStatus('All planting locations cleared. Click the building to choose new locations.');
});
async function applyPendingPlanting() {
  const chosen = proposalRows.filter(row => row.picked);
  if (!chosen.length || applyingCombination || importing) return;
  plantingTargetKey = plantingTargets().find(target => target.row)?.key ?? plantingTargetKey;
  const epoch = ++combinationEpoch;
  const requests = chosen.map(row => ({ type: row.type, localId: row.candidate.localId, globalId: row.candidate.globalId, modelVersion: row.candidate.modelVersion, area: Number(row.area.value), groundUse:assistantProjectState.findLast(record=>record.kind==='fact'&&record.scope===row.candidate.globalId&&record.field==='groundUse')?.value, planting: normalizePlantingSelection({ ...pendingPlantings.get(`${row.type}:${row.candidate.globalId}`), density: 1, coverageFraction: pendingPlantings.get(`${row.type}:${row.candidate.globalId}`)?.coverageFraction ?? DEFAULT_PLANTING_COVERAGE }, row.type, plantCatalog) }));
  applyingCombination = true; invalidateRegionDraft(); refreshImportControls();
  $('combination-status').textContent = `Adding plants to ${requests.length} location${requests.length === 1 ? '' : 's'}…`;
  try {
    await viewer.previewCandidateRegions(requests);
    if (epoch !== combinationEpoch) return;
    selected = lastPlan; viewer.setPlan(CURRENT_PLAN, true); render();
    $('combination-status').textContent = '';
    showPlantingStatus('Plants added. Adjust each location here, or choose Finished.');
    showStatus(`${plannedRegions.length} planted locations. Earlier planting is kept.`);
  } catch (error) {
    if (epoch === combinationEpoch) {
      // Failed additions never appear as planted and never remove earlier locations.
      for (const row of chosen) { row.picked = false; pendingPlantings.delete(`${row.type}:${row.candidate.globalId}`); locationOrder.remove(`${row.type}:${row.candidate.globalId}`); }
      $('combination-status').textContent = `Could not add plants: ${error.message}`;
      showStatus(`Could not add plants: ${error.message}`);
    }
  } finally { if (epoch === combinationEpoch) { applyingCombination = false; refreshImportControls(); if ($('inspector-panel').open && plantingTargetKey) focusPlantingCard(plantingTargetKey); } }
}
$('add-combination').addEventListener('click', () => {
  if (!$('add-combination').disabled) closePanel($('inspector-panel'));
});

$('review-selected').addEventListener('click', () => revealInspectorSection($(inspectionSelection.items().length ? 'inspection-selections' : 'location-planting')));
$('assistant-question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('assistant-ask').click(); } });
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null;
let voiceTimer = null;
function resetVoiceButton() { clearInterval(voiceTimer); voiceTimer = null; $('voice-wave').hidden = true; $('voice-record').setAttribute('aria-label', 'Start voice input'); $('voice-record').title = 'Start voice input'; $('voice-record').setAttribute('aria-pressed', 'false'); }
function stopVoice() { const current = recognition; recognition = null; resetVoiceButton(); current?.abort(); }
$('voice-record').disabled = !Recognition;
if (!Recognition) { $('voice-status').hidden = false; $('voice-status').textContent = 'Voice recognition unavailable. Type your question instead.'; }
$('voice-record').addEventListener('click', () => {
  if (recognition) { recognition.stop(); return; }
  const current = new Recognition(); recognition = current;
  current.lang = $('voice-language').value; current.continuous = false; current.interimResults = false;
  $('voice-status').hidden = false;
  $('voice-record').setAttribute('aria-label', 'Stop voice input'); $('voice-record').title = 'Stop voice input'; $('voice-record').setAttribute('aria-pressed', 'true');
  $('voice-status').textContent = 'Waiting for microphone access…';
  current.onstart = () => {
    if (recognition !== current) return;
    const started = performance.now();
    $('voice-wave').hidden = false; $('voice-elapsed').textContent = '0:00';
    $('voice-status').textContent = 'Your browser may send audio to its speech service.';
    clearInterval(voiceTimer);
    voiceTimer = setInterval(() => { const seconds = Math.floor((performance.now() - started) / 1000); $('voice-elapsed').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }, 250);
  };
  current.onresult = event => { if (recognition !== current) return; $('assistant-question').value = event.results[0][0].transcript; resizeQuestion(); $('voice-status').textContent = 'Review the transcript, then choose Send. / 确认文字后发送。'; };
  current.onerror = event => { if (recognition !== current) return; resetVoiceButton(); $('voice-status').textContent = `Voice input: ${event.error}. You can type your question instead.`; };
  current.onend = () => { if (recognition === current) { recognition = null; resetVoiceButton(); } };
  try { current.start(); } catch (error) { recognition = null; resetVoiceButton(); $('voice-status').textContent = error.message; }
});
$('inspector-panel').addEventListener('close', stopVoice);

const samples = {
  'duplex-apartment': { name: 'Duplex-Apartment.ifc', format: 'ifc', preview: 'Duplex-Apartment-preview.png', source: 'https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20%28IFC%202x3%29/Duplex%20Apartment', description: 'Two-storey duplex architectural test model. Flat roof and brick/block exterior walls; 2.4 MB. buildingSMART · CC BY 4.0. IFC screening identifies conditional planting surfaces, not engineering approval.' },
  'klassiqua-office-2026': { name: 'Klassiqua-Office-2026.ifc', format: 'ifc', preview: 'Klassiqua-Office-2026-preview.png', title: 'Klassiqua office 2026', subtitle: 'Four-storey IFC 4.3 · 1.4 MB', source: 'https://github.com/BIMvoice/ifcsamples/tree/main/IFC4x3/Klassiqua-Office-Archetypes', description: 'Four-storey German office archetype with 88 walls and 167 windows. Final IFC 4.3 schema; CC BY 4.0. Roof-like top elements may be slabs or coverings, so planting screening must use geometry and properties rather than class name alone.' },
  'kit-office': { name: 'KIT-Office.ifc', format: 'ifc', preview: 'KIT-Office-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'Architectural office design example from KIT: exterior walls, windows and roof geometry. Fictional design, not a verified built project. 10.9 MB.' },
  'schependomlaan': { name: 'Schependomlaan.ifc', format: 'ifc', preview: 'Schependomlaan-preview.png', source: 'https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/main/IFC%202.3.0.1%20%28IFC%202x3%29/Schependomlaan', description: 'ROOT architectural design model for the Schependomlaan residential project. Published with project and construction data. 49.3 MB; conversion can take longer.' },
  'kit-house': { name: 'KIT-FZK-Haus.ifc', format: 'ifc', preview: 'KIT-FZK-Haus-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'KIT architectural house design example, with windows, doors and pitched roof. Fictional design; compact import test. 2.6 MB.' },
  'school-arq': { name: 'school_arq.frag', format: 'frag', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open architecture model. Preconverted Fragments for visual comparison.' },
  'school-str': { name: 'school_str.ifc', format: 'ifc', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open structural school model. Tests the full IFC import pipeline; facade finishes are not included.' },
  'test-house': { name: 'Building-Architecture.ifc', format: 'ifc', source: 'https://github.com/buildingSMART/Sample-Test-Files', description: 'Compact buildingSMART test house. 13 display components for quick import and identity checks.' }
};

function render() {
  if(loadedModel)$('project-label').textContent=projectBackground?.get()?.buildingName || loadedModel.fileName;
  carbonInputs?.refresh();
  costInputs?.refresh();
  scheduleProjectSave();
  shell?.update();
  $('proposal-legend').hidden = recommendationVersion !== loadedModel?.modelVersion || !proposalRows.some(row => row.picked || (recommendedGuids.get(row.candidate.globalId) === row.type && !plannedRegions.some(region => region.globalId === row.candidate.globalId)));
  for (const [id, planId] of [['view-before', null], ['view-after', CURRENT_PLAN.id]]) {
    $(id).classList.toggle('active', selected === planId);
    $(id).setAttribute('aria-pressed', String(selected === planId));
  }
  $('export-report').disabled = $('export-handoff').disabled = !plannedRegions.length;
  $('region-summary').textContent = `${plannedRegions.length} planted location(s) · original building vs your current adopted planting.`;
  if (!plannedRegions.length) {
    $('scenario-results').innerHTML = '<p class="empty-text">Click a suitable building component to inspect it, then choose Add to plan. Ground regions can be defined without selecting a component.</p>';
    $('error').textContent = '';
    return;
  }
  try {
    const comparison = currentComparison(), result = comparison.proposal;
    const plan = CURRENT_PLAN, net = result.netDifferenceKgCo2e;
    $('scenario-results').innerHTML = comparisonOverviewMarkup(comparison) + `<article class="scenario ${selected === plan.id ? 'selected' : ''}">
        <div class="scenario-title"><div><h3>${plan.name}</h3><p>${plan.description}</p></div><span>${number(result.coverageM2)} m²</span></div>
        <div class="metrics"><div><small>Installation</small><strong>${money(result.installationCostHkd)}</strong></div><div><small>${result.years}-year installation + maintenance</small><strong>${money(result.totalCostHkd)}</strong></div><div><small>${net === null && result.carbonModel?.modelledScopeChangeKgCo2e ? result.years + '年碳排粗估（施工＋屋顶传热）' : result.years + '-year carbon difference'}</small><strong>${net === null && result.carbonModel?.modelledScopeChangeKgCo2e ? modelRange(result.carbonModel.modelledScopeChangeKgCo2e) : carbonValue(net)}</strong></div></div>
        ${result.budgetHkd === null ? '' : `<p class="budget-status">${result.withinBudget === null ? '报价待补，预算尚不能核对' : result.withinBudget ? 'Within installation budget' : 'Above installation budget'} · ${money(result.budgetHkd)}</p>`}
        <table class="region-breakdown"><thead><tr><th>Region</th><th>System</th><th>Coverage</th></tr></thead><tbody>${result.items.map((item) => `<tr><td>${REGION_TYPES[item.regionType]}</td><td>${escapeHtml(item.systemName)}${item.planting ? `<small>${escapeHtml(plantCatalog.plants.find(p => p.id === item.planting.plantId)?.commonNameEn ?? item.planting.plantId)} · concept</small>` : ''}</td><td>${item.coverageM2.toFixed(1)} m²</td></tr>`).join('')}</tbody></table>
        ${carbonResultMarkup(result.carbonAssessment)}
        ${carbonModelMarkup(result.carbonModel)}
        ${isHongKongBackground(projectBackground?.get()) ? '' : '<p class="note">当前碳排参考模型使用香港气候与电力数据，尚无所填城市的匹配模型；未自动套用香港系数。</p>'}
        ${historicalCostMarkup(historicalRoofCostArea())}${costResultMarkup(result.costAssessment)}
        <details><summary>Costs, assumptions and checks</summary><ul>${result.items.map((item) => `<li>${REGION_TYPES[item.regionType]}: added load ${item.factors.addedLoadKgM2.value} kg/m² (illustrative).</li>`).join('')}${result.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul><p>Costs require optional sourced project inputs; structural load rates remain illustrative. Display areas and vegetation are concept estimates. Carbon uses separately sourced project inputs, not plant geometry.</p></details>
      </article>`;
    $('error').textContent = '';
  } catch (error) {
    $('scenario-results').innerHTML = '';
    $('error').textContent = error.message;
    $('export-report').disabled = $('export-handoff').disabled = true;
  }
}
for (const id of ['years', 'budget']) $(id).addEventListener('input', render);
$('budget').addEventListener('change', () => { const value = $('budget').value === '' ? null : Number($('budget').value); if (value === null || Number.isFinite(value) && value >= 0 && value <= 1e12) { projectBackground?.syncBudget(value); scheduleProjectSave(); } });

function invalidateRegionDraft() {
  preparationEpoch++; draftRegion = null;
  $('region-confirmation').hidden = true;
  $('add-region').disabled = true;
}
function updateRegionType() {
  invalidateRegionDraft();
  $('ground-fields').hidden = $('region-type').value !== 'ground';
  $('surface-crop-fields').hidden = $('region-type').value === 'ground';
  $('surface-crop').value = $('region-type').value === 'terrace' ? 'front' : 'full';
  $('region-draft-status').textContent = 'Review this surface, then confirm its use and usable area. Geometry estimates assume model coordinates are metres.';
  refreshImportControls();
  void refreshCandidates();
}
$('region-type').addEventListener('change', updateRegionType);
for (const id of ['ground-width','ground-depth','ground-x','ground-z','surface-crop','crop-depth']) $(id).addEventListener('input', invalidateRegionDraft);
$('prepare-region').addEventListener('click', async () => {
  invalidateRegionDraft();
  const epoch = preparationEpoch;
  $('prepare-region').disabled = true;
  $('region-draft-status').textContent = 'Reading the selected surface…';
  try {
    const result = await viewer.prepareRegion({ type: $('region-type').value, selection: selectedComponent, crop: { side: $('surface-crop').value, depth: Number($('crop-depth').value) }, ground: { width: Number($('ground-width').value), depth: Number($('ground-depth').value), offsetX: Number($('ground-x').value), offsetZ: Number($('ground-z').value) } });
    if (epoch !== preparationEpoch) return;
    draftRegion = result;
    $('region-screening').textContent = [...result.screening.reasons, ...result.screening.missing].join(' ');
    $('area').value = (Math.floor(result.geometryAreaM2 * 100) / 100).toFixed(2);
    $('area').max = String(result.geometryAreaM2);
    $('region-confirmation').hidden = false;
    $('region-draft-status').textContent = `Display surface estimate: ${result.geometryAreaM2.toFixed(2)} m². Confirm a usable area within this surface; ${result.type === 'ground' ? 'the rectangle is user-defined, not an IFC property boundary.' : 'the proposed region use requires your confirmation.'}`;
  } catch (error) { if (epoch === preparationEpoch) $('region-draft-status').textContent = error.message; }
  finally { refreshImportControls(); }
});
function refreshRegionConfirmation() {
  const area = Number($('area').value);
  $('add-region').disabled = !draftRegion || importing || !Number.isFinite(area) || area <= 0 || area > draftRegion.geometryAreaM2 * 1.001;
}
$('area').addEventListener('input', refreshRegionConfirmation);
$('add-region').addEventListener('click', () => {
  try {
    viewer.previewRegion(draftRegion.id, Number($('area').value));
    invalidateRegionDraft();
    selected = lastPlan;
    viewer.setPlan(CURRENT_PLAN, true);
    render();
    $('region-draft-status').textContent = 'Custom region added to the current planting.'; $('custom-region').open = false; $('custom-region').hidden = true;
    showStatus('Showing planting. Continue adjusting in Inspect.');
  } catch (error) { $('region-draft-status').textContent = error.message; }
});
function showRegions(regions) {
  plannedRegions = regions;
  if (!applyingCombination) $('combination-status').textContent = '';
   updateCombinationControls();
  if (!regions.length) { selected = null; invalidateRegionDraft(); viewer?.setBeforeAfter(false); }
  render();
}
function setPreview(planId) {
  if (!plannedRegions.length) { openPanel('inspector-panel'); showStatus('Select a planting location first.'); return; }
  selected = planId;
  if (planId) viewer.setPlan(CURRENT_PLAN, true);
  else viewer.setBeforeAfter(false);
  refreshLocationPlanting();
  render();
  showStatus(planId ? 'Showing planting. Continue adjusting in Inspect.' : 'Showing the original building. Proposed planting is hidden.');
}
function downloadReport(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function projectSnapshot() {
  const { years, budgetHkd } = calculationInputs();
  return { schemaVersion: PROJECT_SCHEMA, savedAt: new Date().toISOString(), model: loadedModel,
    inputs: { years, budgetHkd: budgetHkd ?? null }, regions: plannedRegions, preview: selected ?? 'before', camera: viewer?.getViewState(),
    view: { renderStyle: $('render-style').value, appearance: $('plant-appearance').value, grid: $('show-grid').checked },
    carbon: carbonInputs?.serialize(), carbonModel: carbonModelInputs?.serialize(), cost: costInputs?.serialize(), projectBackground: projectBackground?.serialize(),
    assistant: { turns: assistantTurns, projectState: assistantProjectState, conditions: [...assistantFormByLocation],
      systems: proposalRows.filter(row => row.recommendedPlantingPlan).map(row => ({ globalId: row.candidate.globalId, type: row.type, plantId: row.recommendedPlantId, plan: row.recommendedPlantingPlan })) } };
}
function scheduleProjectSave() {
  clearTimeout(saveTimer);
  if (restoringProject || importing || !loadedModel || !modelFile) return;
  saveTimer = setTimeout(() => { void saveProject(false); }, 700);
}
async function saveProject(force = true) {
  if (restoringProject || importing || !loadedModel || !modelFile) return;
  try {
    const state = projectSnapshot(), signature = JSON.stringify({ ...state, savedAt: '' });
    if (!force && signature === lastSavedSignature) return;
    const file = modelFile, preview=captureWorkspacePreview();
    saveQueue = saveQueue.catch(() => {}).then(() => projectStore.save(state, file, preview));
    await saveQueue; lastSavedSignature = signature; showSavedProject({state,file,preview}); shell?.update();
    $('project-save-status').textContent = `已保存 ${state.model.fileName} · ${new Date(state.savedAt).toLocaleTimeString('zh-HK')}（此浏览器）`;
  } catch (error) { $('project-save-status').textContent = `保存失败：${error.message}。请导出完整项目备份。`; }
}
async function restoreProject(record) {
  if (!record || !viewer || importing || restoringProject) return;
  const state = validateProjectSnapshot(record.state); await verifyProjectFile(state, record.file);
  restoringProject = true; importing = true; clearTimeout(saveTimer); refreshImportControls();
  try {
    await (state.model.sourceFormat === 'ifc' ? viewer.openIfc(record.file) : viewer.openFragments(record.file));
    await viewer.restoreProjectRegions(state.regions);
    $('years').value = String(state.inputs.years); $('budget').value = state.inputs.budgetHkd === null ? '' : String(state.inputs.budgetHkd);
    projectBackground.start(loadedModel, state.projectBackground); projectBackground.syncBudget(state.inputs.budgetHkd);
    carbonInputs.restore(state.carbon); carbonModelInputs.restore(state.carbonModel); costInputs.restore(state.cost);
    workspacePreview=record.preview ? {modelVersion:state.model.modelVersion,image:record.preview} : null;
    modelFile = record.file; selected = state.preview === 'current' && plannedRegions.length ? CURRENT_PLAN.id : null;
    viewer.setPlan(CURRENT_PLAN, Boolean(selected));
    $('render-style').value = state.view.renderStyle; viewer.setRenderStyle(state.view.renderStyle);
    $('plant-appearance').value = state.view.appearance; viewer.setPlantAppearance(state.view.appearance);
    $('show-grid').checked = state.view.grid; viewer.setGrid(state.view.grid);
    await viewer.restoreViewState(state.camera);
    importing = false;
    await analyseLocations('', { open: false });
    assistantTurns = state.assistant.turns; assistantProjectState = state.assistant.projectState;
    assistantFormByLocation.clear();
    for (const [scope, values] of state.assistant.conditions) assistantFormByLocation.set(scope, values);
    for (const item of state.assistant.systems) { const row = proposalRows.find(row => row.type === item.type && row.candidate.globalId === item.globalId); if (row) { row.recommendedPlantId = item.plantId; row.recommendedPlantingPlan = item.plan; } }
    renderAssistantHistory(); renderProjectContext(); showLocationRecommendations();
    if (assistantTurns.length) { $('assistant-answer').textContent = assistantTurns.at(-1).answer; $('assistant-new-chat').hidden = false; }
    lastSavedSignature = null; render(); closePanel($('project-panel'));
    $('project-save-status').textContent = `已恢复 ${state.model.fileName} · ${state.regions.length} 个种植位置。历史修改不会重复执行。`;
    showStatus('项目已恢复，种植、数据和对话保留。');
  } catch (error) { modelFile = null; showStatus(`项目恢复失败：${error.message}。备份仍保留。`); $('project-save-status').textContent = `恢复失败：${error.message}`; throw error; }
  finally { restoringProject = false; importing = false; refreshImportControls(); render(); }
}
$('save-project').addEventListener('click', () => { void saveProject(); });
document.addEventListener('input', scheduleProjectSave);
$('bim-container').addEventListener('pointerup', scheduleProjectSave);
$('bim-container').addEventListener('wheel', scheduleProjectSave, { passive: true });
$('restore-project').addEventListener('click', async () => {
  try { if (!viewer) { initialSamplePending = false; await mountViewer(); } const record = await projectStore.load(); if (!record) $('project-save-status').textContent = '还没有本地项目'; else { shell.navigate('calculator'); await restoreProject(record); } }
  catch (error) { $('project-save-status').textContent = `恢复失败：${error.message}`; }
});
$('backup-project').addEventListener('click', async () => {
  if (!modelFile || !loadedModel || importing) return;
  try { downloadReport(await encodeProjectBackup(projectSnapshot(), modelFile), 'application/json', 'ecometrolink-project.json'); }
  catch (error) { $('project-save-status').textContent = `备份失败：${error.message}`; }
});
$('project-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file || importing) return;
  try {
    if (file.size > 120 * 1024 * 1024) throw new Error('完整项目备份超过 120 MB');
    const record = await decodeProjectBackup(await file.text()); initialSamplePending = false; await mountViewer();
    shell.navigate('calculator'); await restoreProject(record); await saveProject();
  } catch (error) { $('project-save-status').textContent = `导入失败：${error.message}。请使用完整项目备份。`; }
});
function handoff() {
  const { years, budgetHkd } = calculationInputs();
  return { schemaVersion: 'building-greening-regions-3', generatedAt: new Date().toISOString(), model: loadedModel, inputs: { years, budgetHkd: budgetHkd ?? null }, projectBackground: projectBackground?.get() ?? null, adoptedPlanting: adoptedPlantingReport({regions:plannedRegions,turns:assistantTurns,catalog:plantCatalog,modelVersion:loadedModel.modelVersion}), regionUseProvenance: plannedRegions.every(region => region.usableArea.provenance === 'user-confirmed') ? 'user-confirmed' : 'assumed', regions: plannedRegions, preview: selected ?? 'before', plantRecommendation: plantShortlist, comparison: currentComparison(), warning: 'Original building vs current adopted planting only. Zero baseline added area/cost is an intervention reference, not a whole-building inventory. Costs use project quote inputs; display areas remain concept estimates. Carbon input sources, completeness and supplier/year are recorded separately. No whole-building net-zero or certification claim.' };
}
$('export-handoff').addEventListener('click', () => {
  try { downloadReport(JSON.stringify(handoff(), null, 2), 'application/json', 'building-greening-handoff.json'); }
  catch (error) { $('error').textContent = error.message; }
});
$('export-report').addEventListener('click', () => {
  try {
    const report = handoff();
    const plan = report.comparison.proposal;
    const tables = comparisonOverviewMarkup(report.comparison) + `<h2>${escapeHtml(plan.planName)}</h2><p>Covered area: ${plan.coverageM2.toFixed(2)} m² · Installation: ${money(plan.installationCostHkd)} · ${plan.years}-year installation + maintenance: ${money(plan.totalCostHkd)} · ${plan.netDifferenceKgCo2e === null && plan.carbonModel?.modelledScopeChangeKgCo2e ? "参考碳排变化（施工＋屋顶传热）: " + modelRange(plan.carbonModel.modelledScopeChangeKgCo2e) : "Carbon difference: " + carbonValue(plan.netDifferenceKgCo2e)}</p>${carbonResultMarkup(plan.carbonAssessment)}${carbonModelMarkup(plan.carbonModel)}${historicalCostMarkup(historicalRoofCostArea())}${costResultMarkup(plan.costAssessment)}<table><tr><th>Region / IFC identity</th><th>System</th><th>Area</th><th>Installation</th></tr>${plan.items.map((item) => `<tr><td>${escapeHtml(item.regionName)}<small>${escapeHtml(item.globalId ?? item.regionId)}</small></td><td>${escapeHtml(item.systemName)}</td><td>${item.coverageM2.toFixed(2)} m²</td><td>${money(item.installationCostHkd)}</td></tr>`).join('')}</table><ul>${plan.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul>`;
    downloadReport(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Building Greening Report</title><style>body{font:14px system-ui;max-width:1000px;margin:40px auto;padding:24px;color:#243432}h1,h2{color:#276754}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}small{display:block;overflow-wrap:anywhere;color:#678}@media print{body{margin:0}h2{break-after:avoid}}</style><h1>Building greening comparison</h1><p>${escapeHtml(report.model.fileName)} · ${escapeHtml(report.generatedAt)}</p><p>Comparison period: ${report.inputs.years} years · Installation budget: ${report.inputs.budgetHkd === null ? "Not entered" : money(report.inputs.budgetHkd)}</p><p>${escapeHtml(report.warning)}</p>${projectBackgroundMarkup(report.projectBackground)}${isHongKongBackground(report.projectBackground) ? "" : "<p>所填城市暂无匹配的碳排参考模型，未套用香港系数。</p>"}${adoptedPlantingMarkup(report.adoptedPlanting)}${tables}</html>`, 'text/html', 'building-greening-report.html');
  } catch (error) { $('error').textContent = error.message; }
});

function showSelection(selection) {
  if(selection){$('custom-region').open=false;$('custom-region').hidden=true;}
  selectedComponent = selection; activeLocationGuid = selection?.globalId ?? null;
  const target = selection?.globalId && plantingTargets().find(item => item.guid === selection.globalId);
  if (target) plantingTargetKey = target.key;
  invalidateRegionDraft();
  const previousType = $('region-type').value;
  if (selection?.category?.includes('WALL')) $('region-type').value = 'facade';
  else if (selection?.category?.includes('ROOF')) $('region-type').value = 'roof';
  if ($('region-type').value !== previousType) $('surface-crop').value = 'full';
  $('ground-fields').hidden = $('region-type').value !== 'ground';
  $('surface-crop-fields').hidden = $('region-type').value === 'ground';
  refreshImportControls();
  void refreshCandidates();
  $('selection-dot').hidden = !selection;
  const panel = $('selection-details');
  panel.replaceChildren();
  if (!selection) {
    panel.classList.add('empty-text');
    panel.textContent = 'Select a roof, wall or other component in the model to inspect its IFC identity.';
    return;
  }
  panel.classList.remove('empty-text');
  const details = document.createElement('dl');
  for (const [label, value] of [
    ['Name', selection.name], ['IFC type', selection.category],
    ['GlobalId', selection.globalId ?? 'Not available in IFC'],
    ['Local selection ID', selection.localId], ['Model version', selection.modelVersion]
  ]) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = String(value);
    details.append(term, description);
  }
  const properties = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'IFC source attributes';
  const content = document.createElement('pre');
  content.textContent = JSON.stringify(selection.properties, null, 2);
  properties.append(summary, content);
  panel.append(details, properties);
  if (recommendationVersion !== selection.modelVersion) openPanel('inspector-panel', { focus: false });
}

function refreshImportControls() {
  $('save-project').disabled = $('backup-project').disabled = !loadedModel || !modelFile || importing || restoringProject;
  $('restore-project').disabled = !savedProjectRecord || importing || restoringProject;
  $('project-file').disabled = importing || restoringProject;
  shell?.update();
  $('ifc-file').disabled = importing || !viewer;
  $('empty-load-sample').disabled = importing || !viewer;
  $('sample-model').disabled = importing;
  $('fit-model').disabled = importing || !loadedModel;
  $('view-iso').disabled = importing || !loadedModel;
  $('view-top').disabled = importing || !loadedModel;
  $('render-style').disabled = importing || !viewer;
  $('plant-appearance').disabled = importing || !viewer;
  $('show-grid').disabled = importing || !viewer;
  $('clear-selection').disabled = importing || !loadedModel;
  $('prepare-region').disabled = importing || applyingCombination || !loadedModel || !viewer || (!selectedComponent && $('region-type').value !== 'ground');
  $('recommend-building').disabled = !loadedModel || importing || analysing || assistantWorking || applyingCombination;
  $('recommend-building').textContent = assistantWorking ? '正在推荐… / Recommending…' : '一键推荐 / Auto plant';
  $('assistant-ask').disabled = importing || !loadedModel || analysing || assistantWorking || applyingCombination;
  $('assistant-new-chat').disabled=importing||analysing||assistantWorking||applyingCombination;
  $('assistant-question').disabled=importing||assistantWorking;
  $('voice-record').disabled=!(window.SpeechRecognition??window.webkitSpeechRecognition)||importing||assistantWorking;
  updateCombinationControls();
  $('loading-overlay').hidden = !importing;
  $('viewer-empty').hidden = importing || Boolean(loadedModel);
  $('bim-container').setAttribute('aria-busy', String(importing));
}

function showStatus(message) {
  $('viewer-status').textContent = message;
  $('upload-status').textContent = message;
}

async function importFile(file) {
  if (!viewer || importing) return;
  importing = true;
  refreshImportControls();
  try {
    await viewer.openIfc(file);
    modelFile = file; render();
    closePanel($('project-panel'));
  }
  catch (error) { showStatus(`IFC import failed: ${error.message}`); }
  finally { importing = false; refreshImportControls(); render(); void refreshCandidates(); if (loadedModel) void analyseLocations('', { open: false }); }
}

$('ifc-file').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (file) await importFile(file);
  event.target.value = '';
});
async function loadSample() {
  if (importing || !viewer) return;
  importing = true;
  refreshImportControls();
  const sample = samples[$('sample-model').value];
  showStatus(`Loading ${sample.name}…`);
  try {
    const response = await fetch(`/samples/${sample.name}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Sample download returned HTTP ${response.status}`);
    const file = new File([await response.arrayBuffer()], sample.name);
    await (sample.format === 'ifc' ? viewer.openIfc(file) : viewer.openFragments(file));
    modelFile = file; render();
    closePanel($('project-panel'));
  } catch (error) { showStatus(`Could not load the sample: ${error.message}. You can select a local IFC file instead.`); }
  finally { importing = false; refreshImportControls(); render(); void refreshCandidates(); if (loadedModel) void analyseLocations('', { open: false }); }
}
$('empty-load-sample').addEventListener('click', () => {
  $('sample-model').value = 'kit-office';
  void loadSample();
});
for (const [id, direction] of [['view-iso', 'iso'], ['view-top', 'top']]) $(id).addEventListener('click', async () => {
  try { await viewer?.setView(direction); }
  catch (error) { showStatus(`Could not change view: ${error.message}`); }
});
$('render-style').addEventListener('change', (event) => {
  try { viewer?.setRenderStyle(event.target.value); }
  catch (error) { showStatus(`Could not change rendering: ${error.message}`); }
});
$('plant-appearance').addEventListener('change', event => viewer?.setPlantAppearance(event.target.value));
$('show-grid').addEventListener('change', (event) => viewer?.setGrid(event.target.checked));
for (const [id, method] of [['fit-model', 'fit'], ['clear-selection', 'clearSelection']]) {
  $(id).addEventListener('click', async () => {
    try { if(id==='clear-selection'){inspectionSelection.clear();refreshInspectionSelection();showSelection(null);updateCombinationControls();} await viewer?.[method](); }
    catch (error) { showStatus(error.message); }
  });
}
for (const [buttonId, scenarioId] of [['view-before', null], ['view-after', CURRENT_PLAN.id]]) $(buttonId).addEventListener('click', () => setPreview(scenarioId));
carbonInputs = createCarbonInputs({ container: $('carbon-inputs'), plans: [CURRENT_PLAN], getCalculationInputs: calculationInputs, onChange: render });
carbonModelInputs = createCarbonModelInputs({ container: $('carbon-model-inputs'), onChange: render });
projectBackground = createProjectBackground({ container: $('project-background'), onChange: () => { render(); scheduleProjectSave(); },
  onEdit: () => { assistantEpoch++; assistantRequest?.abort(); stopAssistantWork(); },
  onConfirm: background => { $('budget').value = background.budgetHkd === null ? '' : String(background.budgetHkd); }
});
costInputs = createCostInputs({ container: $('cost-inputs'), getCalculationInputs: calculationInputs, onChange: render });
shell = createWorkspaceShell({
  catalog: plantCatalog, samples,
  getState: () => {
    let results = [], error = null;
    if (plannedRegions.length) { try { results = planResults(); } catch (problem) { error = problem.message; } }
    const target = plantingTargets().find(item => item.key === libraryPlantingTargetKey) ?? currentPlantingTarget();
    return { buildingName: projectBackground?.get()?.buildingName, model: loadedModel, regions: plannedRegions, planId: selected ?? lastPlan, results, error, years: Number($('years').value), preview: workspacePreview && loadedModel && workspacePreview.modelVersion===loadedModel.modelVersion ? workspacePreview.image : null, sampleId: $('sample-model').value, targetName: target?.name };
  },
  onRouteChange: (page, previousPage) => {
    if (previousPage === 'flora') plantLibrary.close();
    for (const panel of workspacePanels) closePanel(panel, { restoreFocus: false });
    if (page === 'flora') libraryPlantingTargetKey = plantingTargetKey;
    if(previousPage==='calculator' && page==='dashboard'){captureWorkspacePreview();void saveProject(false);}
    viewer?.setVisible(page === 'calculator');
    if (page === 'calculator') void mountViewer();
  },
  onOpenPanel: id => openPanel(id),
  onOpenSample: id => {
    const ready = Boolean(viewer);
    $('sample-model').value = id;
    shell.navigate('calculator');
    if (ready) void loadSample();
  },
  onExport: () => $('export-report').click()
});
render();
refreshImportControls();
shell.start();
async function mountViewer() {
  if (viewer) {
    if (initialSamplePending && shell.page === 'calculator') { initialSamplePending = false; void loadSample(); }
    return;
  }
  if (viewerMounting) return;
  viewerMounting = true;
try {
  const { createBimViewer } = await import('../src/adapters/bim-viewer.js');
  viewer = await createBimViewer($('bim-container'), {
    onPlantAssetsState: state => {
      $('plant-asset-status').textContent = ({ ready: 'Fern 02 + Shrub 03 · Poly Haven · CC0. Ready.', loading: 'Loading plant models…', partial: 'One plant model is unavailable. Available models and simplified planting remain usable.', fallback: 'Plant models unavailable. Showing simplified planting.' })[state];
    },
    onSelection: showSelection,
    onPick: inspectModelLocation,
    onRegions: showRegions,
    onStatus: showStatus,
    onZoom: (percent) => {
      $('zoom-indicator').hidden = percent === null;
      if (percent !== null) $('zoom-percent').textContent = `${percent}%`;
    },
    onModel: (model) => {
      assistantRequest?.abort(); stopAssistantWork();
      assistantProjectState=[];assistantIndexCache=null;assistantFormByLocation.clear();assistantConditionScope=null;renderProjectContext();
      resetAssistantConversation();$('assistant-toast').hidden = true; assistantUnread = false; $('assistant-result-dot').hidden = true;
      assistantEpoch++; analysing = false; combinationEpoch++; applyingCombination = false; proposalRows = []; recommendedGuids.clear(); recommendationVersion = null; lastHighlightKey = null; $('proposal-legend').hidden = true; candidateCache.clear(); stopVoice();
      inspectionSelection.clear();inspectionHighlightKey=null;refreshInspectionSelection();activeLocationGuid = null; pendingPlantings.clear(); locationOrder.clear(); plantingTargetKey = null; libraryPlantingTargetKey = null;  $('custom-region').open = false; $('custom-region').hidden = true;  $('combination-status').textContent = '';
      $('assistant-candidates').replaceChildren();
      $('assistant-answer').textContent = 'Ask for a recommendation, or click the building to choose locations.'; $('screening-summary').textContent = '';
      $('roof-screening-note').textContent='';$('assistant-ai-options').replaceChildren();$('assistant-ai-options').hidden=true;
      workspacePreview=null;
      loadedModel = model;
      projectBackground?.start(model);
      if (!restoringProject) $('budget').value = '';
      modelFile = null;
      carbonInputs?.clear(); carbonModelInputs?.clear();
      costInputs?.clear();
      $('assistant-question').value = ''; $('plant-recommendations').open = false;
      $('plant-depth').value = ''; $('plant-light').value = $('plant-water').value = $('plant-facade').value = 'unknown'; $('plant-month').value = ''; $('plant-region').value = 'roof';
      invalidatePlantShortlist();
      $('plant-answer').textContent = 'Model changed. Recheck site conditions before finding plants.';
      $('project-label').textContent = model?.fileName ?? 'Start a building review';
      $('model-status-label').textContent = model ? `${model.componentCount.toLocaleString()} components` : 'Ready to import';
      $('viewer-badge').textContent = model ? (model.sourceFormat === 'frag' ? 'Fragments · IFC-derived' : 'IFC geometry') : 'No model loaded';
      $('inventory-total').textContent = model ? model.componentCount.toLocaleString() : '—';
      $('category-list').replaceChildren();
      for (const category of model?.categoryCounts ?? []) {
        const item = document.createElement('li');
        const label = document.createElement('span');
        const count = document.createElement('span');
        label.textContent = category.name;
        count.textContent = category.count.toLocaleString();
        item.append(label, count);
        $('category-list').append(item);
      }
      if (!model) {
        const item = document.createElement('li');
        item.className = 'empty-text';
        item.textContent = 'Component types appear after loading.';
        $('category-list').append(item);
      }
      refreshImportControls();
    }
  });
  viewer.setVisible(shell.page === 'calculator');
  showStatus('3D viewer ready. Select an IFC file or load the building sample.');
  refreshImportControls();
  if (shell.page === 'calculator' && initialSamplePending) {
    initialSamplePending = false;
    const saved = await localRecovery;
    if (saved) { try { await restoreProject(saved); } catch { /* Keep the existing recovery point; do not overwrite it with a sample. */ } }
    else if (!recoveryUnavailable) await loadSample();
  }
} catch (error) {
  showStatus(`Could not initialize the 3D viewer: ${error.message}`);
} finally {
  viewerMounting = false;
}
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  shell.dispose(); plantLibrary.close();
  carbonInputs?.dispose(); carbonModelInputs?.dispose();
  costInputs?.dispose(); clearTimeout(saveTimer);
  document.removeEventListener('pointerdown', buttonRipple);
  document.removeEventListener('click', buttonRipple);
  for (const ripple of document.querySelectorAll('.button-ripple')) {
    for (const animation of ripple.getAnimations()) animation.cancel();
    ripple.remove();
  }
  stopVoice(); assistantRequest?.abort(); clearInterval(assistantTimer); clearTimeout(toastTimer); toastExit?.cancel(); projectBackground?.dispose();
  void viewer?.dispose();
});
