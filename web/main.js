import { calculatePlan, PLANS, REGION_TYPES } from '../src/domain/greening-plan.js';

const $ = (id) => document.getElementById(id);
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
const money = (value) => `HK$${Math.round(value).toLocaleString('en-HK')}`;
const number = (value) => Math.round(value).toLocaleString('en-HK');
let selected = null;
let viewer;
let importing = false;
let selectedComponent = null;
let plannedRegions = [];
let draftRegion = null;
let preparationEpoch = 0;
let lastPlan = 'light';
let candidateEpoch = 0;
let assistantEpoch = 0;
let analysing = false;
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
function planResults() { return PLANS.map((plan) => calculatePlan({ ...calculationInputs(), plan })); }
let loadedModel = null;
const workspacePanels = [...document.querySelectorAll('.workspace-panel')];
const panelLaunchers = [...document.querySelectorAll('[data-panel][aria-expanded]')];

function syncPanelLaunchers() {
  for (const launcher of panelLaunchers) {
    launcher.setAttribute('aria-expanded', String($(launcher.dataset.panel).open));
  }
}

function closePanel(panel, { restoreFocus = true } = {}) {
  if (!panel?.open) return;
  panel.close();
  syncPanelLaunchers();
  if (restoreFocus) panelLaunchers.find((button) => button.dataset.panel === panel.id)?.focus();
}

function openPanel(id, { focus = true } = {}) {
  const panel = $(id);
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
async function analyseLocations(question = '', { open = true } = {}) {
  if (open) openPanel('inspector-panel');
  if (!loadedModel || importing) { $('assistant-answer').textContent = 'Load a building before finding planting candidates.'; return; }
  if (applyingCombination) return;
  const epoch = ++assistantEpoch, version = loadedModel.modelVersion;
  analysing = true;
  $('analyse-building').disabled = $('assistant-ask').disabled = true;
  const previousRows = proposalRows, previousSections = [...$('assistant-candidates').children];
  const previous = new Map(proposalRows.filter(row => row.picked).map(row => [row.candidate.globalId, { type: row.type, area: row.area.value }]));
  proposalRows = []; $('confirm-combination').checked = false;
  $('preview-review').hidden = true; $('combination-status').textContent = '';
  $('assistant-candidates').replaceChildren();
  $('assistant-answer').textContent = 'Screening IFC identities and actual display faces…';
  const counts = {};
  const requested = /roof|屋頂|屋顶/i.test(question) ? ['roof'] : /facade|wall|立面|外牆|外墙/i.test(question) ? ['facade'] : /terrace|balcony|露台|陽台|阳台/i.test(question) ? ['terrace'] : /ground|courtyard|地面|庭院/i.test(question) ? ['ground'] : ['roof','facade','terrace','ground'];
  try {
    for (const type of ['roof', 'facade', 'terrace', 'ground']) {
      const candidates = type === 'ground' ? [] : await screenedCandidates(type);
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
        reason.textContent += ` IFC: ${candidate.name} · ${candidate.globalId}. ` + PLANS.map(plan => `${plan.name}: ${plan.profiles[type].name}`).join(' · ');
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
          catch (error) { $('assistant-answer').textContent = error.message; }
        });
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove from selection';
        const edit = document.createElement('details'); const editSummary = document.createElement('summary'); editSummary.textContent = 'Adjust usable area'; edit.append(editSummary, areaLabel, areaError);
        const areaReadout = document.createElement('p'); areaReadout.className = 'location-area';
        const record = { label, edit, areaReadout, type, candidate, picked: previous.get(candidate.globalId)?.type === type, area, areaError, locate, remove, row, section };
        remove.addEventListener('click', () => toggleModelLocation(candidate));
        area.addEventListener('input', () => { $('confirm-combination').checked = false; updateCombinationControls(); });
        const actions = document.createElement('div'); actions.className = 'location-actions'; actions.append(locate, remove);
        details.prepend(estimate); row.append(choice, systems, areaReadout, edit, details, actions);
        proposalRows.push(record); section.append(row);
      });
      $('assistant-candidates').append(section);
    }
    recommendationVersion = version;
    const limits = { roof: 3, facade: 2, terrace: 2 }, countsByType = {};
    recommendedGuids = new Map();
    for (const row of proposalRows) if (!(row.type === 'roof' && proposalRows.some(other => other.type === 'terrace' && other.candidate.globalId === row.candidate.globalId)) && requested.includes(row.type) && !plannedRegions.some(region => region.globalId === row.candidate.globalId) && !recommendedGuids.has(row.candidate.globalId) && (countsByType[row.type] ?? 0) < (limits[row.type] ?? 0)) {
      recommendedGuids.set(row.candidate.globalId, row.type); countsByType[row.type] = (countsByType[row.type] ?? 0) + 1;
    }
    const chinese = /[\u3400-\u9fff]/.test(question) || (!question && $('voice-language').value.startsWith('zh'));
    const summary = Object.entries(counts).map(([type, count]) => `${chinese ? {roof:'屋顶',facade:'立面',terrace:'露台',ground:'庭院'}[type] : REGION_TYPES[type]}: ${count}`).join(' · ');
    $('screening-summary').textContent = summary;
    const suggestedCount = recommendedGuids.size;
    $('assistant-answer').textContent = question && requested[0] === 'ground' ? (chinese ? '庭院用地需你确认。选择“+ Ground area”定义地面区域。' : 'Available land needs your confirmation. Use + Ground area to define it.') : question && !suggestedCount ? (chinese ? '没有找到这类未分配的位置，其他已选位置保留。' : 'No unassigned candidates of this type were found. Existing selections are preserved.') : (chinese ? `已标出 ${suggestedCount} 个推荐起点。点击建筑选择或取消，之前的选择会保留。` : `${suggestedCount} starting locations highlighted. Click the building to select or remove; earlier choices stay selected.`);


  } catch (error) { if (epoch === assistantEpoch) { proposalRows = previousRows; $('assistant-candidates').replaceChildren(...previousSections); $('assistant-answer').textContent = `Location screening failed: ${error.message}. Earlier selections are preserved. Try finding locations again.`; } }
  finally { if (epoch === assistantEpoch) { analysing = false; $('preview-review').hidden = true; refreshImportControls(); } }
}
$('analyse-building').addEventListener('click', () => void analyseLocations());
$('assistant-ask').addEventListener('click', () => void analyseLocations($('assistant-question').value.trim()));
function revealInspectorSection(section) {
  const body = document.querySelector('#inspector-panel .panel-body');
  const bounds = body.getBoundingClientRect(), target = section.getBoundingClientRect();
  const delta = target.top < bounds.top ? target.top - bounds.top : target.bottom > bounds.bottom ? Math.min(target.top - bounds.top, target.bottom - bounds.bottom) : 0;
  if (delta) body.scrollTop += delta;
}
function renderSelectedLocations(chosen, busy) {
  $('region-count').textContent = String(chosen.length + plannedRegions.length);
  const list = $('region-list'); list.replaceChildren();
  for (const entry of [...chosen.map(row => ({ row })), ...plannedRegions.map(region => ({ region }))]) {
    const { row, region } = entry;
    const item = document.createElement('li'), review = document.createElement('button'), remove = document.createElement('button');
    const sourceRow = row ?? proposalRows.find(candidate => candidate.type === region.type && candidate.candidate.globalId === region.globalId);
    const label = sourceRow?.label ?? `${REGION_TYPES[region.type]} · ${region.name}`;
    const area = row ? Number(row.area.value) : region.usableArea.value;
    review.className = 'location-list-review'; review.textContent = `${label} · ${Number.isFinite(area) ? area.toFixed(1) : '—'} m²`;
    const state = document.createElement('small'); state.textContent = row ? 'Pending review' : 'In both plans'; review.append(state);
    review.disabled = busy;
    review.addEventListener('click', async () => {
      if (row) { activeLocationGuid = row.candidate.globalId; updateCombinationControls(); }
      else { activeLocationGuid = region.globalId; updateCombinationControls(); }
      if (row?.candidate.globalId || region?.globalId) {
        try { await viewer.highlightRoof(row?.candidate.globalId ?? region.globalId); }
        catch (error) { showStatus(error.message); }
      } else { $('location-empty').hidden = false; $('location-empty').textContent = `Ground / courtyard · ${region.usableArea.value.toFixed(1)} m². User-defined area; available land and access require confirmation.`; }
      revealInspectorSection(document.querySelector('.inspect-location'));
    });
    remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${label}`); remove.disabled = busy;
    remove.addEventListener('click', () => {
      if (row) { row.picked = false; $('confirm-combination').checked = false; $('preview-review').hidden = true; updateCombinationControls(); }
      else { invalidateRegionDraft(); viewer.removeRegion(region.id); }
    });
    item.append(review, remove); list.append(item);
  }
  if (!list.children.length) { const empty = document.createElement('li'); empty.className = 'empty-text'; empty.textContent = 'Click the building to select locations.'; list.append(empty); }
}
function updateCombinationControls() {
  const busy = importing || analysing || applyingCombination || !loadedModel;
  let activeRow = null;
  for (const row of proposalRows) {
    const assigned = plannedRegions.find(region => region.globalId === row.candidate.globalId);
    if (assigned) row.picked = false;
    row.disabled = busy || assigned || row.candidate.modelVersion !== loadedModel?.modelVersion;
    row.row.hidden = row.candidate.globalId !== activeLocationGuid;
    if (!row.row.hidden && (!activeRow || row.picked || (!activeRow.picked && row.type === 'terrace'))) activeRow = row;
    row.section.hidden = true;
    row.remove.disabled = row.disabled;
    row.remove.textContent = assigned ? 'In both plans' : row.picked ? 'Remove selection' : 'Select location';
    row.area.disabled = row.disabled || !row.picked;
    row.edit.hidden = assigned || !row.picked;
    const invalid = row.picked && (!Number.isFinite(Number(row.area.value)) || Number(row.area.value) <= 0 || Number(row.area.value) > row.candidate.geometryAreaM2 * 1.001);
    const displayArea = assigned ? assigned.usableArea.value : row.picked ? Number(row.area.value) : row.candidate.geometryAreaM2;
    row.areaReadout.textContent = `${Number.isFinite(displayArea) ? displayArea.toFixed(1) : '—'} m² · ${assigned ? 'in both plans' : row.picked ? 'selected area' : 'display estimate'}`;
    row.area.setAttribute('aria-invalid', String(invalid)); row.areaError.hidden = !invalid;
    if (invalid) row.edit.open = true;
    row.areaError.textContent = invalid ? `Enter a positive area within ${row.candidate.geometryAreaM2.toFixed(2)} m².` : '';
    row.locate.disabled = busy;
  }
  if (activeRow) {
    for (const row of proposalRows) if (row.candidate.globalId === activeLocationGuid) row.row.hidden = row !== activeRow;
    activeRow.section.hidden = false;
  }
  $('location-empty').hidden = Boolean(activeRow);
  $('location-empty').textContent = selectedComponent ? `${selectedComponent.name} is not a screened planting location. Select a highlighted roof or wall.` : 'Click a highlighted part of the building to review it. Other choices stay selected.';
  const chosen = proposalRows.filter(row => row.picked);
  const total = chosen.reduce((sum, row) => sum + Number(row.area.value), 0) + plannedRegions.reduce((sum, region) => sum + region.usableArea.value, 0);
  const valid = chosen.length && chosen.every(row => Number.isFinite(Number(row.area.value)) && Number(row.area.value) > 0 && Number(row.area.value) <= row.candidate.geometryAreaM2 * 1.001);
  $('combination-summary').textContent = chosen.length || plannedRegions.length ? `${chosen.length + plannedRegions.length} locations · ${Number.isFinite(total) ? total.toFixed(1) : '—'} m²` : 'No locations selected';
  $('add-combination').disabled = busy || (chosen.length ? !valid : !plannedRegions.length);
  $('confirm-combination').disabled = busy || !chosen.length;
  $('select-suggested').disabled = busy || !proposalRows.some(row => !row.disabled && recommendedGuids.get(row.candidate.globalId) === row.type);
  $('add-ground').disabled = busy;
  $('review-selected').disabled = busy || (!chosen.length && !plannedRegions.length);
  $('clear-candidates').disabled = busy || !chosen.length; $('clear-candidates').hidden = !chosen.length;
  $('add-combination').textContent = applyingCombination ? 'Preparing planting…' : chosen.length && $('confirm-combination').checked ? 'Confirm & preview' : 'Preview planting';
  $('combination-status').hidden = !$('combination-status').textContent;
  $('proposal-legend').hidden = recommendationVersion !== loadedModel?.modelVersion || !proposalRows.length || selected !== null;
  renderSelectedLocations(chosen, busy);
  const recommended = proposalRows.filter(row => recommendedGuids.get(row.candidate.globalId) === row.type && !plannedRegions.some(region => region.globalId === row.candidate.globalId));
  $('proposal-count').textContent = `${chosen.length} selected · ${new Set(recommended.map(row => row.candidate.globalId)).size} recommended`;
  const ids = { recommended: [...new Set(recommended.map(row => row.candidate.localId))], picked: chosen.map(row => row.candidate.localId), types: Object.fromEntries([...recommended, ...chosen].map(row => [row.candidate.localId, row.type])), version: loadedModel?.modelVersion };
  const key = JSON.stringify(ids);
  if (viewer && key !== lastHighlightKey) { lastHighlightKey = key; void viewer.setProposalHighlights(ids).catch(error => { lastHighlightKey = null; showStatus(`Could not highlight locations: ${error.message}`); }); }
}
function toggleModelLocation(selection) {
  if (importing || analysing || applyingCombination || selection.modelVersion !== recommendationVersion) return;
  if (plannedRegions.some(region => region.globalId === selection.globalId)) {
    showStatus('This component is already in both plans. Remove it in Inspect before choosing it again.'); return;
  }
  const matches = proposalRows.filter(row => row.candidate.globalId === selection.globalId);
  const row = matches.find(item => item.picked) ?? matches.find(item => item.type === 'terrace') ?? matches[0];
  if (!row) { showStatus(`${selection.name}: not a screened planting candidate. Inspect source details for manual review; windows, ordinary floors and incompatible faces are not added.`); return; }
  if (selected !== null) { selected = null; viewer.setBeforeAfter(false); render(); }
  activeLocationGuid = selection.globalId;
  row.picked = !row.picked;
  $('confirm-combination').checked = false; $('preview-review').hidden = true; $('combination-status').textContent = '';
  updateCombinationControls();
  showStatus(`${row.picked ? 'Added' : 'Removed'} ${selection.name}. ${proposalRows.filter(item => item.picked).length} locations selected. Earlier choices remain highlighted; review them in Inspect.`);
}
$('confirm-combination').addEventListener('change', updateCombinationControls);
$('select-suggested').addEventListener('click', () => {
  for (const row of proposalRows) if (!row.disabled && recommendedGuids.get(row.candidate.globalId) === row.type) {
    for (const other of proposalRows) if (other.candidate.globalId === row.candidate.globalId) other.picked = false;
    row.picked = true;
  }
  activeLocationGuid ??= proposalRows.find(row => row.picked)?.candidate.globalId ?? null;
  selected = null; viewer.setBeforeAfter(false); render();
  $('confirm-combination').checked = false; $('preview-review').hidden = true; $('combination-status').textContent = '';
  updateCombinationControls();
});
$('clear-candidates').addEventListener('click', () => {
  for (const row of proposalRows) row.picked = false;
  $('confirm-combination').checked = false; $('preview-review').hidden = true; $('combination-status').textContent = ''; updateCombinationControls();
});
$('add-combination').addEventListener('click', async () => {
  if ($('add-combination').disabled) return;
  const chosen = proposalRows.filter(row => row.picked);
  if (!chosen.length) { setPreview(lastPlan); openPanel('comparison'); return; }
  if (!$('confirm-combination').checked) { $('preview-review').hidden = false; $('chosen-locations').open = true; $('confirm-combination').focus({ preventScroll: true }); return; }
  const epoch = ++combinationEpoch;
  const requests = proposalRows.filter(row => row.picked).map(row => ({ type: row.type, localId: row.candidate.localId, globalId: row.candidate.globalId, modelVersion: row.candidate.modelVersion, area: Number(row.area.value) }));
  applyingCombination = true; invalidateRegionDraft(); refreshImportControls();
  $('combination-status').textContent = `Rechecking ${requests.length} source surfaces before adding the complete set…`;
  try {
    const added = await viewer.addCandidateRegions(requests, $('confirm-combination').checked);
    if (epoch !== combinationEpoch) return;
    $('confirm-combination').checked = false;
    selected = lastPlan; viewer.setPlan(PLANS.find(plan => plan.id === selected), true); render();
    $('combination-status').textContent = ''; $('preview-review').hidden = true; openPanel('comparison');
    showStatus('Showing combined planting. Before / After and Compare use all confirmed regions.');
  } catch (error) { if (epoch === combinationEpoch) $('combination-status').textContent = error.message; }
  finally { if (epoch === combinationEpoch) { applyingCombination = false; refreshImportControls(); } }
});

$('review-selected').addEventListener('click', () => {
  const list = $('chosen-locations'); list.open = !list.open;
  if (list.open) revealInspectorSection(list);
});
$('chosen-locations').addEventListener('toggle', () => $('review-selected').setAttribute('aria-expanded', String($('chosen-locations').open)));
$('add-ground').addEventListener('click', () => {
  $('region-type').value = 'ground'; updateRegionType(); $('custom-region').open = true;
  $('ground-width').focus();
});
$('assistant-question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('assistant-ask').click(); } });
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null;
function resetVoiceButton() { $('voice-record').setAttribute('aria-label', 'Start voice input'); $('voice-record').title = 'Start voice input'; $('voice-record').setAttribute('aria-pressed', 'false'); }
function stopVoice() { recognition?.abort(); }
$('voice-record').disabled = !Recognition;
if (!Recognition) { $('voice-status').hidden = false; $('voice-status').textContent = 'Voice recognition unavailable. Type your question instead.'; }
$('voice-record').addEventListener('click', () => {
  if (recognition) { recognition.stop(); return; }
  const current = new Recognition(); recognition = current;
  current.lang = $('voice-language').value; current.continuous = false; current.interimResults = false;
  $('voice-status').hidden = false;
  $('voice-record').setAttribute('aria-label', 'Stop voice input'); $('voice-record').title = 'Stop voice input'; $('voice-record').setAttribute('aria-pressed', 'true');
  $('voice-status').textContent = 'Waiting for microphone access…';
  current.onstart = () => { $('voice-status').textContent = 'Listening… Your browser may send audio to its speech service.'; };
  current.onresult = event => { $('assistant-question').value = event.results[0][0].transcript; $('voice-status').textContent = 'Review the transcript, then choose Ask. No region has been added.'; };
  current.onerror = event => { $('voice-status').textContent = `Voice input: ${event.error}. You can type your question instead.`; };
  current.onend = () => { if (recognition === current) { recognition = null; resetVoiceButton(); } };
  try { current.start(); } catch (error) { recognition = null; resetVoiceButton(); $('voice-status').textContent = error.message; }
});
$('inspector-panel').addEventListener('close', stopVoice);

const samples = {
  'kit-office': { name: 'KIT-Office.ifc', format: 'ifc', preview: 'KIT-Office-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'Architectural office design example from KIT: exterior walls, windows and roof geometry. Fictional design, not a verified built project. 10.9 MB.' },
  'schependomlaan': { name: 'Schependomlaan.ifc', format: 'ifc', preview: 'Schependomlaan-preview.png', source: 'https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/main/IFC%202.3.0.1%20%28IFC%202x3%29/Schependomlaan', description: 'ROOT architectural design model for the Schependomlaan residential project. Published with project and construction data. 49.3 MB; conversion can take longer.' },
  'kit-house': { name: 'KIT-FZK-Haus.ifc', format: 'ifc', preview: 'KIT-FZK-Haus-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'KIT architectural house design example, with windows, doors and pitched roof. Fictional design; compact import test. 2.6 MB.' },
  'school-arq': { name: 'school_arq.frag', format: 'frag', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open architecture model. Preconverted Fragments for visual comparison.' },
  'school-str': { name: 'school_str.ifc', format: 'ifc', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open structural school model. Tests the full IFC import pipeline; facade finishes are not included.' },
  'test-house': { name: 'Building-Architecture.ifc', format: 'ifc', source: 'https://github.com/buildingSMART/Sample-Test-Files', description: 'Compact buildingSMART test house. 13 display components for quick import and identity checks.' }
};

function render() {
  $('proposal-legend').hidden = recommendationVersion !== loadedModel?.modelVersion || !proposalRows.length || selected !== null;
  for (const [id, planId] of [['view-before', null], ['view-extensive', 'light'], ['view-intensive', 'landscape']]) {
    $(id).classList.toggle('active', selected === planId);
    $(id).setAttribute('aria-pressed', String(selected === planId));
  }
  $('preview-switch').hidden = !plannedRegions.length;
  $('preview-before').setAttribute('aria-pressed', String(selected === null));
  $('preview-after').setAttribute('aria-pressed', String(selected !== null));
  $('preview-plan-label').textContent = PLANS.find((plan) => plan.id === lastPlan).name;
  $('export-report').disabled = $('export-handoff').disabled = !plannedRegions.length;
  $('region-summary').textContent = `${plannedRegions.length} confirmed region(s) · same model, areas and period for both plans.`;
  if (!plannedRegions.length) {
    $('scenario-results').innerHTML = '<p class="empty-text">Select a component, open Inspect and add a confirmed greening region. Ground regions can be defined without selecting a component.</p>';
    $('error').textContent = '';
    return;
  }
  try {
    const results = planResults();
    $('scenario-results').innerHTML = results.map((result, index) => {
      const plan = PLANS[index], net = result.netDifferenceKgCo2e;
      return `<article class="scenario ${selected === plan.id ? 'selected' : ''}">
        <div class="scenario-title"><div><h3>${plan.name}</h3><p>${plan.description}</p></div><span>${number(result.coverageM2)} m²</span></div>
        <div class="metrics"><div><small>Installation</small><strong>${money(result.installationCostHkd)}</strong></div><div><small>${result.years}-year cost incl. maintenance</small><strong>${money(result.totalCostHkd)}</strong></div><div><small>${result.years}-year carbon difference</small><strong>${net < 0 ? '−' : '+'}${number(Math.abs(net))} kgCO₂e</strong></div></div>
        ${result.budgetHkd === null ? '' : `<p class="budget-status ${result.withinBudget ? '' : 'over-budget'}">${result.withinBudget ? 'Within' : 'Above'} installation budget of ${money(result.budgetHkd)}${result.withinBudget ? '' : ` by ${money(result.installationCostHkd - result.budgetHkd)}`}</p>`}
        <table class="region-breakdown"><thead><tr><th>Region</th><th>System</th><th>Coverage</th></tr></thead><tbody>${result.items.map((item) => `<tr><td>${REGION_TYPES[item.regionType]}</td><td>${escapeHtml(item.systemName)}</td><td>${item.coverageM2.toFixed(1)} m²</td></tr>`).join('')}</tbody></table>
        <p class="metric-explain">${number(result.installationKgCo2e)} kgCO₂e installation − ${number(result.avoidedOperationalKgCo2e)} kgCO₂e assumed energy savings. Plant carbon sequestration is excluded. Negative means a lower modelled intervention total over this period.</p>
        <details><summary>Factors, assumptions and checks</summary><ul>${result.items.map((item) => `<li>${REGION_TYPES[item.regionType]}: installation ${item.factors.installationKgCo2eM2.value} kgCO₂e/m²; assumed avoided emissions ${item.factors.annualAvoidedKgCo2eM2.value} kgCO₂e/m²/year; added load ${item.factors.addedLoadKgM2.value} kg/m².</li>`).join('')}${result.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul><p>All factors are presentation assumptions. Region uses and usable areas are user-confirmed, not structural approval. Vegetation, sizes and spacing are illustrative. Planted coverage follows the confirmed inputs.</p></details>
      </article>`;
    }).join('');
    $('error').textContent = '';
  } catch (error) {
    $('scenario-results').innerHTML = '';
    $('error').textContent = error.message;
    $('export-report').disabled = $('export-handoff').disabled = true;
  }
}
for (const id of ['years', 'budget']) $(id).addEventListener('input', render);

function invalidateRegionDraft() {
  preparationEpoch++; draftRegion = null;
  $('region-confirmation').hidden = true;
  $('confirm-constraints').checked = false;
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
  $('add-region').disabled = !draftRegion || !$('confirm-constraints').checked || importing || !Number.isFinite(area) || area <= 0 || area > draftRegion.geometryAreaM2 * 1.001;
}
$('area').addEventListener('input', () => { $('confirm-constraints').checked = false; refreshRegionConfirmation(); });
$('confirm-constraints').addEventListener('change', refreshRegionConfirmation);
$('add-region').addEventListener('click', () => {
  try {
    viewer.confirmRegion(draftRegion.id, Number($('area').value), $('confirm-constraints').checked);
    invalidateRegionDraft();
    selected = lastPlan;
    viewer.setPlan(PLANS.find((plan) => plan.id === selected), true);
    render();
    $('region-draft-status').textContent = 'Custom region added to both plans.'; $('custom-region').open = false; openPanel('comparison');
    showStatus('Showing proposed planting. Use Before / After to compare the same model.');
  } catch (error) { $('region-draft-status').textContent = error.message; }
});
function showRegions(regions) {
  plannedRegions = regions;
  if (!applyingCombination) $('combination-status').textContent = '';
  if (regions.length) $('assistant-answer').textContent = `${regions.length} locations are in both plans. Select more on the building or review your selection below.`;
  $('confirm-combination').checked = false; updateCombinationControls();
  if (!regions.length) { selected = null; invalidateRegionDraft(); }
  render();
}
function setPreview(planId) {
  if (!plannedRegions.length) { openPanel('inspector-panel'); showStatus('Add a confirmed region before previewing planting.'); return; }
  selected = planId;
  if (planId) { lastPlan = planId; viewer.setPlan(PLANS.find((plan) => plan.id === planId), true); }
  else viewer.setBeforeAfter(false);
  render();
  showStatus(planId ? 'Showing proposed planting. Use Before / After to compare the same model.' : 'Showing the original building. Proposed planting is hidden.');
}
$('preview-before').addEventListener('click', () => setPreview(null));
$('preview-after').addEventListener('click', () => setPreview(lastPlan));
function downloadReport(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function handoff() {
  const { years, budgetHkd } = calculationInputs();
  return { schemaVersion: 'building-greening-regions-1', generatedAt: new Date().toISOString(), model: loadedModel, inputs: { years, budgetHkd: budgetHkd ?? null }, regionUseProvenance: 'user-confirmed', regions: plannedRegions, preview: selected ?? 'before', plans: planResults(), warning: 'Presentation factors, not measured performance. Display geometry estimates assume metres. Professional engineering review is unresolved; no whole-building net-zero or certification claim.' };
}
$('export-handoff').addEventListener('click', () => {
  try { downloadReport(JSON.stringify(handoff(), null, 2), 'application/json', 'building-greening-handoff.json'); }
  catch (error) { $('error').textContent = error.message; }
});
$('export-report').addEventListener('click', () => {
  try {
    const report = handoff();
    const tables = report.plans.map((plan) => `<h2>${escapeHtml(plan.planName)}</h2><p>Covered area: ${plan.coverageM2.toFixed(2)} m² · Installation: ${money(plan.installationCostHkd)} · ${plan.years}-year total cost: ${money(plan.totalCostHkd)} · Carbon difference: ${plan.netDifferenceKgCo2e.toFixed(2)} kgCO₂e</p><table><tr><th>Region / IFC identity</th><th>System</th><th>Area</th><th>Installation</th></tr>${plan.items.map((item) => `<tr><td>${escapeHtml(item.regionName)}<small>${escapeHtml(item.globalId ?? item.regionId)}</small></td><td>${escapeHtml(item.systemName)}</td><td>${item.coverageM2.toFixed(2)} m²</td><td>${money(item.installationCostHkd)}</td></tr>`).join('')}</table><ul>${plan.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul>`).join('');
    downloadReport(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Building Greening Report</title><style>body{font:14px system-ui;max-width:1000px;margin:40px auto;padding:24px;color:#243432}h1,h2{color:#276754}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}small{display:block;overflow-wrap:anywhere;color:#678}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6f4;padding:16px}@media print{body{margin:0}h2{break-after:avoid}}</style><h1>Building greening comparison</h1><p>${escapeHtml(report.model.fileName)} · ${escapeHtml(report.generatedAt)}</p><p>Comparison period: ${report.inputs.years} years · Installation budget: ${report.inputs.budgetHkd === null ? "Not entered" : money(report.inputs.budgetHkd)}</p><p>${escapeHtml(report.warning)}</p>${tables}<h2>Traceable regions, factors and scenario results</h2><pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre></html>`, 'text/html', 'building-greening-report.html');
  } catch (error) { $('error').textContent = error.message; }
});

function showSelection(selection) {
  selectedComponent = selection; activeLocationGuid = selection?.globalId ?? null; invalidateRegionDraft();
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
  $('ifc-file').disabled = importing || !viewer;
  $('load-sample').disabled = importing || !viewer;
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
  $('analyse-building').disabled = $('assistant-ask').disabled = importing || !loadedModel || analysing || applyingCombination;
  updateCombinationControls();
  for (const button of $('region-list').querySelectorAll('button')) button.disabled = importing || applyingCombination;
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
    closePanel($('project-panel'));
  }
  catch (error) { showStatus(`IFC import failed: ${error.message}`); }
  finally { importing = false; refreshImportControls(); void refreshCandidates(); if (loadedModel) void analyseLocations('', { open: false }); }
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
    closePanel($('project-panel'));
  } catch (error) { showStatus(`Could not load the sample: ${error.message}. You can select a local IFC file instead.`); }
  finally { importing = false; refreshImportControls(); void refreshCandidates(); if (loadedModel) void analyseLocations('', { open: false }); }
}
$('load-sample').addEventListener('click', loadSample);
$('empty-load-sample').addEventListener('click', () => {
  $('sample-model').value = 'kit-office';
  updateSampleDescription();
  void loadSample();
});
function updateSampleDescription() {
  const sample = samples[$('sample-model').value];
  $('sample-description').textContent = sample.description;
  $('sample-download').href = `/samples/${sample.name}`;
  $('sample-source').href = sample.source;
  $('sample-preview').hidden = !sample.preview;
  if (sample.preview) $('sample-preview').src = `/samples/${sample.preview}`;
  else $('sample-preview').removeAttribute('src');
}
$('sample-model').addEventListener('change', updateSampleDescription);
updateSampleDescription();
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
    try { await viewer?.[method](); }
    catch (error) { showStatus(error.message); }
  });
}
for (const [buttonId, scenarioId] of [['view-before', null], ['view-extensive', 'light'], ['view-intensive', 'landscape']]) $(buttonId).addEventListener('click', () => setPreview(scenarioId));
render();
refreshImportControls();
try {
  const { createBimViewer } = await import('../src/adapters/bim-viewer.js');
  viewer = await createBimViewer($('bim-container'), {
    onPlantAssetsState: state => {
      $('plant-asset-status').textContent = ({ ready: 'Fern 02 + Shrub 03 · Poly Haven · CC0. Ready.', loading: 'Loading plant models…', partial: 'One plant model is unavailable. Available models and simplified planting remain usable.', fallback: 'Plant models unavailable. Showing simplified planting.' })[state];
    },
    onSelection: showSelection,
    onPick: toggleModelLocation,
    onRegions: showRegions,
    onStatus: showStatus,
    onZoom: (percent) => {
      $('zoom-indicator').hidden = percent === null;
      if (percent !== null) $('zoom-percent').textContent = `${percent}%`;
    },
    onModel: (model) => {
      assistantEpoch++; analysing = false; combinationEpoch++; applyingCombination = false; proposalRows = []; recommendedGuids.clear(); recommendationVersion = null; lastHighlightKey = null; $('proposal-legend').hidden = true; candidateCache.clear(); stopVoice();
      activeLocationGuid = null; $('preview-review').hidden = true; $('chosen-locations').open = false; $('custom-region').open = false; $('confirm-combination').checked = false; $('combination-status').textContent = '';
      $('assistant-candidates').replaceChildren();
      $('assistant-answer').textContent = 'Reading planting locations…'; $('screening-summary').textContent = '';
      loadedModel = model;
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
  showStatus('3D viewer ready. Select an IFC file or load the building sample.');
  refreshImportControls();
  void loadSample();
} catch (error) {
  showStatus(`Could not initialize the 3D viewer: ${error.message}`);
}
if (import.meta.hot) import.meta.hot.dispose(() => {
  document.removeEventListener('pointerdown', buttonRipple);
  document.removeEventListener('click', buttonRipple);
  for (const ripple of document.querySelectorAll('.button-ripple')) {
    for (const animation of ripple.getAnimations()) animation.cancel();
    ripple.remove();
  }
  stopVoice();
  void viewer?.dispose();
});
