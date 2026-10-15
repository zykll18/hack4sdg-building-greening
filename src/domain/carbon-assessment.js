import { CARBON_METHOD, ELECTRICITY_FACTORS } from '../data/carbon-evidence.js';
import { plantingProfile } from './planting-selection.js';

export function carbonBasis({ regions, plan, years }) {
  const entries = regions.map(region => ({
    id: region.id, modelVersion: region.modelVersion, projectId: region.projectId, type: region.type,
    area: region.usableArea.value, coverage: plantingProfile(region, plan).coverageFraction, plantId: region.planting?.plantId ?? null
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify({ planId: plan.id, years, regions: entries });
}
const sourceText = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new TypeError('Carbon input needs a bounded source / 碳数据需要来源说明');
  return value.trim();
};
function quantity(input, field) {
  if (input == null) return null;
  const unit = field === 'annualMaintenanceKgCo2e' ? 'kgCO2e/year' : 'kgCO2e';
  if (input.unit !== undefined && input.unit !== unit) throw new TypeError(`${field} has the wrong unit`);
  if (!Number.isFinite(input.value) || input.value < 0) throw new RangeError(`${field} must be finite and non-negative`);
  return { value: input.value, source: sourceText(input.source), provenance: 'user-provided', unit };
}
export function assessInterventionCarbon({ input, basis, years }) {
  if (!Number.isInteger(years) || years < 1) throw new RangeError('Invalid carbon assessment period');
  const result = {
    method: CARBON_METHOD, status: 'data-needed', quality: 'project-inputs-not-independently-verified', missing: [],
    upfrontKgCo2e: null, maintenanceKgCo2e: null, replacementKgCo2e: null, endOfLifeKgCo2e: null,
    operationalChangeKgCo2e: null, netDifferenceKgCo2e: null, electricityFactor: null, input: null
  };
  if (input && input.basis !== basis) return { ...result, status: 'stale', missing: ['Reconfirm inputs for the current model, regions, species, coverage and period.'] };
  const data = input ?? {};
  const fields = ['upfrontKgCo2e', 'annualMaintenanceKgCo2e', 'replacementKgCo2e', 'endOfLifeKgCo2e'];
  const quantities = Object.fromEntries(fields.map(field => [field, quantity(data[field], field)]));
  for (const field of fields) if (quantities[field] === null) result.missing.push(field);
  result.upfrontKgCo2e = quantities.upfrontKgCo2e?.value ?? null;
  result.maintenanceKgCo2e = quantities.annualMaintenanceKgCo2e ? quantities.annualMaintenanceKgCo2e.value * years : null;
  result.replacementKgCo2e = quantities.replacementKgCo2e?.value ?? null;
  result.endOfLifeKgCo2e = quantities.endOfLifeKgCo2e?.value ?? null;
  const factor = ELECTRICITY_FACTORS.find(item => item.id === data.electricityFactorId);
  if (data.electricityFactorId && !factor) throw new TypeError('Unreviewed electricity factor');
  if (data.energy != null) {
    const energy = data.energy;
    if (![energy.baselineKwhPerYear, energy.afterKwhPerYear].every(value => Number.isFinite(value) && value >= 0)) throw new RangeError('Energy inputs must be finite and non-negative');
    if (!['measured', 'modelled', 'scenario'].includes(energy.basis)) throw new TypeError('Invalid energy evidence basis');
    sourceText(energy.source);
    if (factor) result.operationalChangeKgCo2e = (energy.afterKwhPerYear - energy.baselineKwhPerYear) * factor.value * years;
  } else result.missing.push('before/after annual electricity with source');
  if (!factor) result.missing.push('electricity provider/year');
  result.electricityFactor = factor ?? null;
  result.input = input ? { basis, ...quantities, electricityFactorId: factor?.id ?? null, energy: data.energy ? {
    baselineKwhPerYear: data.energy.baselineKwhPerYear, afterKwhPerYear: data.energy.afterKwhPerYear,
    basis: data.energy.basis, source: sourceText(data.energy.source)
  } : null } : null;
  const values = [result.upfrontKgCo2e, result.maintenanceKgCo2e, result.replacementKgCo2e, result.endOfLifeKgCo2e, result.operationalChangeKgCo2e];
  if (values.some(value => value !== null && !Number.isFinite(value))) throw new RangeError('Carbon component exceeds the supported numeric range');
  if (values.every(value => value !== null)) {
    result.netDifferenceKgCo2e = values.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(result.netDifferenceKgCo2e)) throw new RangeError('Carbon totals exceed the supported numeric range');
    result.status = 'calculated';
  }
  return result;
}
