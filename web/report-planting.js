import { CURRENT_PLAN } from '../src/domain/greening-plan.js';
import { plantingProfile } from '../src/domain/planting-selection.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const amount = value => value.toLocaleString('en-HK',{maximumFractionDigits:1});
/** Bind exported AI detail to the actual adopted identity, species and coverage. Drafts never enter the report. */
export function adoptedPlantingReport({ regions, turns, catalog, modelVersion }) {
  return regions.filter(region => region.modelVersion === modelVersion).map(region => {
    const planting = plantingProfile(region, CURRENT_PLAN);
    const plantId = region.planting?.plantId ?? null;
    const plant = catalog.plants.find(item => item.id === plantId);
    let recommendation = null;
    for (const turn of turns) {
      const match = turn.reply?.recommendations?.find(item => item.globalId === region.globalId && item.type === region.type && item.plantId === plantId && Math.abs(item.coverageFraction - planting.coverageFraction) < 1e-9);
      if (match) recommendation = match;
    }
    return { regionId:region.id,globalId:region.globalId,name:region.name ?? region.id,type:region.type,
      plantId,plantName:plant ? `${plant.commonNameZh} · ${plant.scientificName}` : '未指定品种',
      coverageFraction:planting.coverageFraction,areaM2:region.usableArea.value * planting.coverageFraction,
      origin:recommendation ? 'adopted-ai' : 'existing-or-manual',explanation:recommendation?.explanation ?? '',
      plantingPlan:recommendation?.plantingPlan ?? null,sources:recommendation ? plant?.sources ?? [] : [] };
  });
}
export function adoptedPlantingMarkup(rows) {
  if (!rows.length) return '';
  const labels = {roof:'屋顶',facade:'立面',terrace:'露台',ground:'地面'};
  return '<section><h2>本次采用的绿化方案</h2><p>下表对应建筑上实际采用的种植。AI 配置为概念建议；未采用的候选不会进入面积和碳排计算。</p><table><thead><tr><th>位置</th><th>植物</th><th>覆盖率 / 面积</th><th>方案来源</th></tr></thead><tbody>'+rows.map(row=>`<tr><td>${escape(labels[row.type])} · ${escape(row.name)}</td><td>${escape(row.plantName)}</td><td>${amount(row.coverageFraction*100)}% · ${amount(row.areaM2)} m²</td><td>${row.origin==='adopted-ai'?'本次采用的 AI 推荐':'沿用已有 / 手动设置'}</td></tr>`).join('')+'</tbody></table>'+
    rows.filter(row=>row.plantingPlan).map(row=>'<article><h3>'+escape(row.name)+' · AI 种植配置</h3><p>'+escape(row.explanation)+'</p><dl>'+[
      ['种植方式','plantingMethod'],['基质与参考深度','substrate'],['种植槽与支撑','planter'],['灌溉配置','irrigation']
    ].map(([label,key])=>'<dt>'+label+'</dt><dd>'+escape(row.plantingPlan[key])+'</dd>').join('')+'</dl><p>待核条件：</p><ul>'+row.plantingPlan.checks.map(check=>'<li>'+escape(check)+'</li>').join('')+'</ul><details><summary>植物参考来源</summary><ul>'+row.sources.map(source=>'<li><a href="'+escape(source.url)+'" target="_blank" rel="noopener noreferrer">'+escape(source.title)+'</a></li>').join('')+'</ul></details></article>').join('')+'</section>';
}
