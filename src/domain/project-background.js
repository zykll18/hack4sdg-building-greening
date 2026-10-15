export const BUILDING_USES = Object.freeze({ residential: '住宅', office: '办公', school: '学校', commercial: '商业', mixed: '混合用途', other: '其他', unknown: '不确定' });
export const PROJECT_STAGES = Object.freeze({ new: '新建', retrofit: '改造', unknown: '不确定' });
export const IRRIGATION_OPTIONS = Object.freeze({ unknown: '未确认', low: '少量浇水', moderate: '定期浇水', high: '充足供水' });
export const BACKGROUND_DEFAULTS = Object.freeze({ buildingName: '', city: '香港', buildingUse: '', projectStage: '', budgetHkd: '', irrigation: 'unknown', maintenance: '' });
const boundedText = (value, limit) => {
  if (typeof value !== 'string' || value.length > limit) throw new TypeError('项目背景文字过长或格式无效');
  return value.trim();
};
const option = (value, options) => {
  if (typeof value !== 'string' || !Object.hasOwn(options, value)) throw new TypeError('请选择建筑用途和项目阶段，也可以选择不确定');
  return value;
};
/** User-reported context, never engineering measurements or permission to invent factors. */
export function normalizeProjectBackground(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('项目背景格式无效');
  if (raw.version != null && raw.version !== 'project-background-1') throw new TypeError('Unsupported project background version');
  const city = boundedText(raw.city, 80);
  if (!city) throw new TypeError('请填写项目城市，也可以填写不确定');
  const budgetHkd = raw.budgetHkd === '' || raw.budgetHkd == null ? null : Number(raw.budgetHkd);
  if (raw.budgetHkd != null && !['string', 'number'].includes(typeof raw.budgetHkd)) throw new TypeError('预算金额格式无效');
  if (budgetHkd !== null && (!Number.isFinite(budgetHkd) || budgetHkd < 0 || budgetHkd > 1e12)) throw new RangeError('预算需为有效的非负金额');
  return { version: 'project-background-1', source: 'user-reported', buildingName: boundedText(raw.buildingName ?? '', 80), city,
    buildingUse: option(raw.buildingUse, BUILDING_USES), projectStage: option(raw.projectStage, PROJECT_STAGES),
    budgetHkd, irrigation: option(raw.irrigation ?? 'unknown', IRRIGATION_OPTIONS), maintenance: boundedText(raw.maintenance ?? '', 300) };
}
export function validateSavedProjectBackground(saved) {
  if (saved == null) return null;
  if (typeof saved.confirmed !== 'boolean' || !saved.draft || typeof saved.draft !== 'object' || Array.isArray(saved.draft)) throw new TypeError('Invalid saved project background');
  const values = saved.values == null ? null : normalizeProjectBackground(saved.values);
  if (saved.confirmed && !values) throw new TypeError('Confirmed project background needs values');
  const draft = Object.fromEntries(Object.keys(BACKGROUND_DEFAULTS).map(key => [key, boundedText(saved.draft[key] ?? BACKGROUND_DEFAULTS[key], key === 'maintenance' ? 300 : 80)]));
  for (const [key, options] of [['buildingUse', BUILDING_USES], ['projectStage', PROJECT_STAGES], ['irrigation', IRRIGATION_OPTIONS]]) {
    if (draft[key] !== '' && !Object.hasOwn(options, draft[key])) throw new TypeError('Invalid saved project background option');
  }
  return { confirmed: saved.confirmed, values, draft };
}
export const isHongKongBackground = value => !value || /^(香港|香港特別行政區|香港特别行政区|hong\s*kong|hk)$/i.test(value.city.trim());
