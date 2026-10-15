# Reference carbon model and evidence

Reviewed 2026-10-14. This is a source-backed reference scenario, not a validated project simulation. The operator provides planting geometry and basic conditions; the software computes the estimates rather than requiring the operator to supply final emissions.

## Product model

Source: [ZinCo Sedum Carpet / Floradrain FD25 EPD](https://www.epd-global.com/getfile.php/13249119-1773916336/EPDer/Byggevarer/Takbelegg_membraner/NEPD-11173-11173-2_Green-Roof-System--Sedum-Carpet---with-Floradrain---FD-25-.pdf), NEPD-11173-11173-2, issued 2026-03-17, valid through 2031-03-16. PDF p3–4 defines the assembly and quantities; p5–8 boundaries/scenarios; p9 GWP-total. Original PDF: [retained reference](roof-system-reference-epd.pdf). SHA-256: `07ec20661ca9f76fcd6e7b1f88f40678b9390431b1dae6e297078c9396f4c6df`.

The 1m² reference includes protection mat, FD25 drainage, filter and 60mm substrate; total height 90mm, system dry mass 69.5kg/m², saturated mass 95.3kg/m². It applies to roofs with no severe ponding up to about 8°. Service life is not defined. B1–B7 are undeclared.

Per reference m², GWP-total: A1–A3 5.59; A4 0.722; A5 6.94; C1 6.43; C2 0.361; C3 4.33; C4 1.72 kgCO2e. A1–A5 = 13.252. The reference's German transport/construction/disposal scenarios are retained explicitly; they are not inferred Hong Kong processes. D is excluded.

The software multiplies each module and the declared quantities by planted area. It does not multiply by decorative plant count or add another factor for each layer already included in the system EPD. Changing substrate thickness requires a new material model/factor; the complete factor cannot be scaled as if every component changed equally. Catalog Sedum lineare has a different guide depth (100–200mm); the reference is an analogy, not a plant-specific specification. Steep roofs add unmodelled retention/fixings. Facades, terraces, ground and other plants are outside this first reference model.

## Roof-conduction model

Source climate: [EnergyPlus Hong Kong CityUHK EPW](https://energyplus-weather.s3.amazonaws.com/asia_wmo_region_2/CHN/CHN_Hong.Kong.SAR.450070_CityUHK/CHN_Hong.Kong.SAR.450070_CityUHK.zip), [official data description](https://energyplus.readthedocs.io/en/v25.1.0/auxiliary-programs/auxiliary-programs.html). File `CHN_Hong.Kong.SAR.450070_CityUHK.epw`, station 450070, 22.32N 114.17E, UTC+8; 8760 hours. EPW SHA-256: `c51273cf8c126d44116127b2cbfee4c1d5996196bd2389267a51c40c1929da7d`.

The 26°C threshold is consistent with the [HKO degree-day definition](https://www.hko.gov.hk/tc/publica/reprint/files/r832.pdf), PDF p3. This implementation derives degree-hours from actual EPW hourly dry bulb, rather than digitizing HKO plots: total 7822 K·h; daily 08:00–18:00 subset 4569.5 K·h. It assumes Hong Kong as a reference location, not as an IFC-derived fact. Historic typical weather is not a forecast.

Reproduce:

```sh
node scripts/derive-carbon-climate.mjs /path/to/CHN_Hong.Kong.SAR.450070_CityUHK.epw
```

`R_added=d/λ`; `U_after=1/(1/U_before+R_added)`; potential annual cooling-electricity reduction `A×(U_before−U_after)×degree-hours/(1000×COP)`.

Default U = 0.5–2 W/m²K and COP = 3–5 are adjustable scenario assumptions, not measured or IFC-extracted values. Conductivity 0.17–1 W/mK is a deliberately broad, research-informed sensitivity assumption: [2017 laboratory growing-media study](https://www.mdpi.com/2075-5309/7/4/99) documents density/moisture dependence; [2016 prototype study](https://www.iieta.org/journals/ijht/paper/10.18280/ijht.34S206), Tables 2–3, uses 1W/mK. These are different substrates, not FD25 thermal tests. They do not establish confidence bounds or a validated predictive error.

The model only screens an added steady resistance under a hypothetical conditioned roof. Unknown AC includes zero cooling potential; non-AC counts no benefit within this energy boundary. Solar/shading, evaporation, moisture dynamics, storage, humidity, heating, attic coupling, roof insulation details and whole-building loads are absent. [EnergyPlus EcoRoof](https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/index.html) is the route to a fuller coupled model; it is not implemented here.

## Carbon scope and example

Period reference range = A1–A5 construction − potential roof-cooling electricity reduction × reviewed provider factor × years. [CLP 2025](https://sustainability.clpgroup.com/en/2025/esg-data-hub) electricity-sold factor 0.34kgCO2e/kWh was rechecked on 2026-10-14. The existing sourced HK Electric option remains available. Annual factors/operation are held constant, not projected.

For the adopted demo area 34.224m²: reference substrate 2.05344m³; A1–A5 453.536448kgCO2e. Default unknown AC/daytime gives 0–43.141122kWh/year potential. Over 20 years with CLP the modelled scope is 160.176817–453.536448kgCO2e. This is an increase in this partial scope, not a verified whole-building result.

Maintenance, replacement, irrigation and disposal timing are unknown, not zero. C-stage reference quantities are shown without adding them to a period with no disposal date. Plant sequestration and D are not credited. The actual project-input net assessment stays separate and retains priority if complete. The named sample roof exceeds the EPD slope scope, so its reference mismatch is explicitly disclosed. An estimate with sources is still conditional; more project data or a full model is needed to assess its actual net effect.
