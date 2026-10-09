import { assertQuantity, CALCULATION_VERSION } from './contract.js';

/** @param {import('./contract.js').ComparisonInput} input */
export function calculateScenario({ roof, scenario, years, budgetHkd }) {
  if (!roof.projectId || !roof.modelVersion || !roof.roofElementId || !scenario.id) {
    throw new TypeError('Project, model, roof, and scenario identifiers are required');
  }
  assertQuantity(roof.usableArea, 'm2', 'usableArea');
  for (const [field, unit] of [
    ['installationCostHkdM2', 'HKD/m2'],
    ['maintenanceCostHkdM2Year', 'HKD/m2/year'],
    ['installationKgCo2eM2', 'kgCO2e/m2'],
    ['annualAvoidedKgCo2eM2', 'kgCO2e/m2/year'],
    ['addedLoadKgM2', 'kg/m2']
  ]) assertQuantity(scenario[field], unit, field);
  if (roof.usableArea.value <= 0 || scenario.coverageFraction < 0 || scenario.coverageFraction > 1 ||
      !Number.isFinite(scenario.coverageFraction) || !Number.isInteger(years) || years < 1 ||
      (budgetHkd !== undefined && (!Number.isFinite(budgetHkd) || budgetHkd < 0))) {
    throw new RangeError('Area, coverage, years, or budget is outside its valid range');
  }

  const coverageM2 = roof.usableArea.value * scenario.coverageFraction;
  const installationCostHkd = coverageM2 * scenario.installationCostHkdM2.value;
  const maintenanceCostHkd = coverageM2 * scenario.maintenanceCostHkdM2Year.value * years;
  const installationKgCo2e = coverageM2 * scenario.installationKgCo2eM2.value;
  const avoidedOperationalKgCo2e = coverageM2 * scenario.annualAvoidedKgCo2eM2.value * years;
  const checks = [...scenario.checks];
  if (budgetHkd !== undefined && installationCostHkd > budgetHkd) checks.push('Installation cost exceeds the entered budget.');

  return {
    projectId: roof.projectId,
    modelVersion: roof.modelVersion,
    roofElementId: roof.roofElementId,
    areaProvenance: roof.usableArea.provenance,
    scenarioId: scenario.id,
    calculationVersion: CALCULATION_VERSION,
    years,
    coverageM2,
    installationCostHkd,
    maintenanceCostHkd,
    totalCostHkd: installationCostHkd + maintenanceCostHkd,
    installationKgCo2e,
    avoidedOperationalKgCo2e,
    netDifferenceKgCo2e: installationKgCo2e - avoidedOperationalKgCo2e,
    factors: {
      coverageFraction: scenario.coverageFraction,
      installationCostHkdM2: scenario.installationCostHkdM2,
      maintenanceCostHkdM2Year: scenario.maintenanceCostHkdM2Year,
      installationKgCo2eM2: scenario.installationKgCo2eM2,
      annualAvoidedKgCo2eM2: scenario.annualAvoidedKgCo2eM2,
      addedLoadKgM2: scenario.addedLoadKgM2
    },
    factorSources: {
      installationCost: scenario.installationCostHkdM2.source,
      maintenanceCost: scenario.maintenanceCostHkdM2Year.source,
      installationCarbon: scenario.installationKgCo2eM2.source,
      operationalSavings: scenario.annualAvoidedKgCo2eM2.source
    },
    checks
  };
}
