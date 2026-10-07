const assumed = (value, unit) => ({ value, unit, provenance: 'assumed', source: 'Illustrative demo assumption; replace with project evidence' });

export const demoRoof = {
  projectId: 'DEMO-BUILDING-01',
  modelVersion: 'demo-model-1',
  roofElementId: 'DEMO-ROOF-01',
  usableArea: assumed(800, 'm2')
};

export const demoScenarios = [
  {
    id: 'extensive', name: 'Extensive green roof', description: 'Lower-maintenance planting across 60% of the usable roof.',
    coverageFraction: 0.6,
    installationCostHkdM2: assumed(1200, 'HKD/m2'),
    maintenanceCostHkdM2Year: assumed(70, 'HKD/m2/year'),
    installationKgCo2eM2: assumed(100, 'kgCO2e/m2'),
    annualAvoidedKgCo2eM2: assumed(9, 'kgCO2e/m2/year'),
    addedLoadKgM2: assumed(120, 'kg/m2'),
    checks: ['Structural capacity is unverified.', 'Waterproofing and drainage need professional review.']
  },
  {
    id: 'intensive', name: 'Intensive green roof', description: 'Deeper planting across 40% of the usable roof.',
    coverageFraction: 0.4,
    installationCostHkdM2: assumed(2200, 'HKD/m2'),
    maintenanceCostHkdM2Year: assumed(130, 'HKD/m2/year'),
    installationKgCo2eM2: assumed(170, 'kgCO2e/m2'),
    annualAvoidedKgCo2eM2: assumed(15, 'kgCO2e/m2/year'),
    addedLoadKgM2: assumed(300, 'kg/m2'),
    checks: ['Structural capacity is unverified.', 'Waterproofing and drainage need professional review.']
  }
];
