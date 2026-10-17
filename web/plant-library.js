import { filterPlantLibrary, plantSeasonLabel } from '../src/domain/plant-library.js';
import { plantCarbonEvidence } from '../src/domain/plant-carbon.js';

const regions = { roof: 'Roof / 屋顶', facade: 'Facade / 立面', terrace: 'Terrace / 露台', ground: 'Ground / 庭院' };
const demand = { low: 'Low / 低', moderate: 'Moderate / 中', high: 'High / 高' };
const forms = { 'succulent-groundcover': 'Succulent groundcover / 多肉地被', groundcover: 'Groundcover / 地被', 'trailing-groundcover': 'Trailing groundcover / 垂生地被', 'fernlike-groundcover': 'Fernlike groundcover / 蕨状地被', 'bulb-groundcover': 'Bulb groundcover / 球根地被', 'grasslike-groundcover': 'Grasslike groundcover / 草状地被', climber: 'Climber / 攀爬植物' };
const supports = { 'self-clinging': 'Self-clinging; review wall finish / 自攀附，需检查墙面', 'trellis-or-planter-system': 'Trellis / planter system / 支架或种植槽系统', 'self-clinging-mesh-recommended': 'Self-clinging; wire mesh recommended / 自攀附，建议网架' };
const toleranceNames = { wind: 'Wind / 抗风', saltSpray: 'Salt spray / 耐盐雾', drought: 'Drought / 耐旱', pollution: 'Pollution / 耐污染', shade: 'Shade / 耐阴' };
const unknown = 'To confirm / 待确认';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function link(text, url) {
  const element = node('a', text);
  element.href = url; element.target = '_blank'; element.rel = 'noopener noreferrer';
  return element;
}
function referencePhoto(plant, className, { lazy = true } = {}) {
  const figure = node('div', undefined, className);
  const img = node('img'); img.src = plant.image.src; img.alt = plant.image.alt;
  img.width = 960; img.height = 720; img.loading = lazy ? 'lazy' : 'eager'; img.decoding = 'async';
  img.addEventListener('error', () => { img.hidden = true; figure.append(node('span', 'Photo unavailable / 图片暂不可用')); }, { once: true });
  figure.append(img); return figure;
}
function factList(items) {
  const list = node('dl', undefined, 'catalog-facts');
  for (const [label, value] of items) {
    const pair = node('div'); pair.append(node('dt', label), node('dd', value)); list.append(pair);
  }
  return list;
}
function section(title, ...content) {
  const block = node('section', undefined, 'catalog-section');
  block.append(node('h4', title), ...content); return block;
}
function carbonSection(plant) {
  const evidence = plantCarbonEvidence(plant);
  const block = section('Carbon benefits / 碳效益依据', node('p', evidence.summary, 'catalog-carbon-summary'));
  if (evidence.estimate) {
    const e = evidence.estimate, range = e.annualBiomassCo2PotentialPerM2;
    block.append(factList([
      ['Annual Biomass Carbon Sequestration Potential · Analogous Estimation', `${range.min.toFixed(2)}–${range.max.toFixed(2)} kg CO₂/㎡/year`],
      ['Area Basis',e.areaBasis],['Reference Annual Dry Matter Yield',`${e.annualDryBiomassKgPerM2.min}–${e.annualDryBiomassKgPerM2.max} kg/m²/year`],
      ['Calculation Method',`Dry Matter Yield × Assumed Carbon Content ${e.assumedCarbonFraction*100}% × 44/12`]
    ]),node('p',e.limitations,'note'));
    const details=node('details',undefined,'catalog-more');details.append(node('summary','Estimation Assumptions and Sources'));
    for(const assumption of e.assumptions)details.append(node('p',assumption,'note'));
    for(const source of e.sources)details.append(link(source.title,source.url),node('p',source.locator,'note'));
    block.append(details);
  }
  for (const reference of evidence.references) {
    const numeric = reference.referenceValueKgCo2PerM2;
    if (numeric !== null) {
      const annual = reference.referencePeriod === 'annualized-observation';
      block.append(factList([
        [annual ? 'Study on Annualized Net Carbon Sequestration (Plants + Substrate)' : 'Study on First-Year Carbon Stock Increase (Plants + Substrate)', `${numeric.toFixed(2)} kg CO₂/㎡${annual ? '/year' : '(First Year Only)'}`],
        ['Original Study Value', `${annual ? reference.netUptakeGramsCPerM2Year : reference.firstYearStockIncreaseGramsCPerM2} g C/㎡${annual ? '/year' : '(First-Year Increment)'}`],
        ['Study Conditions', reference.site],['Conversion Method', 'g C ÷ 1000 × 44/12 = kg CO₂']
      ]));
    }
    const details = node('details', undefined, 'catalog-more');
    details.append(node('summary', `Research Sources and Applicability Conditions · ${reference.year}`), node('p', reference.observation), node('p', reference.applicability, 'note'),
      link(reference.title, reference.url), node('p', `${reference.locator ?? 'Published abstract'} · Verify ${reference.reviewedAt}`, 'note'));
    block.append(details);
  }
  block.append(node('p', 'Annual net emission reduction for this project: Not yet verified. Electricity savings must be calculated based on building, orientation, and climate; no fixed ratio per plant is applied. Different research methods and conditions cannot be directly ranked; missing data does not equal zero, and multi-year extrapolation or offsetting of construction emissions is not automatic.', 'note'));
  return block;
}

export function createPlantLibrary({ catalog, onOpen, onChoose }) {
  const $ = id => document.getElementById(id);
  let selectedId = catalog.plants[0]?.id;
  let previewEpoch = 0, disposePreview = null;
  function renderDetail(plant) {
    previewEpoch++; disposePreview?.(); disposePreview = null;
    const detail = $('catalog-detail'); detail.replaceChildren();
    if (!plant) { detail.append(node('p', 'Choose a plant after adjusting filters. / 调整筛选后选择植物', 'note')); return; }
    const heading = node('div', undefined, 'catalog-detail-heading');
    heading.append(node('p', forms[plant.growthForm], 'eyebrow'), node('h3', plant.commonNameEn), node('p', plant.commonNameZh, 'catalog-chinese'), node('p', plant.scientificName, 'plant-latin'));
    const credit = node('p', undefined, 'catalog-photo-credit');
    credit.append('Reference photo · ', link(plant.image.author, plant.image.sourceUrl), ' · ', link(plant.image.license, plant.image.licenseUrl), ' · CSS thumbnail crop; detail uncropped. Colour varies by cultivar.');
    const badges = node('div', undefined, 'catalog-badges');
    for (const region of plant.applicationRegions) badges.append(node('span', regions[region]));
    const choose = node('button', 'Use at selected location / 用于所选位置', 'catalog-use-plant'); choose.type = 'button';
    const choiceStatus = node('p', undefined, 'note'); choiceStatus.setAttribute('role','status');
    choose.addEventListener('click', () => { try { onChoose?.(plant.id); } catch(error) { choiceStatus.textContent = error.message; } });
    const model = node('details', undefined, 'catalog-model'), modelBox = node('div', undefined, 'catalog-model-viewport'), modelStatus = node('p', 'Drag to rotate · scroll to zoom. Concept proportions; not a verified mature specimen.', 'note');
    model.append(node('summary', '3D plant model / 查看植物模型'), modelBox, modelStatus);
    const modelDownload = link('Download concept GLB / 下载模型', plant.visualModel.src);modelDownload.setAttribute('download', `${plant.id}.glb`); model.append(modelDownload);
    model.addEventListener('toggle', async () => {
      const epoch = ++previewEpoch; disposePreview?.(); disposePreview = null;
      if (!model.open) return;
      try {
        const { showPlantModelPreview } = await import('./plant-model-preview.js');
        if (epoch !== previewEpoch || !model.isConnected || !model.open) return;
        disposePreview = showPlantModelPreview(modelBox, plant.id);
      } catch(error) { if (epoch === previewEpoch) modelStatus.textContent = `Preview unavailable: ${error.message}. Download the GLB instead.`; }
    });
    detail.append(referencePhoto(plant, 'catalog-hero-photo', { lazy: false }), heading, choose, choiceStatus, model, credit, node('p', plant.description, 'catalog-description'));
    detail.append(carbonSection(plant));
    if (plant.id === 'ophiopogon-japonicus') {
      detail.append(section('Model study / 模型试作',
        link('Compare Mondo grass draft / 查看麦冬试作对照', '/mondo-study.html'),
        node('p', 'Reference-derived draft; whole-clump shape remains inferred. Preview and compare before replacing the current concept model. / 参考照片试作，完整株形仍为推测。', 'note')));
    }
    detail.append(section('Suitable locations / 适合种哪', badges, node('p', 'Concept applications; exterior space, structural loading and services require site review. Terrace and ground use are project mappings.', 'note')));
    detail.append(section('Growing conditions / 生长条件', factList([
      ['Guide soil depth / 参考土层', `${plant.referenceSoilDepthMm.min}–${plant.referenceSoilDepthMm.max} mm`],
      ['Light / 光照需求', plant.sunlightRequirement ?? (plant.tolerances.shade === true ? 'Shade tolerant; optimal light unconfirmed / 耐阴，最佳光照待确认' : unknown)],
      ['Hong Kong native / 本地品种', plant.nativeToHongKong === null ? unknown : plant.nativeToHongKong ? 'Yes / 是' : 'No / 否'],
      ['Foliage / 叶性', plant.evergreen === null ? unknown : plant.evergreen ? 'Evergreen / 常绿' : 'Deciduous / 落叶'],
      ['Climbing support / 攀爬支撑', plant.facadeSupport ? supports[plant.facadeSupport] : 'Not applicable / 非攀爬类']
    ]), node('p', 'Soil depth is guide information; it does not establish roof load capacity.', 'note')));
    const months = node('div', undefined, 'catalog-months');
    months.setAttribute('aria-label', plantSeasonLabel(plant));
    for (let month = 1; month <= 12; month++) {
      const active = plant.seasonalInterest?.months.includes(month);
      const cell = node('span', String(month), active ? 'in-season' : '');
      cell.title = `${month} Month · ${active ? 'Recorded ornamental interest' : 'No ornamental month recorded; not an unsuitable month'}`; months.append(cell);
    }
    detail.append(section('Season / 季节', node('p', plantSeasonLabel(plant), 'note'), months, node('p', 'Highlighted months = ornamental interest. Planting season is unconfirmed; blank months do not mean unsuitable.', 'note')));
    detail.append(section('Water & maintenance / 水源与养护', factList([
      ['Water demand / 需水等级', demand[plant.irrigationDemand] ?? unknown],
      ['Daily water volume / 每日水量', unknown],
      ['Water quality / 水质要求', unknown],
      ['Pruning demand / 修剪等级', demand[plant.pruningDemand] ?? unknown],
      ['Irrigation method / 灌溉方式', unknown]
    ]), node('p', 'Confirm water point, reliable supply and drainage for the site. Rainwater / recycled-water compatibility and watering schedules need horticultural review. These are site checks, not established species requirements.', 'note')));
    const tolerances = node('div', undefined, 'catalog-tolerances');
    for (const [key, value] of Object.entries(plant.tolerances)) {
      tolerances.append(node('span', `${toleranceNames[key]} · ${value === true ? 'Recorded / 已记录' : 'Unknown / 未核实'}`, value === true ? 'recorded' : ''));
    }
    detail.append(section('Environmental tolerance / 环境适应', tolerances));
    const checks = node('details', undefined, 'catalog-more'); checks.append(node('summary', 'Further checks / 还需核实'));
    checks.append(node('p', 'Mature height / spread, toxicity, pest risks, fertilising schedule and planting season have not yet been verified. Confirm these before final selection.', 'note'));
    const sources = node('div', undefined, 'catalog-sources');
    for (const source of plant.sources) sources.append(link(source.title, source.url), node('p', `Page ${source.page} · reviewed ${source.reviewedAt}`, 'note'));
    detail.append(checks, section('Sources / 资料来源', sources));
    detail.scrollTop = 0;
  }
  function render() {
    const plants = filterPlantLibrary(catalog.plants, { query: $('catalog-search').value, region: $('catalog-region').value, nativeOnly: $('catalog-native').checked });
    if (!plants.some(plant => plant.id === selectedId)) selectedId = plants[0]?.id;
    $('catalog-count').textContent = `${plants.length} / ${catalog.plants.length} plants · 植物`;
    $('catalog-empty').hidden = plants.length > 0;
    const list = $('catalog-list'); list.replaceChildren();
    for (const plant of plants) {
      const button = node('button', undefined, 'catalog-item'); button.type = 'button';
      button.setAttribute('aria-pressed', String(plant.id === selectedId)); button.setAttribute('aria-controls', 'catalog-detail');
      const identity = node('span', undefined, 'catalog-item-name');
      identity.append(node('strong', plant.commonNameEn), node('span', plant.commonNameZh), node('small', plant.scientificName), node('small', `${demand[plant.irrigationDemand]} water · ${plant.referenceSoilDepthMm.min}–${plant.referenceSoilDepthMm.max} mm guide soil`));
      identity.append(node('small', `Carbon Benefits:${plantCarbonEvidence(plant).summary}`, 'catalog-carbon-status'));
      button.append(referencePhoto(plant, 'catalog-thumb'), identity);
      button.addEventListener('click', () => {
        selectedId = plant.id;
        for (const item of list.children) item.setAttribute('aria-pressed', String(item === button));
        renderDetail(plant);
        // The detail follows the list on small screens; bring it into view after choosing.
        if (window.matchMedia('(max-width: 680px)').matches) $('catalog-detail').scrollIntoView({ block: 'start', behavior: 'instant' });
      });
      list.append(button);
    }
    renderDetail(plants.find(plant => plant.id === selectedId));
  }
  for (const id of ['catalog-search', 'catalog-region', 'catalog-native']) $(id).addEventListener('input', render);
  function reset() { $('catalog-search').value = ''; $('catalog-region').value = 'all'; $('catalog-native').checked = false; }
  $('catalog-reset').addEventListener('click', () => { reset(); render(); $('catalog-search').focus(); });
  function close() { previewEpoch++; disposePreview?.(); disposePreview=null; const model=$('catalog-detail').querySelector('.catalog-model');if(model)model.open=false; }
  render();
  return { close, open(id) {
    if (id && catalog.plants.some(plant => plant.id === id)) { reset(); selectedId = id; render(); }
    onOpen();
  } };
}
