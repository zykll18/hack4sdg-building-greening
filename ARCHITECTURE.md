# Building Greening — Presentation Architecture

## Required experience

A professional opens an authorized IFC building, defines roof, facade, balcony/terrace and ground regions, confirms their use and usable areas, compares two complete planting plans on the same model, switches before/after, and exports a consistent report and machine-readable handoff. IFC geometry remains the interactive page background. Project, Inspect, Compare and View are initially closed nonmodal panels; closing them preserves the model, inputs and camera.

```text
IFC / architectural sample
          ↓
That Open display geometry + stable GlobalId + model content hash
          ↓
Select component / choose candidate / define ground rectangle
          ↓
Extract display face → optional edge strip → user confirms type and usable area
          ↓
Shared region contract
          ↓
Light-touch plan / Landscape mix (systems for all four region types)
          ↓
Independent 3D overlays + deterministic region/aggregate calculations
          ↓
Before/after on original model + HTML report + JSON handoff
```

## Stack and module ownership

The browser app retains plain JavaScript, Vite, Three.js and the installed That Open Components/Components Front/Fragments/WebIFC/Camera Controls packages. No backend, UI framework replacement, new runtime dependency or directory change is introduced. Local files remain in the browser; bundled samples carry source links and redistribution notices.

- `src/adapters/bim-viewer.js` (A) owns initialization, IFC/Fragments import, camera, selection, candidate lookup, region preparation/confirmation, independent overlay rendering, model replacement and cleanup.
- `src/adapters/greening-geometry.js` (A) handles world transforms, face filtering, edge-strip clipping and area-proportional visual coverage. Separating geometry from browser lifecycle permits meaningful tests against original IFC triangles.
- `src/domain/greening-plan.js` (B/C integration) defines two presentation profiles for all four region types and aggregates the existing deterministic calculator. The original roof-shaped calculator input is an internal compatibility adapter; exported results use region identifiers. This avoids replacing working arithmetic or adding a second calculation engine.
- `src/domain/calculate.js` (B) retains unit/provenance validation and deterministic intervention arithmetic.
- `web/` (D) owns floating panels, region confirmation/list/removal, plan selection, before/after controls, comparison period/budget and report/JSON exports.
- `scripts/check-greening.mjs` tests original IFC geometry through face extraction, coverage and calculation without asserting browser or engineering acceptance.

## Region contract and provenance

A confirmed region includes `id`, project/model version, region type, IFC GlobalId/local ID when present, display geometry source, optional edge-strip crop or ground rectangle placement, display area estimate and a separately user-confirmed `usableArea` quantity. Display geometry comes from the loaded IFC, but its area is an estimate assuming the renderer coordinate unit is metres. The proposed role and usable area require explicit confirmation. IFC category matches are candidates, not automatic roof/terrace suitability decisions. Ground regions are user-defined design rectangles and are never labelled IFC boundaries or owned land.

The viewer rejects missing/current-model selection, geometry without a suitable display face, invalid dimensions, stale drafts, duplicate component assignment and overlapping ground rectangles. Confirmed usable area must fit within the selected display surface. Roof/terrace extraction keeps upward-facing triangles; facade extraction keeps outward-facing near-vertical triangles. User-selected edge strips clip existing triangles and preserve their holes/slopes. They do not infer an approved balcony boundary.

Each overlay uses confirmed area / extracted display area × system coverage fraction. Triangles shrink about their centroid by the square root of that fraction, producing the same proportional surface area as the deterministic coverage calculation. Green surfaces and small planting markers are concept visualization, not construction assemblies, species selection or a photoreal planting simulation. The original model object and source IFC bytes are never edited. Before hides overlays; After and plan changes rebuild them using the same region data. Model replacement/disposal clears drafts, selections, regions, GPU overlay geometries and materials.

## Calculations and report

Each plan uses the same regions, comparison period and budget. Per-region cost is installation plus period maintenance. Carbon difference is installation embodied emissions minus assumed avoided operational emissions over the period. Presentation profiles currently contain assumed factors, with explicit source/provenance. Terrace and ground profiles assume zero avoided operational emissions; no unsupported tree sequestration term is added. Aggregate budget checks use total installation cost across regions. Duplicate IDs or mixed model versions are rejected.

The HTML report and JSON handoff are generated from the same current region/plan inputs used on screen. They retain model version, IFC identity, ground placement/crops, confirmed areas, plan coverage, factors, calculation versions, totals, scope and unresolved checks. Names/properties are escaped in exported HTML. Report generation rejects missing regions or invalid comparison inputs. No external AI inference, government approval, certification or marketplace transaction is claimed by these exports; those integrations remain separate team responsibilities.

## Rendering and interface

The PostproductionRenderer uses shaded edges/ambient occlusion with technical/basic alternatives. Camera motion events disable expensive passes while moving and restore the selected style afterward. Rotation speed is 0.9, truck speed 1.8, dolly speed 2.2, smooth time 0.1 seconds and dragging smooth time 0.035 seconds. Full viewport size stays stable while panels open. Fit includes planned ground regions. Native dialog close buttons, same-button toggles and Escape support return focus; component selection opens Inspect without taking focus from the model. Narrow screens constrain panels above the dock with internal scrolling; reduced-motion preferences disable animations.

## Assets and licenses

That Open Components is the implementation foundation; xeokit-bim-viewer is a UI reference only. Installed Components/Components Front/Fragments/Three.js/Camera Controls/Vite use MIT; WebIFC uses MPL-2.0 and its WASM/license are copied unchanged during asset preparation. All sample-specific sources, source revisions, checksums and redistribution notices are recorded in `public/samples/README.md`.

KIT office/house designs are fictional architectural examples; Schependomlaan is a documented residential design dataset. They are not claims of engineering approval. Schependomlaan is stored losslessly gzipped to fit GitHub's API transport constraint; Node built-ins restore its original IFC and verify the published SHA-256 before development/build. The large residential source is fetched only when selected. Static preview PNGs come from actual placed geometry and are distinct from browser screenshots.

## Acceptance boundary

A complete presentation flow requires real browser checks listed in `TEAM_TASKS.md`: region selection/confirmation, all four uses, plan/Before/After switching, period/budget changes, removal/model replacement and matching exports. Unit, geometry and build checks do not establish GPU performance, visual polish or pointer/dialog behavior. Engineering/factor validation remains disclosed in every result; a greening concept and intervention calculation do not establish whole-building net-zero status.
