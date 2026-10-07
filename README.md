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

With Node.js 20.19+ or 22.12+, run `npm ci`, then `npm run dev` and open `http://127.0.0.1:5173/`. Run `npm test` for calculation/selection checks and `npm run build` for a production build. `npm run preview` serves that build locally.

The Task A viewer loads a local IFC file, converts it to Fragments, displays real geometry, fits the camera, and supports click selection/highlighting. The selection panel shows name, IFC type, GlobalId when available, local ID, content-based model version, and source attributes. **Open sample model** offers the detailed official That Open school architecture Fragments model, the school structural IFC for conversion testing, and the compact buildingSMART IFC4 house. All three load locally without an external network download. The architecture sample is clearly labelled as preconverted IFC-derived Fragments, rather than an original IFC upload. Attribution and its CC BY 4.0 notice are in `public/samples/`. Selected local IFC files remain in the browser.

For a data-only integration check, run `npm run test:ifc -- /path/to/model.ifc`. It validates source geometry, converts the file to Fragments, and checks converted display-component identities using the same engine data API. It does not replace a browser/WebGL interaction check. The buildingSMART sample returns 18 source geometry entries and 13 converted display components; see [VIEWER_EXPERIMENT.md](VIEWER_EXPERIMENT.md) for the measured results and comparison with official examples.

The cost/carbon comparison still uses two **illustrative** scenarios and a separate demo roof. Selecting an IFC component does not confirm usable roof area or automatically update those calculations. Roof candidate selection, verified quantity handoff, greening overlays, sourced factors, AI proposals, and report export are the next integration tasks. See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and computation boundaries.

### Detailed model display

The workspace now provides a large 3D viewport, right-hand component inspector, model-category counts, roof and 3D camera views, an expandable viewport, a ground grid, and shaded/technical/basic rendering. These reuse the installed That Open components. Basic rendering is available when GPU cost is a concern. The cost/carbon comparison remains below the model as an independent illustrative calculation; it is not a change to the displayed geometry.
