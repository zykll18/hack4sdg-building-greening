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

## Runtime and ownership

The browser application uses plain JavaScript, Vite, and the selected That Open viewer foundation. Node's built-in test runner verifies the pure calculation and selection-data modules. A backend, database, and UI framework are deferred until a specific integration requirement justifies them. Dependency reasons for the first IFC milestone are recorded below.

```text
web/                    D: page, viewer mounting, interactions
src/adapters/            A: IFC viewing, selection and data handoff
src/domain/contract.js   shared identifiers, units, provenance
src/domain/calculate.js  B: deterministic cost/carbon arithmetic
src/data/demo.js         C: two labelled illustrative scenarios
tests/                  unit and evidence-boundary checks
scripts/                generated WASM assets and IFC integration checks
```

The viewer displays actual parsed IFC geometry and attributes. The numerical comparison remains a separate example roof with an explicit `DEMO-ROOF-01` identifier and `assumed` provenance. A user-edited example area becomes `user-confirmed` only as a UI input label; the page still asks for professional verification. Selecting an IFC element does not yet populate usable roof area. The next integration step is a roof-quantity handoff followed by explicit confirmation before calculation.

The first calculation covers **only the proposed green-roof intervention**. For a horizon of `N` years, covered area is usable roof area × scenario coverage. Cost is installation plus `N` years of maintenance. Carbon difference is installation embodied emissions minus `N` years of assumed avoided operational emissions. The factors in `src/data/demo.js` are illustrative placeholders without external evidence; outputs must not be presented as measured performance, whole-building baseline, carbon offsets, or net-zero certification. Future work must add source-backed factors, local energy modelling and maintenance/end-of-life effects before making stronger claims. Carbon sequestration is excluded entirely from this first calculation.

Workstream A's first viewer handoff accepts an IFC file and returns the content-based model version, file name, and display component count. Its selection callback returns IFC identity and attributes. Roof-candidate quantities and independent scenario overlays will extend this port in the next milestone. Workstream B owns quantity validation and factor provenance. Workstream C may use AI to propose and explain options, but submits structured parameters to B's deterministic calculation. Workstream D keeps the UI synchronized with those results. There are no custom error codes; standard JavaScript errors indicate invalid inputs.

## Task A: IFC viewer foundation

This milestone replaces the concept illustration with actual IFC geometry and component selection. Vite is introduced to resolve npm modules, bundle the Fragments worker, and build the browser application. The application remains plain JavaScript; no UI framework or backend is introduced. `@thatopen/components` provides the scene and IFC loader, `@thatopen/components-front` provides selection highlighting, `@thatopen/fragments` supplies the matching worker, `three` supplies rendering primitives, `web-ifc` supplies IFC/WASM parsing, and `camera-controls` satisfies the viewer camera peer dependency. Versions are pinned and a lockfile records the resolved dependency tree.

Vite serves `web/` as its entry directory. `public/wasm/` contains generated parser assets copied from the installed `web-ifc` package by `scripts/prepare-assets.mjs`; these generated assets are not committed. The previous custom development server is replaced by Vite's standard development/preview commands. This avoids introducing a second custom asset loader or a backend for the milestone.

The viewer adapter owns initialization, file replacement, click selection, properties, camera fit, and cleanup. Selected elements are handed off with model version, IFC GlobalId where available, local selection ID, name, category, and source properties. It does not automatically classify the selected component as usable roof area or feed guessed quantities into the calculator. IFC viewing and the illustrative carbon comparison remain labelled independently until the quantity-confirmation workstream is integrated. The official That Open sample can be loaded for testing; its download source is shown in the UI.

## Architectural test sample and import coverage

`public/samples/` bundles buildingSMART's compact IFC4 `Building-Architecture.ifc` with its CC BY 4.0 notice, exact source revision, and attribution. A local sample removes external network variability from the initial viewer experiment. The sample includes an `IfcRoof` aggregate, two roof `IfcSlab` components, walls, and a chimney. The selectable roof geometry belongs to the slabs; the aggregate roof identity is retained as data and must not be presented as a missing roof just because it is not a separate rendered component.

The default Fragments importer is retained to match the official IFC-loading baseline. In this sample, the parser reports no placed geometry for the aggregate roof or chimney; the roof slabs carry the roof geometry. The data-only smoke check reports source geometry entries separately from converted display components and verifies that each converted component retains its IFC GlobalId. Different counts are not automatically evidence of missing geometry. These checks do not validate browser WebGL output or pointer picking.

## References and licenses

[That Open Components](https://github.com/ThatOpen/engine_components) is the selected viewer foundation. [xeokit-bim-viewer](https://github.com/xeokit/xeokit-bim-viewer) is a user-interface reference only. The installed Components, Components Front, Fragments, Three.js, Camera Controls, and Vite packages use MIT; [web-ifc](https://github.com/ThatOpen/engine_web-ifc) uses MPL-2.0 and its WASM is redistributed unchanged with the package license copied alongside it. Do not copy xeokit implementation into this prototype without an explicit license review.

## Task A: detailed model review workspace

The review page now prioritizes a wide 3D viewport, with model inputs/content counts on the left, component properties on the right, and the illustrative scenario comparison below. The layout remains plain JavaScript/CSS and uses the existing dependency set. No backend, framework replacement, or new dependency is introduced.

The viewer replaces `SimpleRenderer` with That Open's already-installed `PostproductionRenderer`. Its color/edge/ambient-occlusion preset and SMAA give BIM geometry clearer boundaries and depth. Technical drawing and basic rendering are selectable; basic rendering disables postproduction for slower devices. An isolated That Open grid is placed below the model bounding box. Camera/model synchronization follows the official examples when projections change. Roof view changes the camera only; it does not identify or validate a roof automatically. Expanded view gives the same renderer more screen space and relies on its existing resize observer.

Two official That Open school samples are bundled unchanged at revision `8479a7c5c6a3c0cf8c7ceab1d1fb329a3f7d1922`, with the repository's MIT license and source attribution. `school_arq.frag` is the same architecture model used in the official Highlighter/rendering examples. It demonstrates the richer model and its IFC-derived component data, but bypasses IFC parsing because it has already been converted. `school_str.ifc` tests the full IFC-to-Fragments path for the structural school model; its content is not the same architectural dataset. The compact buildingSMART house remains available for quick identity checks.

Both input paths use the same model registration, content hash, geometry/category checks, selection callback, camera setup, and model replacement cleanup. The on-model contract now adds `sourceFormat` and counts of display components by category. The interface labels preconverted Fragments distinctly from IFC. It does not claim the architecture Fragments file is an original IFC deliverable, or that geometry detail supplies validated carbon or roof quantities.

Default samples are hosted locally so the demo does not depend on external model downloads. They are loaded on request, rather than downloading all sample assets at application startup. Detailed-model rendering and interaction still require browser review; successful build/data checks alone cannot establish GPU performance or pointer picking.

## Architectural sample selection

The sample picker now offers two architectural KIT designs and the original Schependomlaan residential design IFC, alongside the earlier engine tests. These additions answer the need to evaluate building-envelope and roof geometry with clear source provenance. Samples remain within the existing `public/samples/` directory; no dependency, backend or directory restructuring is introduced. KIT's fictional design examples and the documented residential project are labelled distinctly in the UI.

All three new paths exercise the same IFC-to-Fragments adapter used for project uploads. They are original IFC files, not substituted generated meshes. File names are local aliases; source bytes, retrieval dates, source links, permissions and checksums are documented. The 49.3 MB residential IFC loads only when selected; it is not fetched at application startup. Its larger parsing cost is shown in the picker description. Do not infer engineering approval or exact roof usability from import success.

Static preview PNGs are build-independent sample assets made offline from the actual IFC geometry with a depth buffer. They support sample choice and do not stand in for browser verification. The preview-generation tools are not runtime app dependencies. The published source link and file download update with each sample choice. Existing view, inspection and illustrative calculation behavior remains shared across models.

The residential source is stored as `Schependomlaan.ifc.gz` because GitHub's blob-upload API rejected the 49.3 MB original. The existing asset-preparation script uses Node's built-in zlib/crypto capabilities to restore the exact original IFC and verify its published SHA-256 before development or production builds. The generated original IFC is ignored by Git; the server and picker still expose its normal `.ifc` URL. This is offline transport/storage compression, not geometry simplification or a new runtime dependency.

## Camera interaction tuning

The existing Camera Controls instance uses rotation speed 0.9, truck speed 1.8 and dolly speed 2.2. Drag speeds were reduced after user review of the initially faster navigation, while retaining the shorter damping for prompt response. Smooth time is 0.1 seconds, with 0.035 seconds during dragging. Cursor-centred dollying remains enabled. Left drag orbits, right drag pans and the wheel zooms; the footer states these controls explicitly.

Camera `wake`/`sleep` events temporarily disable postproduction throughout movement and damping, including wheel and pinch input. Once motion ends, the selected shaded or technical style returns; basic mode stays basic even if chosen during movement. This reduces work per moving frame without lowering the stationary render resolution or changing model geometry. No dependency or framework change is required. Build checks verify integration; actual pointer feel and frame rate still require browser review.
