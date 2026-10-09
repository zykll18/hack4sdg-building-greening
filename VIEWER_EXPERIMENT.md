# IFC viewer experiment

## Dataset and reproducible data check

The experiment uses the unchanged, licensed [buildingSMART IFC4 Building-Architecture sample](https://github.com/buildingSMART/Sample-Test-Files/blob/80d976a9b193a26a8e928c3e79bff67af1de68a8/IFC%204.0.2.1%20%28IFC%204%20ADD2%20TC1%29/Simple-Scene/Building-Architecture.ifc). The 142,325-byte file is bundled in `public/samples/` with attribution and a CC BY 4.0 notice.

Run `npm run test:ifc -- public/samples/Building-Architecture.ifc`.

The verified data pipeline returns IFC4, 18 source geometry entries, 13 converted display components, and a Fragments asset of approximately 16.6 KB. These counts refer to different stages and are not interchangeable. Each converted display component retains a GlobalId. Reading roof-slab attributes through Fragments succeeds:

| Component | Local ID | IFC GlobalId | Name |
| --- | --- | --- | --- |
| Roof aggregate | 252 | `2iPwJwpPDCSgMheXwk9cBT` | `house - roof` |
| Left roof slab | 261 | `0ZTBBPo6f6bxqV2K7Oelrq` | `house - roof - slab left` |

The roof aggregate has no placed geometry in this parser result; its slab children carry selectable roof geometry. The chimney is in the default importer class set but has no placed geometry in the source parser result. No extra class configuration is needed.

## Original adapter comparison with official That Open examples

This is an implementation comparison, not an observed visual-quality or performance benchmark. The computer-use browser policy check was unavailable for both the local app and the official demo, so camera interaction, pointer picking, WebGL output, and FPS remain unverified.

| Aspect | Official baseline | Original adapter before detailed-model revision |
| --- | --- | --- |
| IFC conversion | `IfcLoader` converts IFC to Fragments | Same installed conversion pipeline, with local WASM and bundled worker |
| Core render setup | `SimpleScene`, `SimpleRenderer`, `OrthoPerspectiveCamera` | Same core renderer classes, with a pale background and automatic model fit |
| Selection | Highlighter tutorial retrieves selected attributes with `getItemsData` | Same API, single selection, visible identity/attribute panel |
| Rendering extras | Loader example includes a grid and polygon offsets; Highlighter example uses `PostproductionRenderer` | No grid or postproduction renderer; visual effect has not been measured |
| Repeated imports | Loader example demonstrates one hardcoded sample | Local file input, replacement, progress/error feedback and content-based model version |
| Reuse of converted files | Loader tutorial exports `.frag` for future loading | Fragments export/cache is not implemented yet |

References: [official IFC loader tutorial](https://docs.thatopen.com/Tutorials/Components/Core/IfcLoader), [official Highlighter source](https://github.com/ThatOpen/engine_components/blob/main/packages/front/src/fragments/Highlighter/example.ts).

## Browser review still required

Open the app, choose **Small house · test IFC**, click **Open sample model**, then confirm visible roof/walls, orbit and zoom, model fit, highlighted selection, and the left roof slab's name/GlobalId. Compare with the [official loader demo](https://thatopen.github.io/engine_components/examples/IfcLoader/) and [official Highlighter demo](https://thatopen.github.io/engine_components/examples/Highlighter/). The official demos use their own hardcoded datasets; a pixel-level comparison requires the same model, camera, viewport, and lighting in both implementations.

## Detailed-model revision and supplied screenshot

The user's Chrome screenshot confirms that the original compact house renders and that the page reports its 13 components. It does not verify dragging, zooming, pointer picking, or performance. The simple house is a deliberately small source model; its appearance is not evidence of a low geometry-detail ceiling in That Open.

The revised page includes the official school architecture model used by That Open's Highlighter/rendering examples. The pinned unchanged `school_arq.frag` is 3,391,365 bytes; its Git blob hash matches upstream. The data API returns **5,512 display components**, with a GlobalId for each one, including 100 doors, 24 windows, 176 columns, 29 slabs, one roof and other architectural elements. These are source categories, not measured engineering quantities. The school structural IFC is also offered for the complete import/conversion test. It is a different discipline model and is not interchangeable with the architecture sample.

The adapter now uses `PostproductionRenderer`, color/edge/ambient-occlusion styling, SMAA, a grid, camera presets and selectable basic rendering. The app still leaves the library attribution visible. The larger viewport and right-hand property inspector address the cramped initial layout. No decorative geometry or generated facade details are substituted for the source model.

Production build and the four existing data/calculation tests pass. The architecture Fragments identity check passes. Chrome automation still exits before initialization, so the revised WebGL styling, camera controls, expanded layout and pointer picking remain **unverified in-browser**. Compare using the same official architecture Fragments model and renderer style before attributing differences to the engine. Roof usability, greening overlays and carbon data integration remain outside this revision.

The structural school IFC check returns IFC4, 1,548 source geometry entries, **1,526 converted display components**, a 695,546-byte Fragments asset, and no missing converted GlobalIds. The source and converted counts are distinct stages.

## Additional architectural IFC models

All three downloaded source files passed the WebIFC-to-Fragments data check. Counts below distinguish source geometry entries from converted selectable/display components. All converted display components retain GlobalIds.

| File | Schema | Original bytes | Source geometry entries | Converted display components | Fragments bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| KIT-Office.ifc | IFC4 | 10,934,237 | 821 | 784 | 1,532,607 |
| KIT-FZK-Haus.ifc | IFC4 | 2,570,803 | 103 | 90 | 247,362 |
| Schependomlaan.ifc | IFC2X3 | 49,286,967 | 3,643 | 3,510 | 6,454,680 |

The Schependomlaan checksum matches the pinned source LFS pointer. KIT originals have recorded download checksums and source URLs. KIT source describes its office and house as fictional examples; the Schependomlaan publisher documents a project-based architectural design model and associated construction/as-built data.

Locally generated depth-rendered PNG previews show the downloaded placed geometry with simple shading, which was visually inspected: the office has a multi-storey windowed envelope and curved roof, the residential model has masonry-colored walls, dormers and upper flat roof geometry, and the small house has a pitched roof and windows/doors. These are static data-derived previews, not browser screenshots or evidence of FPS/picking. They do not establish that a roof is suitable for greening. The application offers these models for browser review; revised browser rendering and interaction remain unverified.

## Full-viewport workspace review

The model is now the page background, with four initially closed nonmodal panels. The office example loads automatically. Open Project to change model or comparison inputs; select a component to open Inspect; open Compare for the illustrative results and View for camera/render settings. Check that opening a second panel closes the first, closing/Escape returns focus to the dock, uncovered model space still supports navigation, and input values survive closing/reopening. On a narrow viewport, panels use internal scrolling above the dock.

Production build, existing calculation/identity tests and static DOM ID/panel-target checks passed. Native Chrome navigation confirmed the new page title, but its accessibility response omitted the page contents and screenshots returned a uniform blank frame, so visual layout, pointer interaction and native-dialog behavior could not be verified through that tool. This is a browser-observation limitation, not evidence of successful rendering or a diagnosis of an application rendering failure.

For packaging verification, the residential IFC was gzip-compressed and decompressed byte-for-byte identically. The existing asset-preparation script verifies its source SHA-256 before serving/building it. This storage change does not reduce geometry or alter component identities.

## Four-region presentation integration

The viewer now supports confirmed roof/facade/terrace regions from original IFC display faces and user-defined ground rectangles. Upward/outward face filters preserve original triangles; optional edge clipping supports an exposed strip of a larger slab. The same confirmed area and per-system coverage fraction drive proportional overlay surface area and deterministic plan results. Before hides separate overlays without changing IFC geometry. Region removal/model replacement clears planning state and GPU resources. Candidate lookup, confirmation, plan selection and HTML/JSON exports are wired into the floating panels.

Unit tests cover all four region types, aggregation, model-version/duplicate-ID rejection, aggregate budget limits, transforms/face orientation, clipping and visual coverage conservation. Original KIT office geometry is also processed offline through extraction/coverage and both plan calculations. This source-data test assigns region uses synthetically and is not evidence of roof/terrace suitability or real user confirmation.

The browser tool currently reports that the Mac is locked and cannot unlock automatically. Browser acceptance is pending a manual unlock: all region confirmations, scenario and Before/After switching, camera navigation with overlays, removal/replacement, dialogs and matching downloads must be exercised before declaring the presentation accepted. Build or data checks alone do not satisfy that acceptance.


## Chrome review and code audit — 2026-10-09

Native Chrome now shows the full KIT office geometry, reports 784 components, and shows initially closed workspace panels. Opening Inspect shows region type, candidate selection, extent/strip controls and the empty planned-region list. This verifies initial rendering and panel opening only; it does not verify region confirmation, planting overlays or export downloads. The user is actively using Chrome and requested that browser work pause while code checking continues. The earlier Mac-lock blocker no longer describes the current observation.

Code audit fixes the comparison-input shortcut focusing a hidden area field, resets an inherited edge strip when selection changes the inferred region type, makes aggregate budget status visible, preserves entered period/budget in report inputs, and rejects cross-project region aggregation. Budget tests cover zero, omitted and exact-limit budgets plus invalid values. Remaining browser acceptance steps in TEAM_TASKS.md must still be exercised.


## Inspect screening and speech interaction — 2026-10-09

The user's supplied After screenshot shows selection highlighting over a facade and disconnected green triangle coverage. Selection is now muted blue and cleared when showing an After plan; the coverage implementation clips a shared plane against original triangles instead of shrinking each triangle. Small plant markers are positioned only on the clipped planting surface.

Location recommendations and speech controls are integrated in Inspect, together with component properties and region confirmation. The dock retains Project / Inspect / Compare / View / Fit; no independent Assist panel remains. Find candidates screens original IFC identities, display-face orientation, roof slope/upper envelope, explicit terrace identity and ground footprint exclusion. Candidates remain conditional and require exterior/available-area acknowledgement and usable-area confirmation. Unknown wall exterior status cannot be resolved from geometry alone. The current implementation reads scalar source attributes, not nested property sets or exterior occlusion.

Original KIT office source checking yields 15 conditional roof candidates, 121 conditional outward wall candidates and no explicitly identified terrace candidates. The wall count is not a count of verified exterior/plantable walls. The separate four-region geometry/calculation check still assigns an ordinary slab as a synthetic terrace solely to verify clipping, area conservation and arithmetic; the actual screening excludes that assignment. Both plan coverage areas match clipped overlays within source-test tolerance.

All 16 automated tests pass, including compatibility rejection and continuous coverage, and the production build passes. Static markup checks verify unique IDs, valid panel targets and required control references. These checks do not verify browser microphone permission, Cantonese recognition, installed speech voices, final planting appearance, pointer interaction or downloads. Those browser acceptance checks remain pending. The source contains no AI model/backend connection; speech transcripts are user-reviewed and submitted manually to the deterministic screening path.


The user subsequently requested removal of the Read guidance aloud control. The button and browser speech-synthesis handlers have been removed. Inspect retains voice input, reviewed transcripts, text screening explanations and candidate locating. Speech-output acceptance is no longer part of the current flow.


## Combined region proposal — 2026-10-09

Inspect supports multi-select candidates, per-region usable areas, expandable remaining candidates, a suggested starting set, shared acknowledgement and atomic addition to both plans. Single-component locating is an inspection action and no longer limits the proposal to one region. The starting set uses area-ranked compatible candidates with up to three roof, two facade and two explicit terrace regions; it is not an optimised or engineering-approved recommendation.

An independent in-app browser test loaded the 784-component office, found 15 conditional roof/121 conditional wall/no explicit terrace candidates and selected three roof and two facade components. An area of 100 m² on a 39.73 m² roof disabled set addition. After changing that area to 30 m² and acknowledging the synthetic sample regions, the browser added all five together, totalling 289.52 m² confirmed-for-test usable area. Both comparison tables contain all five regions: displayed coverage rounds to 147 m² for Light-touch and 161 m² for Landscape mix; displayed installation costs are HK$151,729 and HK$424,053. These are presentation calculations, not quotes or measured performance. Landscape selection and Before/After controls switch correctly, and the saved model screenshot shows separate roof and facade planting on the same office geometry.

Twenty automated tests pass, including whole-set aggregation, input immutability on a later invalid member, duplicate/stale model rejection, compatibility acknowledgement and ground overlap. Browser export was initiated, but download capture timed out, so downloaded file contents are not yet browser-verified. Microphone recognition and engineering suitability remain unverified. The synthetic test acknowledgement is not a professional approval of the sample walls or roofs.

The final browser pass also verifies the inline invalid-area explanation, disabling already-added candidates, region removal (five to four) making the original component available again, re-adding it through the individual review path (four to five), and replacing the model with KIT-FZK-Haus clearing planned regions, candidate rows and Before/After controls. Browser checkbox confirmation was exercised by keyboard after a pointer automation scroll failed; pointer acceptance of that control is not established by this pass.


## Direct model selection — 2026-10-09

The current flow supersedes checkbox candidate selection. Loading the office automatically highlights five area-ranked conditional starting locations in blue, leaving panels closed. Direct viewport clicks on two separate roof components produce two simultaneous green highlights and a persistent selected count. Repeating one click removes only that component; blank-space and window clicks leave the other choice intact. Inspect shows only chosen-area reviews, and component source details/custom strips/courtyard inputs are collapsed. Recommendation highlights are source-component markers rather than planting coverage; actual planted coverage appears only after confirmation.

An independent in-app browser pass verified 2 selected / 5 recommended, repeat-click cancellation (2→1), blank-space persistence, rejection of Fenster-002 as an incompatible candidate, and selecting a second component again (1→2). An entered 100 m² area above the 39.73 m² display estimate disables set addition. After changing it to 30 m² and test-acknowledging both roof regions, the complete set adds together: 69.72 m² usable area, Light-touch coverage 42 m² / HK$50,198 installation, Landscape mix 28 m² / HK$61,354. Both tables contain both source roofs. After shows planting without blue recommendation overlays. This test acknowledgement is not professional engineering approval. A saved screenshot records two simultaneously selected green roof locations on the original office, with additional recommendations remaining blue.

A follow-up browser pass verifies rerunning screening retains two selected source identities and the edited 30 m² area. Use recommended locations then expands the selection to five while retaining that area (289.52 m² combined usable area). Window resizing during automation changed screenshot coordinates, so model clicks were retargeted from the current viewport before verification.
