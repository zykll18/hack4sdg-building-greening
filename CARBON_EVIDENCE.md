# Carbon calculation evidence

Reviewed 2026-10-14. Untraceable production carbon defaults have been removed. A separate source-backed reference model is now available; see [CARBON_MODEL_EVIDENCE.md](CARBON_MODEL_EVIDENCE.md). The project-input calculation below remains the correction path and is not overwritten by reference results. Cost references use optional sourced project inputs; structural loads still use illustrative rates. This document explains the implemented calculation and the project evidence it requires.

## Method and boundary

The [RICS Whole life carbon assessment, second edition](https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/construction-standards/whole-life-carbon-assessment) provides a lifecycle accounting framework covering construction, use and end of life. Our small intervention calculator uses those stage distinctions but does **not** implement all mandatory requirements or claim compliance. It compares incremental emissions against the no-intervention alternative for the chosen period:

```
Change (kgCO2e) = upfront materials/construction
               + annual non-electric maintenance × years
               + replacements within the period
               + disposal within the period
               + (after − baseline annual kWh) × provider factor × years
```

Positive means an increase; negative means a decrease within this specified boundary. Quantities are totals for the selected plan, not arbitrary rates multiplied by green area. Before/after electricity must use the same boundary, weather, occupancy and delivered service. Include irrigation electricity in the electricity comparison, avoiding double counting it as maintenance. For each component, document whether it is incremental or already part of the baseline. Only disposal occurring within the chosen period enters the period total; explain timing and any excluded later disposal. Explicit zero requires a reason and source; blank means unknown. Plant sequestration, module D credits and unspecified stages are not silently credited. Negative embodied-carbon credits are currently unsupported.

## Electricity sources

| Provider | Reporting year | kgCO2e/kWh sold | Primary source and locator |
| --- | --- | ---: | --- |
| CLP Power Hong Kong | 2025 | 0.34 | [CLP ESG Data Hub](https://sustainability.clpgroup.com/en/2025/esg-data-hub), Climate change, emissions intensity of electricity sold by CLP Power HK; before REC adjustment |
| HK Electric | 2025 | 0.59 | [Sustainability Report 2025](https://www.hkelectric.com/documents/en/CorporateSocialResponsibility/CorporateSocialResponsibility_CDD/Documents/SR2025E.pdf), printed p118 / PDF p120, CO2e per electricity unit sold |

These are historical annual inventory averages. Select the actual supplier; do not substitute the CLP Group generation metric. The app holds the selected factor and annual use constant for the comparison period: a scenario assumption, not a future grid forecast or causal marginal avoided-emissions factor. Reviewed records include provider, year, unit, source and locator. HK Electric PDF SHA-256: `c47ac33f2175f01e2bb295b1f281894c95f821e798f67c68c53beb1e26a351ec`.

## Product evidence example

[ZinCo Sedum Carpet / Floradrain FD 25 EPD, NEPD-11173-11173-2](https://www.epd-global.com/getfile.php/13249119-1773916336/EPDer/Byggevarer/Takbelegg_membraner/NEPD-11173-11173-2_Green-Roof-System--Sedum-Carpet---with-Floradrain---FD-25-.pdf), issued 2026-03-17, valid until 2031-03-16. Declared unit: 1 m²; German production reference. GWP-total table on PDF p9:

| Module | kgCO2e per declared m² |
| --- | ---: |
| A1–A3 | 5.59 |
| A4 | 0.722 |
| A5 | 6.94 |
| C1 | 6.43 |
| C2 | 0.361 |
| C3 | 4.33 |
| C4 | 1.72 |
| D, separately reported | −2.29 |

B1–B7 are MND, **not zero**. A1–A5 sum to 13.252; this does not include use-stage emissions. A4 assumes 100 km road transport. Hong Kong supply chains and installation/disposal need project evidence. This named assembly is an explicitly labelled analogy in the first Sedum-roof reference model, not a verified match to a project and never a default for facades, terraces or ground. PDF SHA-256: `07ec20661ca9f76fcd6e7b1f88f40678b9390431b1dae6e297078c9396f4c6df`.

## Energy benefit evidence and required inputs

- [Chan & Chow (2013), Energy and economic performance of green roof system under future climatic conditions in Hong Kong](https://doi.org/10.1016/j.enbuild.2013.05.015) supports evaluating roof energy effects with a validated building simulation under specified conditions. It does not establish a transferable kgCO2e/m²/year rate for this app.
- [Energy saving potential and life cycle environmental impacts of a vertical greenery system in Hong Kong: A case study (2016)](https://doi.org/10.1016/j.buildenv.2015.06.033) evaluates a particular facade case and lifecycle boundary; it is not a universal facade coefficient.
- [EnergyPlus engineering reference](https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/index.html) provides building-energy modelling documentation. EnergyPlus is **not integrated** into this app. IFC geometry alone does not provide annual electricity savings.

For a project estimate, obtain comparable metered use or a documented energy model, with weather, envelope/roof assembly, HVAC, schedules, occupancy and irrigation assumptions. Material quantities need matched product EPDs, transport, site works, maintenance, replacement schedule and disposal scenarios. The app records whether energy is measured, modelled or an illustrative scenario. Sources typed into the form are user-provided and **not independently verified** by the application. No species appearance, decorative plant count or AI response creates a carbon factor.

## Implemented behavior and validation

Compare uses one current adopted planting proposal against the original building, with one form for incremental lifecycle totals and matched before/after electricity. Original zero added area/incremental cost is a reference; existing greenery, operating costs and whole-building carbon are not inventoried. Missing components keep the net result unknown while showing any known components. Model/region/area/species/coverage/period changes invalidate prior accepted inputs; switching Before/After only hides/restores overlays. Model replacement clears inputs. HTML and JSON exports preserve the explicit baseline/proposal, sources, units, factor year, method, component totals and unknown/stale status. Dashboard uses the current proposal result. The complete local project and portable project backup preserve raw/accepted inputs and their original evidence fingerprints. Comparison exports retain results and sources but do not replace a full model backup.

Synthetic verification example, **not project evidence**: upfront 1,000 kg; annual non-electric maintenance 10 kg/year; replacement 200 kg; disposal 100 kg; baseline/after electricity 1,000/500 kWh/year; 20 years. CLP 2025 gives 1,000 + 200 + 200 + 100 − 3,400 = −1,900 kgCO2e. HK Electric gives −4,400 kgCO2e. The different outcome follows the selected supplier, not a change in plants. Tests also cover energy increases, missing components, invalid units/sources, overflow, stale inputs and export escaping.
