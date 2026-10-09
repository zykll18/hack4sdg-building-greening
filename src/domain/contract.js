/**
 * @typedef {'ifc' | 'user-confirmed' | 'assumed'} Provenance
 * @typedef {{ value: number, unit: string, provenance: Provenance, source: string }} Quantity
 * @typedef {{ projectId: string, modelVersion: string, roofElementId: string, usableArea: Quantity }} RoofInput
 * @typedef {{ id: string, name: string, description: string, coverageFraction: number,
 *  installationCostHkdM2: Quantity, maintenanceCostHkdM2Year: Quantity,
 *  installationKgCo2eM2: Quantity, annualAvoidedKgCo2eM2: Quantity,
 *  addedLoadKgM2: Quantity, checks: string[] }} GreeningScenario
 * @typedef {{ roof: RoofInput, scenario: GreeningScenario, years: number, budgetHkd?: number }} ComparisonInput
 */

export const CALCULATION_VERSION = 'demo-1';

export function assertQuantity(quantity, expectedUnit, field) {
  if (!quantity || !Number.isFinite(quantity.value) || quantity.unit !== expectedUnit ||
      !['ifc', 'user-confirmed', 'assumed'].includes(quantity.provenance) || !quantity.source) {
    throw new TypeError(`${field} needs a finite value, ${expectedUnit}, provenance, and source`);
  }
}
