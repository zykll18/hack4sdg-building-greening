import { GREEN_ROOF_EPD, ELECTRICITY_FACTORS } from '../data/carbon-evidence.js';
import { ROOF_REFERENCE, HK_REFERENCE_CLIMATE, THERMAL_MODEL_SOURCES } from '../data/carbon-model-evidence.js';
import { plantingProfile } from './planting-selection.js';
import { PLANT_CARBON_STUDIES } from '../data/plant-carbon-evidence.js';

export const CARBON_MODEL_VERSION = 'roof-reference-carbon-1';
export const DEFAULT_CARBON_MODEL = Object.freeze({
  version: CARBON_MODEL_VERSION, enabled: true, cooling: 'unknown', schedule: 'daytime', electricityFactorId: 'clp-2025',
  roofUMin: .5, roofUMax: 2, copMin: 3, copMax: 5, conductivityMin: .17, conductivityMax: 1
});
export function normalizeCarbonModelSettings(input = DEFAULT_CARBON_MODEL) {
  if (!input || input.version !== CARBON_MODEL_VERSION || typeof input.enabled !== 'boolean' ||
      !['unknown', 'conditioned', 'unconditioned'].includes(input.cooling) || !['daytime', 'continuous'].includes(input.schedule) ||
      !ELECTRICITY_FACTORS.some(factor => factor.id === input.electricityFactorId)) throw new TypeError('Invalid carbon reference model');
  for (const [min, max, limit] of [['roofUMin','roofUMax',10], ['copMin','copMax',20], ['conductivityMin','conductivityMax',10]]) {
    if (![input[min], input[max]].every(value => Number.isFinite(value) && value > 0 && value <= limit) || input[min] > input[max]) throw new RangeError('模型参数需为正数，且下限不大于上限 / Invalid model parameter range');
  }
  return Object.fromEntries(Object.keys(DEFAULT_CARBON_MODEL).map(key => [key, input[key]]));
}
const finite = value => { if (!Number.isFinite(value)) throw new RangeError('Carbon model exceeds numeric range'); return value; };
export function estimateReferenceCarbon({ regions, plan, years, settings }) {
  if (settings == null) return null;
  settings = normalizeCarbonModelSettings(settings);
  if (!settings.enabled) return null;
  if (!Number.isInteger(years) || years < 1 || years > 1000) throw new RangeError('Invalid model period');
  const factor = ELECTRICITY_FACTORS.find(value => value.id === settings.electricityFactorId);
  const degreeHours = HK_REFERENCE_CLIMATE.degreeHoursByHour.reduce((total, value, hour) =>
    total + (settings.schedule === 'continuous' || hour >= 8 && hour < 18 ? value : 0), 0);
  const rows = [], unmodelled = [];
  for (const region of regions) {
    const coverage = plantingProfile(region, plan).coverageFraction;
    const area = finite(region.usableArea.value * coverage);
    if (area < 0) throw new RangeError('Invalid model area');
    if (area === 0) continue;
    if (region.type !== 'roof' || region.planting?.plantId && region.planting.plantId !== 'sedum-lineare') {
      unmodelled.push({ regionId: region.id, name: region.name ?? region.id, areaM2: area, reason: 'No reviewed matching reference model for this surface/species.' }); continue;
    }
    const slope = region.screening?.slopeScreening?.maxSourceSlopeDegrees ?? region.screening?.roofAssessment?.maxSlopeDegrees;
    const checks = ['德国参考构造与香港项目的供货、施工和植物配置尚未匹配；数值是参考情景。',
      '参考基质为60mm，不替代当前植物库100–200mm的土层指引；更厚构造需要重新建立材料因子。'];
    if (!Number.isFinite(slope) || slope > ROOF_REFERENCE.declaredSlopeMaxDegrees) checks.push('参考EPD适用约8°以内；此屋顶坡度未知或超出，额外固定与构造未计入。概念预览仍可用。');
    const deltaU = (u, conductivity) => u - 1 / (1 / u + ROOF_REFERENCE.substrateDepthM / conductivity);
    const low = settings.cooling === 'conditioned' ? finite(area * deltaU(settings.roofUMin, settings.conductivityMax) * degreeHours / (1000 * settings.copMax)) : 0;
    const high = settings.cooling === 'unconditioned' ? 0 : finite(area * deltaU(settings.roofUMax, settings.conductivityMin) * degreeHours / (1000 * settings.copMin));
    rows.push({ regionId: region.id, name: region.name ?? region.id, globalId: region.globalId ?? null, areaM2: area,
      referenceOnly: true, checks, quantities: { substrateM3: finite(area * ROOF_REFERENCE.substrateDepthM),
        protectionM2: area, drainageM2: area, filterM2: area, systemDryKg: finite(area * ROOF_REFERENCE.dryMassKgM2),
        systemSaturatedKg: finite(area * ROOF_REFERENCE.saturatedMassKgM2) },
      modules: Object.fromEntries(Object.entries(GREEN_ROOF_EPD.modules).filter(([key]) => key !== 'D').map(([key, value]) => [key, finite(area * value)])),
      annualCoolingPotentialKwh: { min: low, max: high } });
  }
  const sum = select => finite(rows.reduce((total, row) => total + select(row), 0));
  const upfront = sum(row => row.modules['A1-A3'] + row.modules.A4 + row.modules.A5);
  const cooling = { min: sum(row => row.annualCoolingPotentialKwh.min), max: sum(row => row.annualCoolingPotentialKwh.max) };
  return { version: CARBON_MODEL_VERSION, status: rows.length ? 'reference-estimate' : 'not-applicable', settings, years,
    quality: 'unvalidated-reference-sensitivity-scenario', scope: 'Reference assembly A1–A5 plus hypothetical roof-conduction cooling effect only; not full lifecycle or whole-building net change.',
    rows, unmodelled, areaM2: sum(row => row.areaM2), modules: Object.fromEntries(['A1-A3','A4','A5','C1','C2','C3','C4'].map(key => [key, sum(row => row.modules[key])])),
    upfrontKgCo2e: rows.length ? upfront : null, annualCoolingPotentialKwh: rows.length ? cooling : null,
    biologicalReference: rows.length ? {
      status:'foreign-study-analogy-not-project-credit',areaM2:sum(row => row.areaM2),
      periodUptakeKgCo2:null,includedInModelledScopeChange:false,
      studies:PLANT_CARBON_STUDIES.map(study => ({...study,
        annualNetUptakeKgCo2PerM2:study.netUptakeGramsCPerM2Year/1000*44/12,
        analogousAnnualNetUptakeKgCo2:finite(sum(row => row.areaM2)*study.netUptakeGramsCPerM2Year/1000*44/12)
      }))
    } : null,
    modelledScopeChangeKgCo2e: rows.length ? { min: finite(upfront - cooling.max * factor.value * years), max: finite(upfront - cooling.min * factor.value * years) } : null,
    hypotheticalEndOfLifeKgCo2e: rows.length ? sum(row => row.modules.C1 + row.modules.C2 + row.modules.C3 + row.modules.C4) : null,
    exclusions: [...ROOF_REFERENCE.exclusions, 'Solar radiation, shading, evapotranspiration, latent loads and thermal storage', 'Heating-energy effects', 'Whole-building baseline/after electricity'],
    assumptions: ['香港典型气象年、26°C参考阈值；日间情景为每天08:00–18:00，连续情景为24小时。',
      '原屋顶传热系数与空调COP是可调整的情景假设，未从IFC确认。',
      '基质导热范围参考不同实验介质，未测试本项目或该EPD产品；区间是敏感性结果，不是置信区间。',
      '空调情况未知时节能下限取0；只有空调空间的屋顶传热负荷进入制冷模型。',
      'C阶段仅展示结束处置的参考量，未确定发生年份，不加入比较期净变化；B阶段未知，不按0处理。'],
    method: { embodied: 'covered area × EPD module GWP-total per m²', addedResistance: 'R = substrate depth / conductivity',
      afterU: 'U_after = 1 / (1/U_before + R)', cooling: 'area × (U_before − U_after) × cooling degree-hours / (1000 × COP)',
      modelledScope: 'A1–A5 − modelled roof-cooling potential × electricity factor × years' },
    reference: ROOF_REFERENCE, epd: GREEN_ROOF_EPD, climate: { ...HK_REFERENCE_CLIMATE, usedDegreeHours: degreeHours },
    electricityFactor: factor, thermalSources: THERMAL_MODEL_SOURCES };
}
