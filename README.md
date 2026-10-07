# Building Greening Decision Support

An IFC-first prototype for building professionals to compare green-roof options. The initial user is an architect, BIM coordinator, or sustainability designer; the developer or building owner reviews the resulting options.

## MVP demonstration

An authorized project team exports an architectural IFC model. The user opens it in a That Open-based 3D workspace, selects a roof, verifies the usable area and missing project inputs, and compares two greening scenarios. The result shows the 3D overlay, cost and carbon assumptions, unresolved engineering checks, and a short report.

That Open Components is the selected BIM viewer foundation. The calculation and scenario logic are project-specific and remain separate from the viewer. A model overlay is a concept preview, not an edited construction BIM model or structural approval.

## Team

See [TEAM_TASKS.md](TEAM_TASKS.md) for the four workstreams, deliverables, and integration contract.

## Current scope

- One permitted sample IFC and one roof area.
- IFC import, component selection, and stable mapping to project data.
- Two green-roof options with explicit assumptions and missing-data flags.
- Deterministic cost and carbon comparison plus an explainable AI recommendation.
- A complete, repeatable browser demo.

Photo-based modelling, voice input, supplier matching, and certification submission are later extensions.

## Starting points

- [That Open Components](https://github.com/ThatOpen/engine_components) — selected IFC/BIM viewer foundation.
- [xeokit-bim-viewer](https://github.com/xeokit/xeokit-bim-viewer) — interaction-design reference only; its SDK is not part of this MVP.

## Run the current scaffold

With Node.js 20.11 or newer, run `npm run dev` and open `http://127.0.0.1:5173/`. Run `npm test` to verify the comparison arithmetic. No package installation is needed.

The current browser prototype displays two **illustrative** green-roof scenarios with editable roof area, period, and budget. Its building image is a 2D concept illustration. Selecting an IFC file only acknowledges the file; it does not parse it or replace the demo roof. That Open integration, real 3D element selection, sourced factors, AI proposals, and a report export are next integration tasks. See [ARCHITECTURE.md](ARCHITECTURE.md) for the data contract and computation boundary.
