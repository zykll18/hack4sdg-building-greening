import { calculateScenario } from './calculate.js';
import { demoScenarios } from '../data/demo.js';

const assumed = (value, unit) => ({ value, unit, provenance: 'assumed', source: 'Presentation assumption; replace with local quotes, EPDs and energy modelling' });
const profile = (id, name, coverage, cost, maintenance, carbon, savings, load, checks) => ({
  id, name, description: name, coverageFraction: coverage,
  installationCostHkdM2: assumed(cost, 'HKD/m2'), maintenanceCostHkdM2Year: assumed(maintenance, 'HKD/m2/year'),
  installationKgCo2eM2: assumed(carbon, 'kgCO2e/m2'), annualAvoidedKgCo2eM2: assumed(savings, 'kgCO2e/m2/year'),
  addedLoadKgM2: assumed(load, 'kg/m2'), checks
});
export const REGION_TYPES = { roof: 'Roof', facade: 'Facade', terrace: 'Balcony / terrace', ground: 'Ground / courtyard' };
export const PLANS = [
  { id: 'light', name: 'Light-touch planting', description: 'Extensive roofs, climbing plants, planters and low planting.', profiles: {
    roof: demoScenarios[0],
    facade: profile('climbers', 'Climbing facade', .45, 900, 90, 65, 3, 35, ['Facade fixings, access and irrigation require review.']),
    terrace: profile('planters', 'Terrace planters', .35, 1600, 110, 110, 0, 160, ['Terrace loading, access and drainage require review.']),
    ground: profile('low-planting', 'Low courtyard planting', .6, 650, 45, 40, 0, 0, ['Land availability, utilities and drainage require review.'])
  } },
  { id: 'landscape', name: 'Landscape mix', description: 'Deeper roofs, living walls, planted terraces and courtyard trees.', profiles: {
    roof: demoScenarios[1],
    facade: profile('living-wall', 'Modular living wall', .65, 2800, 240, 180, 5, 85, ['Facade fixings, fire strategy, access and irrigation require review.']),
    terrace: profile('planted-terrace', 'Planted terrace', .5, 2600, 180, 190, 0, 300, ['Terrace loading, access and drainage require review.']),
    ground: profile('mixed-courtyard', 'Mixed courtyard planting', .75, 1350, 95, 75, 0, 0, ['Tree rooting space, utilities, land availability and maintenance require review.'])
  } }
];

export function calculatePlan({ regions, plan, years, budgetHkd }) {
  if (!regions.length) throw new Error('Add at least one confirmed region to compare plans');
  if (!plan || !Number.isInteger(years) || years < 1) throw new TypeError('A valid plan and comparison period are required');
  if (budgetHkd !== undefined && (!Number.isFinite(budgetHkd) || budgetHkd < 0)) throw new RangeError('Budget must be non-negative');
  const ids = new Set();
  const version = regions[0].modelVersion;
  const items = regions.map((region) => {
    if (ids.has(region.id) || region.modelVersion !== version) throw new Error('Regions must have unique identifiers and belong to the same model version');
    ids.add(region.id);
    if (!REGION_TYPES[region.type] || !plan.profiles[region.type]) throw new Error('Unsupported region type');
    const { roofElementId, ...result } = calculateScenario({ roof: { projectId: region.projectId, modelVersion: region.modelVersion, roofElementId: region.id, usableArea: region.usableArea }, scenario: plan.profiles[region.type], years });
    return { ...result, regionId: region.id, regionType: region.type, globalId: region.globalId, geometrySource: region.geometrySource, usableArea: region.usableArea, regionName: region.name, systemName: plan.profiles[region.type].name };
  });
  const totals = Object.fromEntries(['coverageM2','installationCostHkd','maintenanceCostHkd','totalCostHkd','installationKgCo2e','avoidedOperationalKgCo2e','netDifferenceKgCo2e'].map((field) => [field, items.reduce((sum, item) => sum + item[field], 0)]));
  const checks = [...new Set(items.flatMap((item) => item.checks))];
  if (budgetHkd !== undefined && totals.installationCostHkd > budgetHkd) checks.push('Total installation cost exceeds the entered budget.');
  return { projectId: regions[0].projectId, modelVersion: version, planId: plan.id, planName: plan.name, years, ...totals, items, checks, scope: 'Proposed greening interventions only; not a whole-building LCA or net-zero assessment. Plant carbon sequestration is excluded.' };
}
