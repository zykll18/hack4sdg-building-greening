import { calculateScenario } from '../src/domain/calculate.js';
import { demoRoof, demoScenarios } from '../src/data/demo.js';

const $ = (id) => document.getElementById(id);
const money = (value) => `HK$${Math.round(value).toLocaleString('en-HK')}`;
const number = (value) => Math.round(value).toLocaleString('en-HK');
let selected = 'extensive';
let viewer;
let importing = false;
let areaEdited = false;
let loadedModel = null;

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
    panel.textContent = 'Click a component to view its IFC identity and attributes.';
    return;
  }
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
  $('fit-model').disabled = importing || !loadedModel;
  $('clear-selection').disabled = importing || !loadedModel;
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
$('load-sample').addEventListener('click', async () => {
  if (importing || !viewer) return;
  importing = true;
  refreshImportControls();
  showStatus('Loading the buildingSMART architecture sample…');
  try {
    const response = await fetch('/samples/Building-Architecture.ifc', { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Sample download returned HTTP ${response.status}`);
    const file = new File([await response.arrayBuffer()], 'Building-Architecture.ifc');
    await viewer.openIfc(file);
  } catch (error) { showStatus(`Could not load the sample: ${error.message}. You can select a local IFC file instead.`); }
  finally { importing = false; refreshImportControls(); }
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
    for (const id of ['view-before', 'view-extensive', 'view-intensive']) $(id).classList.toggle('active', id === buttonId);
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
      $('project-label').textContent = model?.fileName ?? 'No IFC loaded';
      $('model-status-label').textContent = model ? `${model.componentCount.toLocaleString()} components` : 'Ready to import';
      $('viewer-badge').textContent = model ? 'IFC geometry' : 'No model loaded';
      refreshImportControls();
    }
  });
  showStatus('3D viewer ready. Select an IFC file or load the building sample.');
  refreshImportControls();
} catch (error) {
  showStatus(`Could not initialize the 3D viewer: ${error.message}`);
}
if (import.meta.hot) import.meta.hot.dispose(() => { void viewer?.dispose(); });
