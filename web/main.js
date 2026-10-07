import { calculateScenario } from '../src/domain/calculate.js';
import { demoRoof, demoScenarios } from '../src/data/demo.js';

const $ = (id) => document.getElementById(id);
const money = (value) => `HK$${Math.round(value).toLocaleString('en-HK')}`;
const number = (value) => Math.round(value).toLocaleString('en-HK');
let selected = null;
let viewer;
let importing = false;
let areaEdited = false;
let loadedModel = null;
const samples = {
  'kit-office': { name: 'KIT-Office.ifc', format: 'ifc', preview: 'KIT-Office-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'Architectural office design example from KIT: exterior walls, windows and roof geometry. Fictional design, not a verified built project. 10.9 MB.' },
  'schependomlaan': { name: 'Schependomlaan.ifc', format: 'ifc', preview: 'Schependomlaan-preview.png', source: 'https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/main/IFC%202.3.0.1%20%28IFC%202x3%29/Schependomlaan', description: 'ROOT architectural design model for the Schependomlaan residential project. Published with project and construction data. 49.3 MB; conversion can take longer.' },
  'kit-house': { name: 'KIT-FZK-Haus.ifc', format: 'ifc', preview: 'KIT-FZK-Haus-preview.png', source: 'https://www.ifcwiki.org/index.php?title=KIT_IFC_Examples', description: 'KIT architectural house design example, with windows, doors and pitched roof. Fictional design; compact import test. 2.6 MB.' },
  'school-arq': { name: 'school_arq.frag', format: 'frag', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open architecture model. Preconverted Fragments for visual comparison.' },
  'school-str': { name: 'school_str.ifc', format: 'ifc', source: 'https://github.com/ThatOpen/engine_components/tree/8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922/resources', description: 'Official That Open structural school model. Tests the full IFC import pipeline; facade finishes are not included.' },
  'test-house': { name: 'Building-Architecture.ifc', format: 'ifc', source: 'https://github.com/buildingSMART/Sample-Test-Files', description: 'Compact buildingSMART test house. 13 display components for quick import and identity checks.' }
};

function render() {
  const area = Number($('area').value);
  const years = Number($('years').value);
  const budget = $('budget').value === '' ? undefined : Number($('budget').value);
  const roof = { ...demoRoof, usableArea: { value: area, unit: 'm2', provenance: areaEdited ? 'user-confirmed' : 'assumed', source: areaEdited ? 'Entered in prototype; requires project verification' : demoRoof.usableArea.source } };
  try {
    const cards = demoScenarios.map((scenario) => {
      const result = calculateScenario({ roof, scenario, years, budgetHkd: budget });
      const net = result.netDifferenceKgCo2e;
      return `<article class="scenario ${selected === scenario.id ? 'selected' : ''}">
        <div class="scenario-title"><div><h3>${scenario.name}</h3><p>${scenario.description}</p></div><span>${number(result.coverageM2)} m²</span></div>
        <div class="metrics"><div><small>Installation</small><strong>${money(result.installationCostHkd)}</strong></div><div><small>${years}-year cost incl. maintenance</small><strong>${money(result.totalCostHkd)}</strong></div><div><small>${years}-year net carbon difference</small><strong>${net < 0 ? '−' : '+'}${number(Math.abs(net))} kgCO₂e</strong></div></div>
        <p class="metric-explain">${number(result.installationKgCo2e)} kgCO₂e installation − ${number(result.avoidedOperationalKgCo2e)} kgCO₂e assumed operational savings. Negative means a lower modelled total over this period.</p>
        <details><summary>Assumptions and checks</summary><ul><li>Installation: ${scenario.installationKgCo2eM2.value} kgCO₂e/m²</li><li>Annual avoided operational emissions: ${scenario.annualAvoidedKgCo2eM2.value} kgCO₂e/m²/year</li><li>Added load assumption: ${scenario.addedLoadKgM2.value} kg/m²</li>${result.checks.map((check) => `<li>${check}</li>`).join('')}</ul><p>All factors are illustrative demo assumptions.</p></details>
      </article>`;
    });
    $('scenario-results').innerHTML = cards.join('');
    $('error').textContent = '';
  } catch (error) {
    $('scenario-results').innerHTML = '';
    $('error').textContent = error.message;
  }
}

for (const id of ['area', 'years', 'budget']) $(id).addEventListener('input', () => {
  if (id === 'area') areaEdited = true;
  render();
});

function showSelection(selection) {
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
  try { await viewer.openIfc(file); }
  catch (error) { showStatus(`IFC import failed: ${error.message}`); }
  finally { importing = false; refreshImportControls(); }
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
  } catch (error) { showStatus(`Could not load the sample: ${error.message}. You can select a local IFC file instead.`); }
  finally { importing = false; refreshImportControls(); }
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
$('focus-viewer').addEventListener('click', () => {
  const expanded = $('workspace').classList.toggle('focus-mode');
  $('focus-viewer').textContent = expanded ? 'Exit expanded view' : 'Expand view';
  $('focus-viewer').setAttribute('aria-pressed', String(expanded));
});
for (const [id, method] of [['fit-model', 'fit'], ['clear-selection', 'clearSelection']]) {
  $(id).addEventListener('click', async () => {
    try { await viewer?.[method](); }
    catch (error) { showStatus(error.message); }
  });
}
for (const [buttonId, scenarioId] of [['view-before', null], ['view-extensive', 'extensive'], ['view-intensive', 'intensive']]) {
  $(buttonId).addEventListener('click', () => {
    selected = scenarioId;
    for (const id of ['view-before', 'view-extensive', 'view-intensive']) {
      $(id).classList.toggle('active', id === buttonId);
      $(id).setAttribute('aria-pressed', String(id === buttonId));
    }
    render();
  });
}
render();
refreshImportControls();
try {
  const { createBimViewer } = await import('../src/adapters/bim-viewer.js');
  viewer = await createBimViewer($('bim-container'), {
    onSelection: showSelection,
    onStatus: showStatus,
    onModel: (model) => {
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
} catch (error) {
  showStatus(`Could not initialize the 3D viewer: ${error.message}`);
}
if (import.meta.hot) import.meta.hot.dispose(() => { void viewer?.dispose(); });
