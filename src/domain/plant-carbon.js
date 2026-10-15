import { PLANT_CARBON_SOURCES, PLANT_CARBON_ESTIMATES } from '../data/plant-carbon-evidence.js';

/** Literature records are not assignable project reduction factors or sortable plant scores. */
export function plantCarbonEvidence(plant) {
  const scenario = PLANT_CARBON_ESTIMATES.find(item => item.id === plant.carbonEvidence?.estimateId && item.speciesIds.includes(plant.id));
  const estimate = scenario ? {...scenario,
    status:'modelled-biomass-potential-not-net-reduction',unit:'kgCO2/m2/year',
    annualBiomassCo2PotentialPerM2:{min:scenario.annualDryBiomassKgPerM2.min*scenario.assumedCarbonFraction*44/12,max:scenario.annualDryBiomassKgPerM2.max*scenario.assumedCarbonFraction*44/12},
    formula:'annual dry biomass (kg/m²/year) × assumed C fraction × 44/12',
    projectFactorEligible:false,periodNetReductionKgCo2e:null,
    limitations:'生物量碳流估算，不是净固碳、长期储碳或认证减排。未扣维护能源、分解及修剪物释放；生长失败可接近0，不保证达到区间下限。不能与植物＋基质通量或储量增加重复相加，也不自动乘比较年限。'
  } : null;
  const records = (plant.carbonEvidence?.sourceIds ?? []).map(id => PLANT_CARBON_SOURCES.find(source => source.id === id && source.speciesIds.includes(plant.id))).filter(Boolean);
  const references = records.map(source => {
    const flux = source.netUptakeGramsCPerM2Year;
    const stock = source.firstYearStockIncreaseGramsCPerM2;
    const value = Number.isFinite(flux) ? flux : Number.isFinite(stock) ? stock : null;
    return {...source, reviewedAt:plant.carbonEvidence?.reviewedAt ?? null,
      referenceValueKgCo2PerM2:value === null ? null : value/1000*44/12,
      referencePeriod:Number.isFinite(flux) ? 'annualized-observation' : Number.isFinite(stock) ? 'first-year-only' : null,
      projectFactorEligible:false};
  });
  return {
    status:references.some(source => source.referenceValueKgCo2PerM2 !== null) ? 'quantitative-reference' : references.length ? 'related-evidence' : 'data-needed',
    projectAnnualNetReductionKgCo2ePerM2:null, energySavings:'project-model-required',
    references, estimate, summary:references.some(source => source.referenceValueKgCo2PerM2 !== null) ? '有数值研究参考 · 非项目减排系数' : estimate ? '有类比估算 · 非实测净减排' : references.length ? '有相关研究 · 暂无适用年度系数' : '暂无可用系数 · 不代表没有效果'
  };
}
export function plantEvidenceSources(plant) {
  const carbon = plantCarbonEvidence(plant);
  return [...(plant.sources ?? []), ...[...carbon.references, ...(carbon.estimate?.sources ?? [])].map(source => ({
    title:source.title,url:source.url,locator:source.locator ?? 'Published abstract',reviewedAt:source.reviewedAt ?? plant.carbonEvidence?.reviewedAt,method:'Reviewed carbon literature or explicit scenario analogy; applicability limits retained'
  }))];
}
