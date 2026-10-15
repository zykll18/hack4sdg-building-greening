// Historical local benchmark, not a current supplier quotation or 2026 budget.
export const HISTORICAL_ROOF_COST = Object.freeze({
  title: 'Hong Kong ArchSD: Study on Green Roof Application — Executive Summary',
  url: 'https://www.archsd.gov.hk/media/studies-and-report/study-on-green-roof-applications-in-hong-kong-executive-summary-by-architectural-service-department/1353-green-roofs-es-2007-02-16.pdf',
  date: '2007-02', locator: 'Printed page 9 / PDF page 11, §2.4 and footnote 8', currency: 'HKD',
  installationPerM2: Object.freeze({min:400,max:1000}),
  annualMaintenanceLabourPerM2: Object.freeze({min:.8,max:2.25}),
  note: '2007年名义价格，未作通胀或市场更新。安装为轻型绿化屋顶楼板以上构造的历史参考；维护仅为人工估算，基于京沪经验换算，报告当时未在香港验证。不能视为当前全包预算，特殊固定、修缮和进场条件需另评。'
});
