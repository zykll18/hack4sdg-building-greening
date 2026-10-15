const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export function carbonValue(value) {
  return value === null || value === undefined ? '待补数据 / Data needed' : `${value < 0 ? '−' : '+'}${Math.abs(value).toLocaleString('en-HK', { maximumFractionDigits: 2 })} kgCO₂e`;
}
export function carbonResultMarkup(assessment) {
  const amount = value => value === null ? '待补' : value.toLocaleString('en-HK', { maximumFractionDigits: 2 });
  if (!assessment) return '<p>碳数据待补。</p>';
  if (!assessment.input) return '<p class="note">含维护、更换和处置的方案净变化尚未确认：未提供项目校正数据，缺项不按零处理。参考模型仅覆盖其声明的范围。</p>';
  const entries = [['新增材料与施工', assessment.upfrontKgCo2e], ['期内非用电维护', assessment.maintenanceKgCo2e], ['期内更换', assessment.replacementKgCo2e], ['期内处置', assessment.endOfLifeKgCo2e], ['前后用电排放变化', assessment.operationalChangeKgCo2e]];
  const factor = assessment.electricityFactor;
  const energy = assessment.input?.energy;
  const sources = [...new Set(Object.values(assessment.input ?? {}).filter(value => value && typeof value === 'object' && value.source).map(value => value.source))];
  return `<div class="carbon-result"><p>${assessment.status === 'stale' ? '数据对应旧的方案，请重新核对。' : assessment.status === 'calculated' ? '项目输入情景估算；来源已记录，输入尚未独立核验。' : '数据未齐；缺项不按零处理。'}</p>
    <dl>${entries.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(amount(value))} ${value === null ? '' : 'kgCO₂e'}</dd></div>`).join('')}</dl>
    ${factor ? `<p><a href="${escape(factor.url)}" target="_blank" rel="noopener noreferrer">${escape(factor.provider)} · ${factor.year}</a>: ${factor.value} kgCO₂e/kWh</p>` : '<p>请选择实际电力供应商。</p>'}
    ${energy ? `<p>年用电基准 ${escape(energy.baselineKwhPerYear)} → 实施后 ${escape(energy.afterKwhPerYear)} kWh。数据类型：${escape(energy.basis)}。</p>` : ''}
    ${sources.length ? `<details><summary>项目输入来源</summary><ul>${sources.map(source => `<li>${escape(source)}</li>`).join('')}</ul></details>` : ''}
    <p>历史电力因子与年用电固定用于比较期。植物固碳、模块 D 和未说明模块不抵扣；这是所列干预范围的估算。</p>
    <p>阶段划分参考 <a href="${escape(assessment.method.standard.url)}" target="_blank" rel="noopener noreferrer">RICS WLCA</a>；当前部分范围计算不代表符合完整标准。</p></div>`;
}
