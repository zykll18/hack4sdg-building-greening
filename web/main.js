import { calculateScenario } from '../src/domain/calculate.js';
import { demoRoof, demoScenarios } from '../src/data/demo.js';

const $ = (id) => document.getElementById(id);
const money = (value) => `HK$${Math.round(value).toLocaleString('en-HK')}`;
const number = (value) => Math.round(value).toLocaleString('en-HK');
let selected = 'extensive';

function render() {
  const area = Number($('area').value);
  const years = Number($('years').value);
  const budget = $('budget').value === '' ? undefined : Number($('budget').value);
  const roof = { ...demoRoof, usableArea: { value: area, unit: 'm2', provenance: 'user-confirmed', source: 'Entered in prototype; requires project verification' } };
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

for (const id of ['area', 'years', 'budget']) $(id).addEventListener('input', render);
$('ifc-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  $('upload-status').textContent = file
    ? `${file.name} selected. IFC parsing is not connected yet; the comparison still uses demo roof data.`
    : 'IFC import and component selection are the next integration step. This demo uses a separate sample roof.';
});
for (const [buttonId, scenarioId] of [['view-before', null], ['view-extensive', 'extensive'], ['view-intensive', 'intensive']]) {
  $(buttonId).addEventListener('click', () => {
    selected = scenarioId;
    $('green-roof').style.display = scenarioId ? '' : 'none';
    for (const id of ['view-before', 'view-extensive', 'view-intensive']) $(id).classList.toggle('active', id === buttonId);
    render();
  });
}
render();
