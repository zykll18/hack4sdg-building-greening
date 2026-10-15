import { COST_FIELDS, assessProjectCost, costBasis } from '../src/domain/cost-assessment.js';
import { CURRENT_PLAN } from '../src/domain/greening-plan.js';
import { HISTORICAL_ROOF_COST } from '../src/data/cost-evidence.js';

const labels = ['全部新增材料、运输及施工 / Installation (HKD)', '每年维护 / Annual maintenance (HKD/year)'];
const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
export function createCostInputs({ container, getCalculationInputs, onChange }) {
  let accepted = null;
  const form = node('form'), fields = {};
  form.append(node('p', '仅比较安装与日常维护费用。费用输入可选，可填有来源的情景估算、实际支出或报价；没有金额留空。更换与处置不在本次费用范围内，不作为零费用。'));
  for (const [index, name] of COST_FIELDS.entries()) {
    const section = node('fieldset'); section.append(node('legend', labels[index]));
    const amount = node('input'); amount.type = 'number'; amount.min = '0'; amount.step = 'any'; amount.setAttribute('aria-label', labels[index]);
    const date = node('input'); date.type = 'date'; date.setAttribute('aria-label', `${name} 日期`);
    const basis = node('select'); basis.setAttribute('aria-label', `${name} 数据类型`);
    for (const [value, text] of [['scenario', '情景假设'], ['measured', '实际支出'], ['quote', '已有供应商报价']]) basis.append(new Option(text, value));
    const source = node('textarea'); source.rows = 2; source.maxLength = 2000; source.setAttribute('aria-label', `${name} 来源`); source.placeholder = '估算依据或支出/报价记录、包含项目；零值理由';
    for (const [text, input] of [['金额', amount], ['数据日期', date], ['数据类型', basis], ['来源与范围', source]]) { const label = node('label', text); label.append(input); section.append(label); }
    fields[name] = { amount, date, basis, source }; form.append(section);
  }
  const apply = node('button', '应用费用参考 / Apply cost inputs'); apply.type = 'submit'; apply.className = 'secondary-button';
  const status = node('p'); status.setAttribute('role', 'status'); status.className = 'note';
  form.append(apply, status); container.append(form);
  form.addEventListener('input', () => { accepted = null; status.textContent = '费用参考已修改，尚未应用。'; onChange(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = getCalculationInputs(); if (!data.regions.length) throw new Error('先添加种植位置');
      const input = { basis: costBasis({ ...data, plan: CURRENT_PLAN }) };
      for (const name of COST_FIELDS) { const f = fields[name]; input[name] = f.amount.value === '' ? null : { value: Number(f.amount.value), date: f.date.value, source: f.source.value, basis: f.basis.value }; }
      const result = assessProjectCost({ input, basis: input.basis, years: data.years }); accepted = result.input;
      status.textContent = result.status === 'calculated' ? '已按有来源的输入计算；项目数据尚未独立核验。' : '已保存已知费用参考，其余费用待补。'; onChange();
    } catch (error) { status.textContent = error.message; }
  });
  return {
    get: () => accepted,
    refresh() { const data = getCalculationInputs(); apply.disabled = !data.regions.length; if (accepted && accepted.basis !== costBasis({ ...data, plan: CURRENT_PLAN })) status.textContent = '种植方案或年限已变，请重新核对费用参考。'; },
    serialize() { return { accepted, fields: Object.fromEntries(COST_FIELDS.map(name => [name, Object.fromEntries(Object.entries(fields[name]).map(([key, el]) => [key, el.value]))])) }; },
    restore(saved) {
      this.clear(); if (!saved) return;
      for (const name of COST_FIELDS) for (const [key, el] of Object.entries(fields[name])) if (typeof saved.fields?.[name]?.[key] === 'string') el.value = saved.fields[name][key].slice(0, 2000);
      if (saved.accepted) { const data = getCalculationInputs(); assessProjectCost({ input: saved.accepted, basis: saved.accepted.basis, years: data.years }); accepted = saved.accepted; } this.refresh();
    },
    clear() { accepted = null; form.reset(); status.textContent = ''; },
    dispose() { accepted = null; container.replaceChildren(); }
  };
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function costResultMarkup(result) {
  if (!result) return '';
  const money = value => value === null ? '待补数据' : `HK$${value.toLocaleString('en-HK', { maximumFractionDigits: 2 })}`;
  return `<div class="cost-result"><p>${result.status === 'stale' ? '费用参考对应旧方案，需重新核对。' : '项目费用输入（可选）：安装＋日常维护；更换与处置不在范围内。所填来源未独立核验，缺项不按零处理。'}</p><dl>${[['安装', result.installationCostHkd], ['期内维护', result.maintenanceCostHkd]].map(([label, value]) => `<div><dt>${label}</dt><dd>${money(value)}</dd></div>`).join('')}</dl><details><summary>费用来源与日期</summary><ul>${COST_FIELDS.filter(name => result.input?.[name]).map(name => { const q = result.input[name]; return `<li>${escape(q.date)} · ${escape(q.basis)} · ${escape(q.source)}</li>`; }).join('')}</ul></details></div>`;
}
export function historicalCostMarkup(areaM2) {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return '';
  const evidence = HISTORICAL_ROOF_COST;
  const number = value => value.toLocaleString('en-HK', {maximumFractionDigits:0});
  const range = rate => `HK$${number(areaM2*rate.min)}–${number(areaM2*rate.max)}`;
  return `<section class="cost-reference"><h3>网上费用依据 · 香港历史参考</h3><p>按 ${areaM2.toFixed(2)}㎡轻型景天屋顶类比，${evidence.date} 价格，未更新为当前报价。</p><table><tr><th>项目</th><th>历史单价</th><th>按当前面积换算</th></tr><tr><td>安装</td><td>HK$400–1,000/㎡</td><td>${range(evidence.installationPerM2)}</td></tr><tr><td>维护人工（非全包）</td><td>HK$0.8–2.25/㎡/年</td><td>${range(evidence.annualMaintenanceLabourPerM2)}/年</td></tr></table><p>${escape(evidence.note)}</p><p><a href="${escape(evidence.url)}" target="_blank" rel="noopener noreferrer">${escape(evidence.title)}</a> · ${escape(evidence.locator)}</p></section>`;
}
