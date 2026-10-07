# Architecture design (prototype)

## Goal and boundary

The first demo helps a building professional compare two green-roof concepts for one authorised IFC model. It is a decision-support prototype. A green overlay is a proposed intervention, not a structural design, a modified IFC deliverable, or proof of net-zero certification.

## Data flow

```text
Architect / BIM coordinator exports IFC
             |
             v
That Open viewer -> selected roof ID and IFC properties
             |
             v
Normalize quantities and units -> user verifies missing inputs
             |
             v
Deterministic baseline and scenario calculations
             |
             v
Constraint-checked scenario proposals -> 3D overlay and comparison report
```

The developer or building owner reviews the options. A qualified professional must review structural loading, waterproofing, drainage, and maintenance before implementation.

## Shared contract

Every result must carry the project/model version, stable roof element ID, area in square metres, input provenance (`ifc`, `user-confirmed`, or `assumed`), scenario ID, calculation version, and factors used. All carbon results must state their scope and units. A scenario result must preserve any unresolved engineering checks and must not silently turn an assumption into a measured fact.

## Module boundaries

- **BIM and 3D viewer:** That Open Components loads and displays IFC geometry, exposes element IDs/properties, and shows an independent greening overlay. This workstream owns the viewer component interface.
- **Building data and calculation:** Normalizes IFC quantities, records assumptions, and calculates a reproducible baseline and scenario impacts. The language model never performs the final arithmetic.
- **Scenario and AI:** Suggests two green-roof options in a structured format, explains trade-offs, and routes proposals through explicit constraints.
- **Frontend and integration:** Builds project upload, input confirmation, comparison dashboard, and report screens, then integrates the viewer and calculation/scenario outputs.

The first implementation may run locally in the browser with a single sample IFC. A backend, database, authentication, and external AI service should be introduced only when the demo requires them. Before adding a backend dependency, changing directories or frameworks, or defining custom error codes, document the reason and update this file.

## First executable scaffold (7 October 2026)

This first scaffold uses browser-native JavaScript modules and Node's built-in development server and test runner. It adds **no third-party dependency**. This choice makes the shared contract and comparison arithmetic runnable while package-registry access is unavailable. It does **not** replace the selected That Open foundation: workstream A will connect its IFC viewer through `BimViewerPort` when package access and an authorized sample IFC are available. React, Vite, a backend, and a database are deferred because the current simple demo shell does not need them. Introducing any of these later requires recording the concrete need and integration boundary here.

```text
web/                    D: page, concept illustration, interactions
src/adapters/            A: IFC viewer boundary (currently unimplemented)
src/domain/contract.js   shared identifiers, units, provenance
src/domain/calculate.js  B: deterministic cost/carbon arithmetic
src/data/demo.js         C: two labelled illustrative scenarios
tests/                  unit and evidence-boundary checks
scripts/                local development server
```

The UI never treats a selected `.ifc` file as parsed. The example roof has an explicit `DEMO-ROOF-01` identifier and `assumed` provenance. A user-edited roof area becomes `user-confirmed` only as a UI input label; the page still asks for professional verification. The architecture is ready for a real IFC adapter to return stable element IDs and quantities, followed by a confirmation step before calculation.

The first calculation covers **only the proposed green-roof intervention**. For a horizon of `N` years, covered area is usable roof area × scenario coverage. Cost is installation plus `N` years of maintenance. Carbon difference is installation embodied emissions minus `N` years of assumed avoided operational emissions. The factors in `src/data/demo.js` are illustrative placeholders without external evidence; outputs must not be presented as measured performance, whole-building baseline, carbon offsets, or net-zero certification. Future work must add source-backed factors, local energy modelling and maintenance/end-of-life effects before making stronger claims. Carbon sequestration is excluded entirely from this first calculation.

The `BimViewerPort` handoff for workstream A accepts an IFC file and returns actual model version and roof element IDs, then supports element highlighting and independent scenario overlays. Workstream B owns quantity validation and factor provenance. Workstream C may use AI to propose and explain options, but submits structured parameters to B's deterministic calculation. Workstream D keeps the UI synchronized with those results. There are no custom error codes; standard JavaScript errors indicate invalid inputs.

## References and licenses

[That Open Components](https://github.com/ThatOpen/engine_components) is the selected viewer foundation. [xeokit-bim-viewer](https://github.com/xeokit/xeokit-bim-viewer) is a user-interface reference only. Review the exact package licenses before incorporating source code or assets; do not copy xeokit implementation into this prototype without an explicit license review.
