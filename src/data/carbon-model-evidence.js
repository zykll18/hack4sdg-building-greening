// Reference scenario evidence reviewed 2026-10-14. Scenario assumptions are not measured IFC properties.
export const ROOF_REFERENCE = Object.freeze({
  id: 'sedum-fd25-reference-1', name: '景天轻型屋顶参考构造 / Sedum FD25 reference',
  substrateDepthM: .06, totalDepthM: .09, dryMassKgM2: 69.5, saturatedMassKgM2: 95.3,
  declaredSlopeMaxDegrees: 8, serviceLifeYears: null,
  layers: ['Protection Mat SSM 45', 'Floradrain FD 25', 'Filter Sheet SF', 'Sedum-Carpet substrate, 60 mm'],
  note: 'Named German reference assembly, not a specification or EPD match for the selected project/species. Do not scale its whole-system factor by substrate thickness.',
  exclusions: ['Project waterproofing/structural changes', 'Additional pitched-roof retention/fixings', 'Use-stage maintenance/replacement/irrigation', 'Plant sequestration', 'Module D credits']
});
export const HK_REFERENCE_CLIMATE = Object.freeze({
  id: 'hong-kong-cityuhk-26c-1', title: 'EnergyPlus Hong Kong CityUHK typical meteorological year',
  fileName: 'CHN_Hong.Kong.SAR.450070_CityUHK.epw', station: '450070', hours: 8760,
  latitude: 22.32, longitude: 114.17, timezone: 8, baseTemperatureC: 26,
  url: 'https://energyplus-weather.s3.amazonaws.com/asia_wmo_region_2/CHN/CHN_Hong.Kong.SAR.450070_CityUHK/CHN_Hong.Kong.SAR.450070_CityUHK.zip',
  documentationUrl: 'https://energyplus.readthedocs.io/en/v25.1.0/auxiliary-programs/auxiliary-programs.html',
  sha256: 'c51273cf8c126d44116127b2cbfee4c1d5996196bd2389267a51c40c1929da7d',
  // Sum max(hourly dry bulb - 26°C, 0), grouped by interval-start hour (EPW hour 1 is 00:00–01:00).
  degreeHoursByHour: Object.freeze([224.7,206.4,192.6,180.3,168,157.8,163.6,201.5,250.5,328.3,417.4,485.3,542,564.2,554.4,527.4,486.3,413.7,354.6,321.5,299.1,280.8,262,239.6]),
  reviewedAt: '2026-10-14', applicability: 'Historical typical year for a Hong Kong reference scenario; not the imported building location, current weather or a climate forecast.'
});
export const THERMAL_MODEL_SOURCES = Object.freeze([
  { title: 'Hong Kong Observatory: degree-day definitions', url: 'https://www.hko.gov.hk/tc/publica/reprint/files/r832.pdf', locator: 'PDF page 3: cooling base 26°C. Our implementation uses hourly EPW temperatures, not this paper’s plotted annual totals.' },
  { title: 'Growing-media thermal properties: laboratory measurements (2017)', url: 'https://www.mdpi.com/2075-5309/7/4/99', locator: 'Thermal conductivity varies with density, composition and moisture. The reference scenario does not claim a tested FD25 thermal conductivity.' },
  { title: 'Thermal Behavior of an Extensive Green Roof (2016)', url: 'https://www.iieta.org/journals/ijht/paper/10.18280/ijht.34S206', locator: 'Tables 2–3: prototype substrate conductivity 1.0 W/(m·K). Used as a sensitivity endpoint, not project material data.' },
  { title: 'EnergyPlus Engineering Reference: EcoRoof', url: 'https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/index.html', locator: 'Full coupled foliage/soil model route. This app implements only a steady-state conduction screening calculation, not EcoRoof/EnergyPlus.' }
]);
