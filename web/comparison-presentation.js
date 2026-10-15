import { carbonValue } from './carbon-presentation.js';
import { modelRange, roughNumber } from './carbon-model.js';

const number = value => value == null ? '待补数据' : value.toLocaleString('en-HK', { maximumFractionDigits: 2 });
const money = value => value === null ? '费用待补' : `HK$${number(value)}`;

/** Shared by the live comparison and HTML report; zeros refer only to the proposed intervention. */
export function comparisonOverviewMarkup({ baseline, proposal, changes }) {
  const reference = proposal.carbonModel;
  return `<section class="comparison-overview"><h3>原始建筑 → 当前绿化方案</h3>
    <p>右侧内容来自已采用的 AI 推荐及你的修改。未采用的推荐不参与计算；原始 IFC 保持不变。</p>
    <table class="region-breakdown"><thead><tr><th>比较项</th><th>原始建筑</th><th>当前绿化方案</th></tr></thead><tbody>
      <tr><td>本次新增种植面积</td><td>${number(baseline.addedPlantingAreaM2)} m²</td><td>${number(proposal.coverageM2)} m²</td></tr>
      ${reference?.upfrontKgCo2e == null ? '' : `<tr><td>新增施工排放粗估（仅覆盖适用位置）</td><td>0 kgCO₂e（本次增量）</td><td>约 ${roughNumber(reference.upfrontKgCo2e)} kgCO₂e</td></tr>`}
      <tr><td>本次新增安装费用</td><td>${money(baseline.incrementalInstallationCostHkd)}</td><td>${money(proposal.installationCostHkd)}</td></tr>
      <tr><td>${proposal.years} 年费用（安装＋维护）</td><td>${money(baseline.incrementalPeriodCostHkd)}</td><td>${money(proposal.totalCostHkd)}</td></tr>
      ${baseline.annualElectricityKwh === null && proposal.annualElectricityKwh === null ? '' : `<tr><td>年用电量</td><td>${number(baseline.annualElectricityKwh)}${baseline.annualElectricityKwh === null ? '' : ' kWh'}</td><td>${number(proposal.annualElectricityKwh)}${proposal.annualElectricityKwh === null ? '' : ' kWh'}</td></tr>
      <tr><td>${proposal.years} 年用电排放</td><td>${number(baseline.periodElectricityKgCo2e)}${baseline.periodElectricityKgCo2e === null ? '' : ' kgCO₂e'}</td><td>${number(proposal.periodElectricityKgCo2e)}${proposal.periodElectricityKgCo2e === null ? '' : ' kgCO₂e'}</td></tr>`}
    </tbody></table>
    <p class="comparison-carbon-change">${proposal.years} 年${changes.periodCarbonKgCo2e === null && reference?.modelledScopeChangeKgCo2e ? '参考碳排变化（施工＋屋顶传热）' : '干预净碳排变化'}：<strong>${changes.periodCarbonKgCo2e === null && reference?.modelledScopeChangeKgCo2e ? modelRange(reference.modelledScopeChangeKgCo2e) : carbonValue(changes.periodCarbonKgCo2e)}</strong></p>
    <p class="note">零新增费用与面积仅代表未实施本次绿化；原有绿化、运营费用和建筑总碳排未盘点。净碳排变化计入新增材料、维护、更换、处置及用电差额，缺项保持待补。费用使用所填报价或情景输入，项目总额不自动分摊到区域，费用仅含安装与日常维护。</p></section>`;
}
