import { DEFAULT_CARBON_MODEL, normalizeCarbonModelSettings } from '../src/domain/carbon-model.js';
import { ELECTRICITY_FACTORS } from '../src/data/carbon-evidence.js';

const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
const numericLabels = { roofUMin: '原屋顶U下限 (W/m²K)', roofUMax: '原屋顶U上限 (W/m²K)',
  copMin: '空调COP下限', copMax: '空调COP上限', conductivityMin: '基质导热系数下限 (W/mK)', conductivityMax: '基质导热系数上限 (W/mK)' };
export function createCarbonModelInputs({ container, onChange }) {
  let accepted = { ...DEFAULT_CARBON_MODEL }, pending = false;
  const form = node('form'), fields = {};
  form.append(node('p', '按当前建筑的实际种植面积自动粗估，无需填写碳排结果。适合比较方案的大致影响；不同建筑共用参考假设，结果不代表实测。'));
  const enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = true; fields.enabled = enabled;
  const enableLabel = node('label', '启用有来源的参考模型'); enableLabel.prepend(enabled); form.append(enableLabel);
  const settingsPanel = node('details'); settingsPanel.append(node('summary','估算设置（可选）')); form.append(settingsPanel);
  for (const [key, label, options] of [
    ['cooling','屋顶下方空调情况',[['unknown','未确认（节能范围包含0）'],['conditioned','空调空间参考情景'],['unconditioned','非空调空间（不计制冷节省）']]],
    ['schedule','运行时段假设',[['daytime','每天08:00–18:00'],['continuous','每天24小时']]],
    ['electricityFactorId','参考电力供应商',ELECTRICITY_FACTORS.map(f => [f.id, f.provider + ' · ' + f.year])]
  ]) {
    const select = node('select'); select.setAttribute('aria-label', label);
    for (const [value, text] of options) select.append(new Option(text,value));
    fields[key] = select; const wrap=node('label',label); wrap.append(select); settingsPanel.append(wrap);
  }
  const advanced = node('details'); advanced.append(node('summary','查看或调整模型假设'));
  advanced.append(node('p','U和COP范围为未核验的情景假设；基质导热范围借鉴不同实验介质。修改这些假设会改变敏感性区间，区间不是准确性保证。厚度固定对应参考EPD，不能随意按比例放大整套排放因子。'));
  for (const [key,label] of Object.entries(numericLabels)) {
    const input=node('input'); input.type='number'; input.min='.001'; input.step='any'; input.setAttribute('aria-label',label);
    fields[key]=input; const wrap=node('label',label); wrap.append(input); advanced.append(wrap);
  }
  settingsPanel.append(advanced);
  const apply=node('button','应用参考模型 / Apply reference model'); apply.type='submit'; apply.className='secondary-button';
  const status=node('p'); status.className='note'; status.setAttribute('role','status'); settingsPanel.append(apply); form.append(status); container.append(form);
  function display(settings) { for (const [key,el] of Object.entries(fields)) { if(key==='enabled') el.checked=settings[key]; else el.value=String(settings[key]); } }
  display(accepted);
  form.addEventListener('input',()=>{pending=true;status.textContent='模型参数已修改，应用后重新估算。';onChange();});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try {
      accepted=normalizeCarbonModelSettings({ version:DEFAULT_CARBON_MODEL.version,
        ...Object.fromEntries(Object.entries(fields).map(([key,el])=>[key,key==='enabled'?el.checked:key in numericLabels?Number(el.value):el.value])) });
      pending=false; status.textContent='参考参数已应用；改变植物面积会自动重算。';onChange();
    } catch(error) { status.textContent=error.message; }
  });
  return {
    get:()=>pending?null:accepted,
    serialize:()=>({settings:accepted,pending,fields:Object.fromEntries(Object.entries(fields).map(([key,el])=>[key,key==='enabled'?el.checked:el.value]))}),
    restore(saved) {
      this.clear(); if(!saved)return;
      accepted=normalizeCarbonModelSettings(saved.settings); display(accepted);
      for(const [key,el] of Object.entries(fields)) {
        if(saved.pending !== true) continue;
        if(key==='enabled' && typeof saved.fields?.[key]==='boolean')el.checked=saved.fields[key];
        else if(typeof saved.fields?.[key]==='string')el.value=saved.fields[key].slice(0,100);
      }
      pending=saved.pending===true; status.textContent=pending?'模型参数尚未应用。':'已恢复参考模型参数。';
    },
    clear(){accepted={...DEFAULT_CARBON_MODEL};pending=false;display(accepted);status.textContent='';},
    dispose(){container.replaceChildren();}
  };
}
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => value.toLocaleString('en-HK',{maximumFractionDigits:2});
export const roughNumber = value => value.toLocaleString('en-HK',{maximumSignificantDigits:2});
export const modelRange = (range, unit='kgCO₂e') => range ? '约 ' + (roughNumber(range.min) === roughNumber(range.max) ? roughNumber(range.min) : roughNumber(range.min) + '–' + roughNumber(range.max)) + ' ' + unit : '待补数据';
export function plantCarbonMarkup(reference) {
  if (!reference) return '';
  return '<section class="plant-carbon-reference"><h3>植物带来的碳效益</h3><p>直接吸碳与间接节电分开看：植物和基质通过生长、呼吸与分解形成生态系统净碳交换；间接节电目前只估算屋顶传热，尚未模拟遮阴和蒸散。下面为外地研究类比，不是本项目实测或完整净减排。</p>'+
    '<table><tr><th>研究条件</th><th>净吸收观测值</th><th>按 '+number(reference.areaM2)+'㎡类比</th></tr>'+
    reference.studies.map(study=>'<tr><td>'+escape(study.site)+'</td><td>'+number(study.annualNetUptakeKgCo2PerM2)+' kg CO₂/㎡/年</td><td>约 '+roughNumber(study.analogousAnnualNetUptakeKgCo2)+' kg CO₂/年</td></tr>').join('')+'</table>'+
    '<p>换算：g C ÷ 1000 × 44/12 = kg CO₂，再乘参考种植面积。这里的净吸收已反映生态系统呼吸，不能再叠加一次植物光合作用吸收量。两个研究值不是本项目区间的上下限。</p><p>以上未扣灌溉和维护的能源排放，也未核对本项目基质、生存率及长期碳留存；没有按比较年限线性放大或抵扣施工排放。施工＋传热区间不含此项，不能代表绿化方案的完整碳收支。</p><details><summary>固碳研究来源与适用限制</summary><ul>'+
    reference.studies.map(study=>'<li><a href="'+escape(study.url)+'" target="_blank" rel="noopener noreferrer">'+escape(study.title)+'</a>（'+study.year+'）。'+escape(study.observation)+' '+escape(study.applicability)+'</li>').join('')+'</ul></details></section>';
}
export function carbonCalculationMarkup(model) {
  if (!model?.modelledScopeChangeKgCo2e) return '';
  const area = model.areaM2, factor = model.electricityFactor.value, years = model.years;
  const change = value => (value < 0 ? '减少 ' : value > 0 ? '增加 ' : '') + number(Math.abs(value));
  const rates = model.epd.modules;
  const constructionRate = rates['A1-A3'] + rates.A4 + rates.A5;
  const saved = { min:model.annualCoolingPotentialKwh.min*factor*years, max:model.annualCoolingPotentialKwh.max*factor*years };
  const s = model.settings, deltaMax = s.roofUMax - 1/(1/s.roofUMax + model.reference.substrateDepthM/s.conductivityMin);
  const uncertainty = s.cooling === 'unknown' ? '屋顶下方空调情况未确认，保守端不计节电；另一端同时采用较大的原屋顶U、较低的基质导热系数与较低COP，代表较强节能情景。' : s.cooling === 'unconditioned' ? '已选择非空调空间，两端均不计制冷节省。' : '两端分别组合原屋顶U、基质导热系数和空调COP的假设边界；并非同一组参数的测量误差。';
  return '<details open class="carbon-calculation"><summary>计算过程与区间原因</summary><ol>'+
    '<li>参考种植面积 A = '+number(area)+'㎡（各位置可用面积 × 已采用覆盖率，再相加）。</li>'+
    '<li>新增施工排放 = A × (材料 '+rates['A1-A3']+' + 运输 '+rates.A4+' + 安装 '+rates.A5+') = '+number(area)+' × '+constructionRate.toFixed(3)+' = '+number(model.upfrontKgCo2e)+' kgCO₂e。单位面积排放因子来自所列参考构造的EPD。</li>'+
    '<li>每年潜在节电 = A × ΔU × '+number(model.climate.usedDegreeHours)+' ÷ (1000 × COP)，结果 '+modelRange(model.annualCoolingPotentialKwh,'kWh/年')+'。其中 R = '+model.reference.substrateDepthM+' / λ，U后 = 1 / (1 / U前 + R)，ΔU = U前 − U后。'+
    (s.cooling === 'unconditioned' ? '本情景节电取0。' : '较强节能端：U前='+s.roofUMax+'，λ='+s.conductivityMin+'，COP='+s.copMin+'，ΔU≈'+deltaMax.toFixed(4)+' W/㎡K。')+'</li>'+
    '<li>'+years+'年潜在用电减排 = 年节电 × '+factor+' kgCO₂e/kWh × '+years+' = '+number(saved.min)+'–'+number(saved.max)+' kgCO₂e（历史电力因子固定，不预测未来电网）。</li></ol>'+
    '<table><tr><th>情景端点</th><th>施工排放 − 潜在用电减排</th><th>参考变化</th></tr><tr><td>较强节能端</td><td>'+number(model.upfrontKgCo2e)+' − '+number(saved.max)+'</td><td>'+change(model.modelledScopeChangeKgCo2e.min)+' kgCO₂e</td></tr><tr><td>较弱 / 不计节能端</td><td>'+number(model.upfrontKgCo2e)+' − '+number(saved.min)+'</td><td>'+change(model.modelledScopeChangeKgCo2e.max)+' kgCO₂e</td></tr></table>'+
    '<p>'+uncertainty+' 区间是情景跨度，不是置信区间；不能取中点当作最可能结果。施工因子固定为参考构造，不包含构造不匹配带来的全部误差。若原屋顶U、空调情况和材料参数更明确，可据实缩小范围。</p><p>表内数值四舍五入展示，计算使用未舍入值。正数表示增加，负数表示减少。</p></details>';
}
export function carbonModelMarkup(model) {
  if(!model)return '';
  if(model.status==='not-applicable')return '<p class="note">当前没有此参考模型覆盖的景天屋顶。立面、露台和庭院需要各自的材料与能源模型，不套用屋顶因子。</p>';
  const sources = [{title:model.epd.product,url:model.epd.url,locator:model.epd.id+' · p3–4, 6–9'}, {title:model.climate.title,url:model.climate.documentationUrl,locator:'8760小时；'+number(model.climate.usedDegreeHours)+' K·h（所选时段、26°C）'}, ...model.thermalSources,
    {title:model.electricityFactor.title,url:model.electricityFactor.url,locator:model.electricityFactor.locator}];
  return '<section class="carbon-model-result"><h3>碳排粗略估算</h3><p>按约 '+roughNumber(model.areaM2)+'㎡种植面积估算。范围：新增施工＋屋顶传热影响；不代表完整生命周期或整栋建筑净减排。</p>'+
    '<dl><div><dt>新增施工排放</dt><dd>约 '+roughNumber(model.upfrontKgCo2e)+' kgCO₂e</dd></div>'+
    '<div><dt>'+model.years+'年参考碳排变化</dt><dd>'+modelRange(model.modelledScopeChangeKgCo2e)+'</dd></div></dl>'+
    '<p>正数表示此范围内增加，负数表示减少。采用通用参考假设，适合方案初步比较；维护、更换、灌溉和处置尚未计入。</p>'+
    plantCarbonMarkup(model.biologicalReference)+
    carbonCalculationMarkup(model)+
    (model.unmodelled.length?'<p>未建模：'+model.unmodelled.map(row=>escape(row.name)).join('、')+'；以上数值仅覆盖'+number(model.areaM2)+'㎡参考屋顶。</p>':'')+
    '<details><summary>详细依据、参数与适用范围</summary><p>每年屋顶传热部分的潜在节电：'+modelRange(model.annualCoolingPotentialKwh,'kWh/year')+'。</p><details><summary>参考材料用量与EPD阶段</summary><table><thead><tr><th>位置</th><th>参考面积</th><th>基质用量</th><th>干重 / 饱和重</th></tr></thead><tbody>'+
    model.rows.map(row=>'<tr><td>'+escape(row.name)+'</td><td>'+number(row.areaM2)+'㎡</td><td>'+number(row.quantities.substrateM3)+'m³</td><td>'+number(row.quantities.systemDryKg)+' / '+number(row.quantities.systemSaturatedKg)+' kg</td></tr>').join('')+
    '</tbody></table><p>保护垫、排水板、过滤层各按参考面积计量。整套EPD因子包含这些层，不重复叠加。</p><ul>'+
    Object.entries(model.modules).map(([module,value])=>'<li>'+escape(module)+': '+number(value)+' kgCO₂e</li>').join('')+
    '</ul><p>C阶段处置合计'+number(model.hypotheticalEndOfLifeKgCo2e)+' kgCO₂e仅作参考，发生年份未知，未加入比较期净变化。EPD未定义使用寿命、未声明B阶段；D阶段不抵扣。</p></details>'+
    '<details><summary>参数、假设与适用范围</summary><p>原屋顶U：'+model.settings.roofUMin+'–'+model.settings.roofUMax+' W/m²K；空调COP：'+model.settings.copMin+'–'+model.settings.copMax+'；基质导热系数：'+model.settings.conductivityMin+'–'+model.settings.conductivityMax+' W/mK。</p><ul>'+
    [...new Set([...model.assumptions,...model.rows.flatMap(row=>row.checks)])].map(text=>'<li>'+escape(text)+'</li>').join('')+
    '</ul><p>公式：R=d/λ；U后=1/(1/U前+R)；潜在节电=A×(U前−U后)×制冷度时/(1000×COP)。不含日照、蒸散、蓄热、采暖等影响；未运行EnergyPlus。</p></details>'+
    '<details><summary>估算依据与来源</summary><ul>'+sources.map(source=>'<li><a href="'+escape(source.url)+'" target="_blank" rel="noopener noreferrer">'+escape(source.title)+'</a> · '+escape(source.locator)+'</li>').join('')+'</ul></details></details></section>';
}
