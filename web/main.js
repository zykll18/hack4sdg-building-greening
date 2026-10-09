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
const panelLaunchers = [...document.querySelectorAll('.workspace-dock [data-panel]')];

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
async function analyseLocations(question = '') {
  openPanel('inspector-panel');
  if (!loadedModel || importing) { $('assistant-answer').textContent = 'Load a building before finding planting candidates.'; return; }
  const epoch = ++assistantEpoch, version = loadedModel.modelVersion;
  analysing = true;
  stopReading();
  $('voice-read').disabled = true;
  $('analyse-building').disabled = $('assistant-ask').disabled = true;
  $('assistant-candidates').replaceChildren();
  $('assistant-answer').textContent = 'Screening IFC identities and actual display faces…';
  const counts = {};
  const requested = /roof|屋頂|屋顶/i.test(question) ? ['roof'] : /facade|wall|立面|外牆|外墙/i.test(question) ? ['facade'] : /terrace|balcony|露台|陽台|阳台/i.test(question) ? ['terrace'] : /ground|courtyard|地面|庭院/i.test(question) ? ['ground'] : ['roof','facade','terrace','ground'];
  try {
    for (const type of requested) {
      const candidates = type === 'ground' ? [] : await screenedCandidates(type);
      if (epoch !== assistantEpoch || loadedModel?.modelVersion !== version || importing) return;
      counts[type] = candidates.length;
      const section = document.createElement('section'), heading = document.createElement('h3');
      heading.textContent = `${REGION_TYPES[type]} · ${candidates.length} conditional candidate(s)`; section.append(heading);
      if (!candidates.length) {
        const note = document.createElement('p'); note.className = 'note';
        note.textContent = type === 'ground' ? 'No available land can be inferred from this IFC. Define a rectangle outside the building footprint and confirm land availability, level and utilities.' : 'No compatible candidate found. Do not convert an ordinary floor or an incompatible component into a planting area.';
        section.append(note);
      }
      for (const candidate of candidates.slice(0, 3)) {
        const name = document.createElement('strong'), reason = document.createElement('p'), locate = document.createElement('button');
        name.textContent = `${candidate.name} · ${candidate.geometryAreaM2.toFixed(1)} m² display estimate`;
        reason.className = 'note'; reason.textContent = [...candidate.screening.reasons, ...candidate.screening.missing].join(' ');
        locate.type = 'button'; locate.textContent = 'Locate & review';
        locate.addEventListener('click', async () => {
          if (loadedModel?.modelVersion !== version || importing) return;
          $('region-type').value = type; updateRegionType();
          try { await viewer.highlightRoof(candidate.globalId); openPanel('inspector-panel'); }
          catch (error) { $('assistant-answer').textContent = error.message; }
        });
        section.append(name, reason, locate);
      }
      $('assistant-candidates').append(section);
    }
    const chinese = /[\u3400-\u9fff]/.test(question) || (!question && $('voice-language').value.startsWith('zh'));
    const summary = Object.entries(counts).map(([type, count]) => `${chinese ? {roof:'屋顶',facade:'立面',terrace:'露台',ground:'庭院'}[type] : REGION_TYPES[type]}: ${count}`).join(' · ');
    $('assistant-answer').textContent = chinese ? `初筛候选数量：${summary}。已按构件用途、朝向、坡度和位置筛选。仍需确认外部空间与工程条件；普通楼板不能替代露台，庭院用地也不能从模型推断。点击 Locate 查看位置，再确认可用面积。当前是规则筛选，尚未接入 AI 模型。` : `Conditional candidates: ${summary}. Candidates are ranked by compatible display area. Check location, exposure and unresolved engineering requirements before confirming. Ordinary floors are not terrace candidates, and available land cannot be inferred. This is rule-based screening; AI is not connected.`;
  } catch (error) { if (epoch === assistantEpoch) $('assistant-answer').textContent = error.message; }
  finally { if (epoch === assistantEpoch) { analysing = false; refreshImportControls(); $('voice-read').disabled = !window.speechSynthesis || !$('assistant-candidates').children.length; } }
}
$('analyse-building').addEventListener('click', () => void analyseLocations());
$('assistant-ask').addEventListener('click', () => void analyseLocations($('assistant-question').value.trim()));
const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
let recognition = null;
function resetVoiceButton() { $('voice-record').textContent = 'Start voice input'; $('voice-record').setAttribute('aria-pressed', 'false'); }
function stopVoice() { recognition?.abort(); stopReading(); }
$('voice-record').disabled = !Recognition;
if (!Recognition) $('voice-status').textContent = 'Voice recognition is unavailable in this browser. Type your question instead.';
$('voice-record').addEventListener('click', () => {
  if (recognition) { recognition.stop(); return; }
  stopReading();
  const current = new Recognition(); recognition = current;
  current.lang = $('voice-language').value; current.continuous = false; current.interimResults = false;
  $('voice-record').textContent = 'Stop voice input'; $('voice-record').setAttribute('aria-pressed', 'true');
  $('voice-status').textContent = 'Waiting for microphone access…';
  current.onstart = () => { $('voice-status').textContent = 'Listening… Your browser may send audio to its speech service.'; };
  current.onresult = event => { $('assistant-question').value = event.results[0][0].transcript; $('voice-status').textContent = 'Review the transcript, then choose Ask about locations. No region has been added.'; };
  current.onerror = event => { $('voice-status').textContent = `Voice input: ${event.error}. You can type your question instead.`; };
  current.onend = () => { if (recognition === current) { recognition = null; resetVoiceButton(); } };
  try { current.start(); } catch (error) { recognition = null; resetVoiceButton(); $('voice-status').textContent = error.message; }
});
let utterance = null;
function stopReading() { window.speechSynthesis?.cancel(); utterance = null; $('voice-read').textContent = 'Read guidance aloud'; }
$('voice-read').addEventListener('click', () => {
  if (utterance) { stopReading(); return; }
  recognition?.abort();
  const language = $('voice-language').value;
  const current = new SpeechSynthesisUtterance($('assistant-answer').textContent);
  current.lang = /[\u3400-\u9fff]/.test(current.text) ? (language.startsWith('zh') ? language : 'zh-HK') : 'en-US';
  const voice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase() === current.lang.toLowerCase());
  if (voice) current.voice = voice;
  utterance = current; $('voice-read').textContent = 'Stop reading';
  current.onend = () => { if (utterance === current) { utterance = null; $('voice-read').textContent = 'Read guidance aloud'; } };
  current.onerror = event => { if (utterance === current) { stopReading(); $('voice-status').textContent = `Speech output: ${event.error}. Read the guidance below instead.`; } };
  window.speechSynthesis.speak(current);
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
        <details><summary>Factors, assumptions and checks</summary><ul>${result.items.map((item) => `<li>${REGION_TYPES[item.regionType]}: installation ${item.factors.installationKgCo2eM2.value} kgCO₂e/m²; assumed avoided emissions ${item.factors.annualAvoidedKgCo2eM2.value} kgCO₂e/m²/year; added load ${item.factors.addedLoadKgM2.value} kg/m².</li>`).join('')}${result.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul><p>All factors are presentation assumptions. Region uses and usable areas are user-confirmed, not structural approval. Planting markers are indicative.</p></details>
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
  $('confirm-area').checked = false;
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
  $('add-region').disabled = !draftRegion || !$('confirm-area').checked || !$('confirm-constraints').checked || importing || !Number.isFinite(area) || area <= 0 || area > draftRegion.geometryAreaM2 * 1.001;
}
$('area').addEventListener('input', refreshRegionConfirmation);
$('confirm-area').addEventListener('change', refreshRegionConfirmation);
$('confirm-constraints').addEventListener('change', refreshRegionConfirmation);
$('add-region').addEventListener('click', () => {
  try {
    viewer.confirmRegion(draftRegion.id, Number($('area').value), $('confirm-constraints').checked);
    invalidateRegionDraft();
    selected = lastPlan;
    viewer.setPlan(PLANS.find((plan) => plan.id === selected), true);
    render();
    $('region-draft-status').textContent = 'Region added to both plans. Open Compare or select another component to continue.';
    showStatus('Showing proposed planting. Use Before / After to compare the same model.');
  } catch (error) { $('region-draft-status').textContent = error.message; }
});
function showRegions(regions) {
  plannedRegions = regions;
  if (!regions.length) { selected = null; invalidateRegionDraft(); }
  $('region-count').textContent = String(regions.length);
  $('region-list').replaceChildren();
  for (const region of regions) {
    const item = document.createElement('li'), text = document.createElement('span'), note = document.createElement('small'), remove = document.createElement('button');
    text.textContent = `${REGION_TYPES[region.type]} · ${region.usableArea.value.toFixed(2)} m²`;
    note.textContent = region.name; text.append(note);
    remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${region.name}`);
    remove.addEventListener('click', () => viewer.removeRegion(region.id));
    item.append(text, remove); $('region-list').append(item);
  }
  if (!regions.length) {
    const empty = document.createElement('li'); empty.className = 'empty-text'; empty.textContent = 'No regions added yet.'; $('region-list').append(empty);
  }
  render();
}
function setPreview(planId) {
  if (!plannedRegions.length) { openPanel('inspector-panel'); showStatus('Add a confirmed region before previewing planting.'); return; }
  selected = planId;
  if (planId) { lastPlan = planId; viewer.setPlan(PLANS.find((plan) => plan.id === planId), true); }
  else viewer.setBeforeAfter(false);
  render();
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
  selectedComponent = selection; invalidateRegionDraft();
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
  openPanel('inspector-panel', { focus: false });
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
  $('show-grid').disabled = importing || !viewer;
  $('clear-selection').disabled = importing || !loadedModel;
  $('prepare-region').disabled = importing || !loadedModel || !viewer || (!selectedComponent && $('region-type').value !== 'ground');
  $('analyse-building').disabled = $('assistant-ask').disabled = importing || !loadedModel || analysing;
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
  finally { importing = false; refreshImportControls(); void refreshCandidates(); }
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
  finally { importing = false; refreshImportControls(); void refreshCandidates(); }
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
    onSelection: showSelection,
    onRegions: showRegions,
    onStatus: showStatus,
    onZoom: (percent) => {
      $('zoom-indicator').hidden = percent === null;
      if (percent !== null) $('zoom-percent').textContent = `${percent}%`;
    },
    onModel: (model) => {
      assistantEpoch++; analysing = false; candidateCache.clear(); stopVoice();
      $('voice-read').disabled = true;
      $('assistant-candidates').replaceChildren();
      $('assistant-answer').textContent = 'Find candidates for the current model. Nothing is added automatically.';
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
