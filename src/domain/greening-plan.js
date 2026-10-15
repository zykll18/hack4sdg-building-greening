import { calculateScenario } from './calculate.js';
import { plantingProfile } from './planting-selection.js';
import { assessInterventionCarbon, carbonBasis } from './carbon-assessment.js';
import { assessProjectCost, costBasis } from './cost-assessment.js';
import { estimateReferenceCarbon } from './carbon-model.js';

const assumed = (value, unit) => ({ value, unit, provenance: 'assumed', source: 'Presentation assumption; replace with local quotes, EPDs and energy modelling' });
const profile = (id, name, coverage, load, checks) => ({
  id, name, description: name, coverageFraction: coverage,
  installationCostHkdM2: null, maintenanceCostHkdM2Year: null,
  installationKgCo2eM2: null, annualAvoidedKgCo2eM2: null,
  addedLoadKgM2: assumed(load, 'kg/m2'), checks
});
export const REGION_TYPES = { roof: 'Roof', facade: 'Facade', terrace: 'Balcony / terrace', ground: 'Ground / courtyard' };
export const CURRENT_PLAN = {
  id: 'current', name: '当前绿化方案 / Current planting',
  description: 'Adopted AI recommendations and your edits: selected locations, species and coverage.',
  profiles: {
    roof: profile('roof-planting', 'Roof planting', .5, 120, ['Structural capacity, waterproofing and drainage require professional review.']),
    facade: profile('climbers', 'Climbing facade', .5, 35, ['Facade fixings, access and irrigation require review.']),
    terrace: profile('planters', 'Terrace planters', .5, 160, ['Terrace loading, access and drainage require review.']),
    ground: profile('low-planting', 'Courtyard planting', .5, 0, ['Land availability, utilities and drainage require review.'])
  }
};
// Compatibility for calculation callers: a single editable proposal, never alternative presets.
export const PLANS = [CURRENT_PLAN];

export function calculatePlan({ regions, plan, years, budgetHkd, carbonEvidence, costEvidence, carbonModelSettings }) {
  if (!regions.length) throw new Error('Add at least one planting region to compare with the original building');
  if (!plan || !Number.isInteger(years) || years < 1) throw new TypeError('A valid plan and comparison period are required');
  if (budgetHkd !== undefined && (!Number.isFinite(budgetHkd) || budgetHkd < 0)) throw new RangeError('Budget must be non-negative');
  const ids = new Set();
  const version = regions[0].modelVersion;
  const projectId = regions[0].projectId;
  const items = regions.map((region) => {
    if (ids.has(region.id) || region.modelVersion !== version || region.projectId !== projectId) throw new Error('Regions must have unique identifiers and belong to the same model version and project');
    ids.add(region.id);
    if (!REGION_TYPES[region.type] || !plan.profiles[region.type]) throw new Error('Unsupported region type');
    const effectiveProfile = plantingProfile(region, plan);
    const { roofElementId, ...result } = calculateScenario({ roof: { projectId: region.projectId, modelVersion: region.modelVersion, roofElementId: region.id, usableArea: region.usableArea }, scenario: effectiveProfile, years });
    return { ...result, regionId: region.id, regionType: region.type, globalId: region.globalId, geometrySource: region.geometrySource, usableArea: region.usableArea, regionName: region.name, systemName: effectiveProfile.name, planting: region.planting ?? null };
  });
  const costAssessment = assessProjectCost({ input: costEvidence, basis: costBasis({ regions, plan, years }), years });
  const totals = { coverageM2: items.reduce((sum, item) => sum + item.coverageM2, 0), installationCostHkd: costAssessment.installationCostHkd, maintenanceCostHkd: costAssessment.maintenanceCostHkd, totalCostHkd: costAssessment.totalCostHkd };
  const carbonAssessment = assessInterventionCarbon({ input: carbonEvidence, basis: carbonBasis({ regions, plan, years }), years });
  const carbonModel = estimateReferenceCarbon({ regions, plan, years, settings: carbonModelSettings });
  const checks = [...new Set(items.flatMap((item) => item.checks))];
  if (budgetHkd !== undefined && totals.installationCostHkd !== null && totals.installationCostHkd > budgetHkd) checks.push('Total installation cost exceeds the entered budget.');
  return { projectId, modelVersion: version, planId: plan.id, planName: plan.name, years, budgetHkd: budgetHkd ?? null, withinBudget: budgetHkd === undefined || totals.installationCostHkd === null ? null : totals.installationCostHkd <= budgetHkd, costAssessment,
    ...totals, installationKgCo2e: carbonAssessment.upfrontKgCo2e,
    avoidedOperationalKgCo2e: carbonAssessment.operationalChangeKgCo2e === null ? null : -carbonAssessment.operationalChangeKgCo2e,
    netDifferenceKgCo2e: carbonAssessment.netDifferenceKgCo2e, carbonAssessment, carbonModel, items, checks, scope: carbonAssessment.method.scope };
}

export function calculateBeforeAfter(inputs) {
  const proposal = calculatePlan({ ...inputs, plan: CURRENT_PLAN });
  const assessment = proposal.carbonAssessment;
  const energy = assessment.input?.energy;
  const factor = assessment.electricityFactor;
  const periodEmissions = annual => annual == null || !factor ? null : annual * factor.value * proposal.years;
  const beforeEnergy = periodEmissions(energy?.baselineKwhPerYear);
  const afterEnergy = periodEmissions(energy?.afterKwhPerYear);
  if ([beforeEnergy, afterEnergy].some(value => value !== null && !Number.isFinite(value))) throw new RangeError('Electricity totals exceed the supported numeric range');
  return {
    kind: 'original-vs-current',
    baseline: {
      id: 'original', name: '原始建筑 / Before', projectId: proposal.projectId, modelVersion: proposal.modelVersion, years: proposal.years,
      addedPlantingAreaM2: 0, incrementalInstallationCostHkd: 0, incrementalPeriodCostHkd: 0,
      annualElectricityKwh: energy?.baselineKwhPerYear ?? null, periodElectricityKgCo2e: beforeEnergy,
      wholeBuildingCarbonKgCo2e: null,
      scope: 'Original model with no proposed intervention. Zero added area/cost is a comparison reference; existing greenery, costs and whole-building carbon are not inventoried.'
    },
    proposal: { ...proposal, annualElectricityKwh: energy?.afterKwhPerYear ?? null, periodElectricityKgCo2e: afterEnergy },
    changes: { addedPlantingAreaM2: proposal.coverageM2, installationCostHkd: proposal.installationCostHkd,
      periodCostHkd: proposal.totalCostHkd, periodCarbonKgCo2e: proposal.netDifferenceKgCo2e }
  };
}
