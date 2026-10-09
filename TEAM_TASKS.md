# Technical Team Workstreams — Presentation Acceptance

The required demonstration is a complete flow: open an authorized IFC building, define roof/facade/balcony-or-terrace/ground regions, confirm their use and usable areas, compare two plans on the same model, switch before/after, and export consistent results. A viewer with unrelated sample calculations does not satisfy acceptance. These workstreams are responsibilities, not names of assigned team members.

| Workstream | Responsibility | Required presentation deliverable |
| --- | --- | --- |
| **A — BIM and 3D viewer** | Integrate That Open, import IFC, select/highlight components, preserve model version and GlobalIds, support four region types, and render independent scenario overlays. Support user-defined ground rectangles and edge strips of existing geometry. Own the viewer interface and cleanup. | Confirmed regions produce planting overlays; Before restores the same original model; both plans use the same regions; replacement removes all old regions. |
| **B — Building data, carbon and cost** | Normalize IFC quantities/units, validate confirmed inputs, provide traceable factors, compute deterministic costs and carbon with clear scope, and report missing engineering evidence. | Both plans use the same confirmed region inputs and comparison period. Per-region and aggregate results match their report and disclose factor provenance. |
| **C — Greening scenarios and AI** | Define compatible systems for all four region types, apply constraints and produce structured proposals/explanations. Connect any real AI service separately and disclose whether explanation is model-generated or rule-based. | Two region-compatible plans with reasons and unresolved checks. AI does not supply final arithmetic or declare structural approval. |
| **D — Frontend, integration and demo** | Integrate full-viewport IFC workspace, floating panels, area confirmation, plan comparison, before/after controls and report/handoff export. Run the demonstration in a browser. | A presenter can complete the flow without switching models or substituting unrelated numerical examples. All visible controls work and exports match the current model and regions. |

## Shared handoff

Each confirmed region carries `id` (the region identifier), `projectId`, `modelVersion`, `type` (`roof`, `facade`, `terrace`, `ground`), IFC `globalId`/`localId` when available, geometry source, optional surface crop or ground placement, screening reasons/missing checks and explicit constraint acknowledgement, and `usableArea` with value/unit/provenance/source. Ground designs are not fabricated IFC entities. IFC identity provenance does not imply the proposed use or area is verified. Geometry area estimates assume renderer coordinates are metres and require confirmation.

Plan results carry model version, plan ID, comparison period, calculation version, per-region coverage and impacts, factors and provenance, aggregate costs/carbon, and unresolved checks. A controls the displayed coverage using the same region area and system fraction supplied to the calculation. B owns independent quantity/factor verification; C owns proposal logic; D owns report/UI integration.

## Required browser acceptance

1. Load the KIT office example and a user-selected IFC. Confirm stable model/element identity and usable camera navigation.
2. Add confirmed roof, facade and terrace regions from displayed IFC geometry. Use a model with an explicit balcony/terrace identity to demonstrate that region. If a model has no compatible terrace, show the empty candidate state instead of assigning an ordinary slab. Edge strips only crop an already compatible surface.
3. In Inspect, find screened candidates, review reasons/missing checks, locate the component, and acknowledge exterior/available area before confirmation. Verify voice transcription review, manual submission, permission/error fallback and abort on close/replacement. No AI service is connected.
4. Define a ground rectangle outside the conservative building footprint, set its dimensions/offsets, and confirm its available area and use.
5. Switch Light-touch / Landscape mix and Before / After. Original IFC geometry stays unchanged; overlays and comparison results use the same region inputs.
6. Edit period/budget, remove a region and confirm both plans and exports update consistently.
7. Replace the model while retaining no regions, selections or overlays from the old version. Reject stale drafts and duplicate component assignments.
8. Download the HTML report and JSON handoff and verify identities, inputs, factor provenance and totals match the screen.

Structural loading, facade fixings, fire/access strategy, waterproofing, irrigation, drainage, ground ownership/utilities and factor evidence remain professional review requirements. They are unresolved checks in the presentation, not claims of approval or certification. The current comparisons cover proposed greening interventions only; they do not establish whole-building emissions, carbon offsets, net-zero status or government eligibility.
