// Presentation shell only. Model identity, regions and calculations stay in main.js.
const pageNames = new Set(['dashboard', 'calculator', 'flora']);
const amount = new Intl.NumberFormat('en-HK', { maximumFractionDigits: 1 });
const carbonAmount = new Intl.NumberFormat('en-HK', { maximumFractionDigits: 2 });

export function summarizeWorkspace(state) {
  const result = state.results?.find(item => item.planId === state.planId);
  const referenceRange = result?.carbonModel?.modelledScopeChangeKgCo2e;
  const referenceOnly = result?.netDifferenceKgCo2e === null && referenceRange;
  return {
    modelName: state.buildingName || state.model?.fileName || 'Choose a building to begin',
    modelBadge: state.model ? state.model.sourceFormat === 'frag' ? 'Fragments' : 'IFC model' : 'Example preview',
    modelDetail: state.model ? `${amount.format(state.model.componentCount)} components · ${state.regions.length} planted locations` : 'Open Calculator to load an example or import your IFC.',
    locations: String(state.regions.length),
    area: result ? `${amount.format(result.coverageM2)} m²` : '—',
    plan: result?.planName ?? '当前绿化方案 / Current planting',
    years: Number.isInteger(state.years) && state.years > 0 ? `${state.years} years` : 'Check inputs',
    cost: result ? result.installationCostHkd === null ? '费用待补' : `HK$${amount.format(result.installationCostHkd)}` : '—',
    carbonLabel: referenceOnly ? '碳排粗估（施工＋屋顶传热）' : '净碳排变化（项目输入）',
    carbon: referenceOnly ? `约 ${carbonAmount.format(referenceRange.min / 1000)}${carbonAmount.format(referenceRange.min / 1000) === carbonAmount.format(referenceRange.max / 1000) ? '' : '–' + carbonAmount.format(referenceRange.max / 1000)} tCO₂e` : result ? result.netDifferenceKgCo2e === null ? '待补数据' : `${result.netDifferenceKgCo2e < 0 ? '−' : '+'}${carbonAmount.format(Math.abs(result.netDifferenceKgCo2e) / 1000)} tCO₂e` : '—',
    carbonDetail: referenceOnly ? result.years + '年参考范围 · 非整栋建筑' : result ? result.netDifferenceKgCo2e === null ? 'Supply carbon evidence in Compare' : `${result.years}-year input estimate · ${result.netDifferenceKgCo2e < 0 ? 'reduction' : result.netDifferenceKgCo2e > 0 ? 'increase' : 'no change'}` : 'Add planting to compare impacts'
  };
}

export function createWorkspaceShell({ catalog, samples, getState, onRouteChange, onOpenPanel, onOpenSample, onExport }) {
  let currentPage = null;
  const $ = id => document.getElementById(id);
  function pageFromHash() {
    const page = location.hash.replace(/^#\/?/, '').split('/')[0];
    return pageNames.has(page) ? page : 'dashboard';
  }
  function update() {
    const state = getState();
    const result = state.results?.find(item => item.planId === state.planId);
    const loaded = Boolean(state.model);
    const summary = summarizeWorkspace(state);
    for (const element of document.querySelectorAll('[data-summary]')) {
      const value = summary[element.dataset.summary];
      if (value !== undefined && element.textContent !== value) element.textContent = value;
    }
    const sample = Object.values(samples).find(item => item.name === state.model?.fileName) ?? (!loaded ? samples[state.sampleId] : null);
    const preview = $('dashboard-model-image');
    preview.hidden = !state.preview && !sample?.preview;
    $('dashboard-custom-model').hidden = Boolean(state.preview || sample?.preview);
    if (state.preview || sample?.preview) {
      const src = state.preview || `/samples/${sample.preview}`;
      if (preview.getAttribute('src') !== src) preview.src = src;
      preview.alt = state.preview ? `${state.model.fileName} saved building and planting view` : `${sample.name} reference geometry preview`;
    }
    const note = state.error ?? '碳排按适用位置的种植面积粗估，依据可在 Compare 查看。费用为可选输入；现场与工程条件仍需核对。';
    $('dashboard-summary-note').textContent = note;
    $('calculator-next-step').textContent = state.regions.length ? 'Adjust planting in Inspect, compare it with the original building, or export the report.' : 'Click a suitable building location, or ask for a planting recommendation.';
    for (const button of document.querySelectorAll('[data-shell-export]')) button.disabled = !result;
    $('catalog-target-status').textContent = state.targetName ? `Planting at ${state.targetName}` : 'Browsing profiles · choose a building location to apply a plant';
  }
  function applyRoute() {
    const page = pageFromHash();
    if (page === currentPage) return;
    const previousPage = currentPage;
    currentPage = page;
    for (const section of document.querySelectorAll('.app-page[data-view]')) section.hidden = section.dataset.view !== page;
    for (const link of document.querySelectorAll('[data-route]')) {
      if (link.dataset.route === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.body.dataset.view = page;
    onRouteChange(page, previousPage);
    update();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function navigate(page) {
    if (!pageNames.has(page)) return;
    const hash = `#/${page}`;
    if (location.hash !== hash) location.hash = hash;
    applyRoute();
  }
  function handleAction(event) {
    const button = event.target.closest('[data-open-panel], [data-shell-export]');
    if (!button || button.disabled) return;
    if (button.dataset.openPanel) {
      navigate('calculator');
      onOpenPanel(button.dataset.openPanel);
    } else onExport(button.dataset.shellExport);
  }
  for (const [id, sample] of Object.entries(samples).filter(([, item]) => item.preview)) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'glass-card sample-card';
    const image = document.createElement('img'); image.src = `/samples/${sample.preview}`; image.alt = `${sample.name} reference geometry preview`; image.loading = 'lazy';
    const info = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = sample.title ?? (id === 'duplex-apartment' ? 'Duplex apartment' : id === 'kit-office' ? 'KIT office' : id === 'kit-house' ? 'KIT house' : 'Schependomlaan residence');
    const subtitle = document.createElement('small'); subtitle.textContent = sample.subtitle ?? (id === 'duplex-apartment' ? 'Flat-roof IFC · 2.4 MB' : id === 'schependomlaan' ? 'Residential IFC · 49.3 MB' : id === 'kit-office' ? 'Architectural IFC · 10.9 MB' : 'Architectural IFC · 2.6 MB');
    info.append(title, subtitle); card.append(image, info);
    card.addEventListener('click', () => onOpenSample(id));
    $('dashboard-samples').append(card);
  }
  $('view-flora').querySelector('.flora-intro h2').textContent = `${catalog.plants.length} species. One connected library.`;
  document.addEventListener('click', handleAction);
  window.addEventListener('hashchange', applyRoute);
  return { navigate, update, start: applyRoute, get page() { return currentPage; }, dispose() { document.removeEventListener('click', handleAction); window.removeEventListener('hashchange', applyRoute); } };
}
