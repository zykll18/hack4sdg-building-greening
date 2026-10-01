# Technical Team Workstreams

Our shared demo: open one authorized IFC model, select a roof, confirm missing inputs, compare two green-roof scenarios, and show consistent 3D and report results. Workstream letters are placeholders until teammates are assigned.

| Workstream | Responsibility | First deliverable |
| --- | --- | --- |
| **A — BIM and 3D** | Integrate That Open Components; import IFC; select roof elements; expose element IDs and properties; show before/after overlays. | Roof selection returns its ID and properties; scenario switching updates the overlay. |
| **B — Building data, carbon, and cost** | Normalize IFC quantities and units; record missing or confirmed inputs; implement deterministic baseline and scenario calculations with visible factors. | Reproducible, unit-checked comparison for the same roof. |
| **C — Greening scenarios and AI** | Define two green-roof systems and constraints; produce structured proposals; validate area, budget, and engineering checks; explain trade-offs. | Two proposals with reasons and unresolved checks. AI does not perform final arithmetic or declare structural approval. |
| **D — Product integration and demo** | Connect upload, viewer, input review, comparison panel, and report; run the end-to-end demo. | Browser flow from IFC upload to synchronized 3D and numerical results. |

## Shared handoff

Agree on a permitted sample IFC and a common contract before parallel implementation: model version, roof element ID, area in square metres, input provenance (`ifc`, `user-confirmed`, or `assumed`), scenario ID, and calculation version. A owns viewer mapping; B owns normalized data and calculations; C consumes verified inputs and returns proposals; D integrates the flow. B–D can use the same mock contract while A validates IFC import.

## First checkpoint

1. A demonstrates IFC import, roof selection, and property access.
2. B demonstrates a unit-checked baseline and two comparable calculations.
3. C demonstrates two proposals that pass constraints or explain why they fail.
4. D demonstrates the full flow with mock data, then connects A–C outputs.

Structural load, drainage, and waterproofing remain professional review items unless verified data are supplied.
