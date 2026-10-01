# Technical Team Workstreams

The four workstreams share one end-to-end acceptance test: open the same authorized IFC sample, select a roof, confirm missing inputs, compare two green-roof scenarios, and produce a consistent 3D view and report. The letters below are workstream labels, not assigned team members.

| Workstream | Owner's responsibility | First reviewable deliverable |
| --- | --- | --- |
| **A — BIM and 3D viewer** | Integrate That Open Components; import the sample IFC; select and highlight roof elements; expose stable element identifiers and available properties; render a separate before/after greening overlay. Own the 3D viewer component and its interface to the rest of the frontend. | Clicking a roof returns its identifier and properties, and changing scenarios updates the overlay. |
| **B — Building data, carbon, and cost** | Normalize IFC quantities and units; record missing or user-confirmed inputs; implement deterministic baseline and scenario calculations with visible factors and assumptions. | A small, reproducible calculation that uses the same roof and inputs for both scenarios. |
| **C — Greening scenarios and AI** | Define two green-roof systems and their constraints; produce structured scenario proposals; validate them against area, budget, and engineering checks; explain the trade-offs. AI does not supply final arithmetic or declare structural approval. | Two valid proposals, with reasons and unresolved checks, using the shared calculation interface. |
| **D — Frontend, integration, and demo** | Build the web app pages and interactions: project creation, IFC upload, input review, scenario comparison dashboard, and report view. Integrate A's 3D viewer and B/C's data, maintain the demo environment, and run end-to-end checks. | A usable browser flow from IFC upload to a report with synchronized 3D and numerical results. |

## Shared handoff before parallel implementation

Agree on one sample IFC and a small common contract: project/model version, roof element ID, area in square metres, input provenance (ifc, user-confirmed, or assumed), scenario ID, and calculation version. A owns the 3D viewer and viewer-to-element mapping; B owns normalized quantities and calculations; C consumes verified inputs and returns proposed scenarios; D owns the rest of the frontend and integrates the flow. B, C, and D may work against the same mock contract while A validates IFC import.

## First checkpoint

1. A demonstrates IFC import, roof selection, and property access with That Open.
2. B demonstrates a unit-checked baseline and two comparable calculations.
3. C demonstrates two proposals that pass the agreed constraints or clearly report why they fail.
4. D demonstrates the upload, input review, dashboard, and report screens using mock data, then integrates A's viewer and B/C outputs.

After this checkpoint, prioritize integration and correctness over adding new features. Structural load, drainage, and waterproofing remain professional review items unless verified data are supplied.
