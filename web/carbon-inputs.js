import { carbonBasis, assessInterventionCarbon } from '../src/domain/carbon-assessment.js';
import { CARBON_METHOD, ELECTRICITY_FACTORS, GREEN_ROOF_EPD, GREENING_RESEARCH } from '../src/data/carbon-evidence.js';

function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}
function sourceLink(source) {
  const link = node('a', source.title ?? source.product);
  link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
const fieldLabels = {
  upfrontKgCo2e: '新增材料、运输及施工 / Upfront (kgCO₂e)',
  annualMaintenanceKgCo2e: '每年非用电维护 / Annual maintenance (kgCO₂e/year)',
  replacementKgCo2e: '比较期内更换 / Period replacement (kgCO₂e)',
  endOfLifeKgCo2e: '比较期内拆除处置 / Period disposal (kgCO₂e)',
  baselineKwhPerYear: '同一基准建筑年用电 / Baseline (kWh/year)',
  afterKwhPerYear: '实施后建筑及灌溉年用电 / After (kWh/year)'
};
export function createCarbonInputs({ container, plans, getCalculationInputs, onChange }) {
  const accepted = new Map(), forms = [];
  const intro = node('p', '净差额 = 新增材料施工 + 期内维护、更换、处置 + 前后用电排放变化。所有值对应当前完整方案；零值也需要依据。');
  intro.className = 'note'; container.append(intro);
  const sources = node('details'), list = node('ul');
  sources.append(node('summary', '核验过的依据 / Reviewed sources'));
  for (const source of [CARBON_METHOD.standard, ...ELECTRICITY_FACTORS, ...GREENING_RESEARCH]) {
    const item = node('li'); item.append(sourceLink(source));
    if (source.value != null) item.append(` · ${source.year}: ${source.value} ${source.unit}`);
    list.append(item);
  }
  sources.append(list);
  const epd = node('p'); epd.append(sourceLink(GREEN_ROOF_EPD), ` · ${GREEN_ROOF_EPD.id} · 1 m² · GWP-total`);
  const table = node('table'); table.className = 'region-breakdown';
  const header = node('tr'); header.append(node('th', '模块 / Module'), node('th', 'kgCO₂e/m²')); table.append(header);
  for (const [module, value] of Object.entries(GREEN_ROOF_EPD.modules)) {
    const row = node('tr'); row.append(node('td', module === 'D' ? 'D（单列，不抵扣）' : module), node('td', String(value))); table.append(row);
  }
  sources.append(epd, table, node('p', '德国特定产品的声明示例；B1–B7 未声明。香港运输、构造及处置需另核实，不会自动套用。'));
  container.append(sources);
  for (const plan of plans) {
    const details = node('details'), form = node('form'), fields = {};
    details.className = 'carbon-input-card';
    details.append(node('summary', `${plan.name} · 碳数据`));
    const grid = node('div'); grid.className = 'carbon-input-grid';
    for (const [id, label] of Object.entries(fieldLabels)) {
      const wrap = node('label', label), input = node('input');
      input.type = 'number'; input.min = '0'; input.step = 'any'; input.name = id;
      input.setAttribute('aria-label', `${plan.name} ${label}`);
      wrap.append(input); fields[id] = input; grid.append(wrap);
    }
    form.append(grid);
    const providerWrap = node('label', '电力供应商与年份 / Electricity factor'), provider = node('select');
    provider.name = 'electricityFactorId'; provider.setAttribute('aria-label', `${plan.name} Electricity factor`);
    provider.append(new Option('选择供应商 / Select provider', ''));
    for (const factor of ELECTRICITY_FACTORS) provider.append(new Option(`${factor.provider} · ${factor.year} · ${factor.value} kgCO₂e/kWh`, factor.id));
    providerWrap.append(provider); form.append(providerWrap); fields.electricityFactorId = provider;
    const basisWrap = node('label', '用电数据类型 / Energy basis'), basis = node('select');
    basis.name = 'energyBasis'; basis.setAttribute('aria-label', `${plan.name} Energy basis`);
    for (const [value, text] of [['scenario', '情景输入 / Scenario'], ['modelled', '项目模拟 / Modelled'], ['measured', '项目计量 / Measured']]) basis.append(new Option(text, value));
    basisWrap.append(basis); form.append(basisWrap); fields.energyBasis = basis;
    for (const [id, text] of [['lifecycleSource', '材料与维护更换处置来源（注明清单、EPD、模块或零值理由）'], ['energySource', '前后用电来源（注明模拟或计量、同一气候与使用条件）']]) {
      const wrap = node('label', text), input = node('textarea'); input.rows = 2; input.maxLength = 2000; input.name = id;
      input.setAttribute('aria-label', `${plan.name} ${id}`); wrap.append(input); fields[id] = input; form.append(wrap);
    }
    form.append(node('p', '材料与维护总量为相对无绿化基准的增量；用电输入须包含灌溉等新增用电，避免重复计入维护。未发生更换或处置可填 0 并说明原因。历史电力因子固定用于所选比较期，不是未来预测。'));
    const apply = node('button', '应用当前碳数据 / Apply carbon inputs'); apply.type = 'submit'; apply.className = 'secondary-button';
    const status = node('p'); status.className = 'note'; status.setAttribute('role', 'status');
    form.append(apply, status); details.append(form); container.append(details);
    const entry = { plan, form, fields, status, apply }; forms.push(entry);
    form.addEventListener('input', () => { accepted.delete(plan.id); status.textContent = '输入已修改，尚未应用。'; onChange(); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const inputs = getCalculationInputs();
        if (!inputs.regions.length) throw new Error('先添加种植位置 / Add planting first');
        const value = id => fields[id].value.trim() === '' ? null : Number(fields[id].value);
        const input = { basis: carbonBasis({ ...inputs, plan }), electricityFactorId: provider.value, energy: null };
        for (const id of ['upfrontKgCo2e', 'annualMaintenanceKgCo2e', 'replacementKgCo2e', 'endOfLifeKgCo2e']) {
          input[id] = value(id) === null ? null : { value: value(id), source: fields.lifecycleSource.value.trim() };
        }
        const before = value('baselineKwhPerYear'), after = value('afterKwhPerYear');
        if (before !== null || after !== null) input.energy = { baselineKwhPerYear: before, afterKwhPerYear: after, basis: basis.value, source: fields.energySource.value.trim() };
        const result = assessInterventionCarbon({ input, basis: input.basis, years: inputs.years });
        accepted.set(plan.id, result.input);
        status.textContent = result.status === 'calculated' ? '已按输入计算。项目数据仍需核验，电力因子来源已保留。' : '已保存已知项目；其余数据未齐，净差额保持待补。';
        onChange();
      } catch (error) { status.textContent = error.message; }
    });
  }
  return {
    get: planId => accepted.get(planId),
    serialize() { return forms.map(entry => ({ planId: entry.plan.id, accepted: accepted.get(entry.plan.id) ?? null, fields: Object.fromEntries(Object.entries(entry.fields).map(([name, el]) => [name, el.value])) })); },
    restore(saved) {
      this.clear();
      if (!saved) return;
      if (!Array.isArray(saved) || saved.length > plans.length) throw new Error('Invalid saved carbon forms');
      for (const value of saved) {
        const entry = forms.find(item => item.plan.id === value.planId); if (!entry) throw new Error('Unknown saved carbon plan');
        for (const [name, el] of Object.entries(entry.fields)) if (typeof value.fields?.[name] === 'string') el.value = value.fields[name].slice(0, 2000);
        if (value.accepted) { const data = getCalculationInputs(); const result = assessInterventionCarbon({ input: value.accepted, basis: value.accepted.basis, years: data.years }); accepted.set(entry.plan.id, result.input); }
      }
      this.refresh();
    },
    refresh() {
      const inputs = getCalculationInputs();
      for (const entry of forms) {
        entry.apply.disabled = !inputs.regions.length;
        const input = accepted.get(entry.plan.id);
        if (input && input.basis !== carbonBasis({ ...inputs, plan: entry.plan })) entry.status.textContent = '模型、位置、物种、覆盖率或年限已变；请重新核对并应用数据。';
      }
    },
    clear() { accepted.clear(); for (const entry of forms) { entry.form.reset(); entry.status.textContent = ''; } },
    dispose() { accepted.clear(); container.replaceChildren(); }
  };
}
