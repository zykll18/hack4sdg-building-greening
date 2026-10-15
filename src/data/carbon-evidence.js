// Reviewed primary sources, 2026-10-13. Electricity sold, not group generation.
export const CARBON_METHOD = Object.freeze({
  version: 'intervention-carbon-1',
  scope: 'Period intervention estimate; not a whole-building LCA, certified reduction or marginal-grid avoided-emissions claim.',
  standard: { title: 'RICS Whole life carbon assessment, 2nd edition', url: 'https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/construction-standards/whole-life-carbon-assessment' },
  exclusions: ['Plant carbon sequestration', 'Module D credits', 'Unspecified lifecycle modules and other fuels'],
  timeAssumption: 'Historical annual-average electricity factor and annual energy/maintenance inputs held constant; no future grid forecast.',
  baseline: 'Embodied inputs must be incremental against the same no-intervention baseline; energy inputs need comparable weather, occupancy and service levels.'
});
export const ELECTRICITY_FACTORS = Object.freeze([
  Object.freeze({ id: 'clp-2025', provider: 'CLP Power Hong Kong / 中電', year: 2025, value: .34, unit: 'kgCO2e/kWh', provenance: 'published-provider',
    title: 'CLP 2025 Sustainability Report — ESG Data Hub', url: 'https://sustainability.clpgroup.com/en/2025/esg-data-hub',
    locator: 'Climate change → CLP Power Hong Kong → CO2e emissions intensity of electricity sold, 2025',
    applicability: 'CLP Power Hong Kong electricity sold before REC adjustment; not group generation intensity.', reviewedAt: '2026-10-13' }),
  Object.freeze({ id: 'hke-2025', provider: 'HK Electric / 港燈', year: 2025, value: .59, unit: 'kgCO2e/kWh', provenance: 'published-provider',
    title: 'HK Electric Investments Sustainability Report 2025', url: 'https://www.hkelectric.com/documents/en/CorporateSocialResponsibility/CorporateSocialResponsibility_CDD/Documents/SR2025E.pdf',
    locator: 'Printed page 118 / PDF page 120: CO2e per electricity unit sold, 2025',
    applicability: 'HK Electric electricity sold. Annual inventory factor; no future or marginal factor.', reviewedAt: '2026-10-13',
    sha256: 'c47ac33f2175f01e2bb295b1f281894c95f821e798f67c68c53beb1e26a351ec' })
]);
// Auditable example; never automatically assigned to a project region.
export const GREEN_ROOF_EPD = Object.freeze({
  id: 'NEPD-11173-11173-2', product: 'Zinco Sedum Carpet with Floradrain FD 25', manufacturer: 'Zinco GmbH',
  unit: 'm2', metric: 'GWP-total / kgCO2e', country: 'DE', issueDate: '2026-03-17', validUntil: '2031-03-16', studyYear: 2023,
  url: 'https://www.epd-global.com/getfile.php/13249119-1773916336/EPDer/Byggevarer/Takbelegg_membraner/NEPD-11173-11173-2_Green-Roof-System--Sedum-Carpet---with-Floradrain---FD-25-.pdf',
  locator: 'Pages 1, 3, 6–7, 9; 1 m2; 90 mm; A4 road haul 100 km.',
  modules: Object.freeze({ 'A1-A3': 5.59, A4: .722, A5: 6.94, C1: 6.43, C2: .361, C3: 4.33, C4: 1.72, D: -2.29 }),
  undeclared: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'],
  applicability: 'Named German system only. Hong Kong shipping/construction and disposal require adjustment. Undeclared B modules are unknown, not zero.',
  sha256: '07ec20661ca9f76fcd6e7b1f88f40678b9390431b1dae6e297078c9396f4c6df', reviewedAt: '2026-10-13'
});
export const GREENING_RESEARCH = Object.freeze([
  { title: 'Chan & Chow (2013): Energy and economic performance of green roof system under future climatic conditions in Hong Kong',
    url: 'https://doi.org/10.1016/j.enbuild.2013.05.015', role: 'Office/weather/construction case study using EnergyPlus; no universal annual per-m2 carbon rate.' },
  { title: 'Energy saving potential and life cycle environmental impacts of a vertical greenery system in Hong Kong: A case study (2016)',
    url: 'https://doi.org/10.1016/j.buildenv.2015.06.033', role: 'Vacant residential flats; material, transport, use and end-of-life boundaries. No automatic transfer to arbitrary buildings.' },
  { title: 'EnergyPlus 26.2 Engineering Reference — EcoRoof',
    url: 'https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/index.html',
    role: 'Project simulation route. The app does not run EnergyPlus or infer annual savings from IFC area.' }
]);
