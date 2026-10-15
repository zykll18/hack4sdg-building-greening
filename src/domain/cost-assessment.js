import { carbonBasis } from './carbon-assessment.js';

export const COST_FIELDS = ['installationHkd', 'annualMaintenanceHkd'];
// Preserve old backups as evidence; these components are outside the simplified cost scope.
const LEGACY_COST_FIELDS = ['replacementHkd', 'endOfLifeHkd'];
export const costBasis = carbonBasis;
export function assessProjectCost({ input, basis, years }) {
  if (!Number.isInteger(years) || years < 1) throw new RangeError('Invalid cost period');
  const result = { status: 'data-needed', quality: 'user-inputs-not-independently-verified', currency: 'HKD', scope: 'installation-and-maintenance-only',
    installationCostHkd: null, maintenanceCostHkd: null, replacementCostHkd: null, endOfLifeCostHkd: null, totalCostHkd: null, input: null, missing: [] };
  if (input && input.basis !== basis) return { ...result, status: 'stale', missing: ['Reconfirm quotes for the current planting and period'] };
  const values = {};
  for (const field of [...COST_FIELDS, ...LEGACY_COST_FIELDS]) {
    const q = input?.[field];
    if (q == null) { values[field] = null; if (COST_FIELDS.includes(field)) result.missing.push(field); continue; }
    const unit = field === 'annualMaintenanceHkd' ? 'HKD/year' : 'HKD';
    if (!Number.isFinite(q.value) || q.value < 0 || (q.unit !== undefined && q.unit !== unit)) throw new TypeError('费用需要非负金额和正确单位 / Invalid cost amount or unit');
    if (typeof q.source !== 'string' || !q.source.trim() || q.source.length > 2000) throw new TypeError('费用参考需要来源，零值也需说明 / Cost source required');
    if (typeof q.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(q.date) || !Number.isFinite(new Date(q.date).getTime()) || new Date(q.date).toISOString().slice(0, 10) !== q.date) throw new TypeError('填写费用数据日期 / Cost date required');
    if (!['quote', 'measured', 'scenario'].includes(q.basis)) throw new TypeError('Invalid cost evidence type');
    values[field] = { value: q.value, unit, source: q.source.trim(), date: q.date, basis: q.basis, provenance: 'user-provided' };
  }
  result.installationCostHkd = values.installationHkd?.value ?? null;
  result.maintenanceCostHkd = values.annualMaintenanceHkd ? values.annualMaintenanceHkd.value * years : null;
  const components = [result.installationCostHkd, result.maintenanceCostHkd];
  if (components.some(value => value !== null && !Number.isFinite(value))) throw new RangeError('Cost exceeds numeric range');
  if (components.every(value => value !== null)) {
    result.totalCostHkd = components.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(result.totalCostHkd)) throw new RangeError('Cost exceeds numeric range');
    result.status = 'calculated';
  }
  result.input = input ? { basis, ...values } : null;
  return result;
}
