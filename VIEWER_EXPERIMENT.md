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


## Procedural 3D planting appearance — 2026-10-09

The old green surface plus per-triangle cone markers has been replaced with a separate procedural Three.js planting module. Low folded foliage/small flowers, volumetric shrubs, climber stems, dense living walls, terrace planter boxes and courtyard trees distinguish the two plans and four region types. World-space procedural texture and perimeter bed edges give the coverage thickness. Area-weighted seeded sampling makes density independent of triangulation, checks sampled plant footprints against modeled holes/edges and caps instances per region. It is an approximate clearance check, not complete collision detection. No external plant assets or new dependencies are used.

An independent in-app browser loaded the 784-component KIT office and added the five conditional roof/facade starting locations using test acknowledgement (299.24 m²). A manually defined 10 × 6 m courtyard outside the conservative building bounding footprint was then added for visual testing. The six-region Light-touch table shows 189 m² rounded coverage and HK$182,128 installation; Landscape mix shows 210 m² and HK$493,356. The same clipped footprints still drive those quantities; decorative plant counts never enter the calculator. The courtyard is a design rectangle, not inferred land ownership or an IFC site boundary.

Actual browser screenshots show low roof planting and sparse wall leaf clusters versus roof shrubs, dense green walls and a courtyard tree. Modeled window holes remain visible on the tested facade. Dense foliage initially became grey under BIM pen/AO passes; the That Open excluded-material pass restores original planting colors after those passes. Base-pass isolation alone made vegetation disappear in technical drawing mode, so it was replaced with this supported rendering path. Final browser checks verify vegetation remains visible and green in shaded, technical drawing and basic modes. Before hides all vegetation and the courtyard bed, preserving the original building; After restores the selected plan. The Before status text now correctly describes the original model rather than proposed planting. The browser logged no errors/warnings in this pass. Screenshots do not establish FPS or suitability. The KIT office has no explicit terrace candidates; planter-box geometry is unit-tested but not browser-accepted on a real terrace.

Twenty-four automated tests pass, including deterministic sampling, disconnected/hole clearance, area-based bounded density, all four systems retaining analytical coverage and finite instance transforms, empty coverage and existing domain validation. Production build passes with the existing large BIM chunk warning. Species, dimensions, spacing and engineering details remain illustrative. Microphone recognition and downloaded report contents remain unverified.


## Textured plant verification — 2026-10-10

Bundled official Poly Haven Fern 02 (1,143,580-byte GLB; four variants, 6,232 source triangles) and Shrub 03 (1,625,884-byte GLB; four variants, 8,287 triangles), with unchanged 1K textures and per-file provenance hashes. No new dependencies. The shader-facing material cache is separate from region overlays, so instances can be rebuilt without destroying source assets.

28 tests pass. Added checks cover both GLB hashes/embedded texture bounds, prototype normalization/source preservation, shared disposal, bounded placement using actual source vertex data on a sloped roof, quantity preservation, individual missing-asset fallback, and planter footprint/base height. Production build passes with the existing large BIM-bundle warning.

An in-app-browser test loads the 784-component KIT office and both plant assets, adds five recommended regions and one manually defined 60 m² courtyard, and switches between textured/simplified planting and shaded/technical/basic modes. Leaf detail is visible on a close-up of the courtyard; textured plants keep their color in technical drawing mode. Before hides planting and After restores it. Landscape totals remain rounded coverage 210 m², installation HK$493,356, and 20-year intervention difference +6,543 kgCO₂e; Light-touch remains 189 m², HK$182,128 and −3,874 kgCO₂e. No console error/warning was captured during this pass.

The synthetic browser acknowledgements are not engineering approval. No explicit terrace exists in this IFC, so terrace asset placement is tested with controlled geometry, not claimed as real-IFC browser acceptance. Species/spacing are concept visuals; facade vegetation and trees are still procedural. This update does not automatically change the published Vercel site.


## Curved roof screening and conforming skin — 2026-10-10

Roof/terrace extraction now partitions upward display triangles by local slope before cropping, confirmation, coverage and calculation. A low whole-component average cannot admit a steep section. Original, eligible and excluded areas and source slope range are retained in each region's screening metadata. The 20° roof / 5° terrace limits are presentation assumptions, not engineering standards. Roof exposure, openings, above-roof obstacles and structural/loading/drainage checks remain unresolved.

31 automated tests pass, and the production build passes with the existing large BIM chunk warning. Controlled barrel-roof tests retain its mild central faces, reject steep sides and an otherwise-low-average mixed surface, preserve crop/source identity, reject excessive confirmed area, and keep both plans' calculation coverage equal to the unmodified clipped source area. Shared area-weighted normal offsets keep coincident display vertices welded and follow curvature; the raised skin's physical area does not replace analytical coverage. Original IFC/source vertices remain unchanged. Actual imported fern/shrub placement tests still pass.

An independent in-app browser loads the 784-component KIT office, identifies 15 conditional roofs / 121 conditional wall candidates / no explicit terraces, and adds the three-roof/two-facade recommended set using a synthetic test acknowledgement. Each selected roof reports 39.7 m² eligible and 7.2 m² excluded by local slope. Green highlights cover only the accepted roof faces, with excluded blue IFC roof portions retaining their source color. The five confirmed regions total 299.24 m² usable area. Light-touch displays 153 m² coverage / HK$158,728 installation; Landscape mix displays 165 m² / HK$432,606. These are assumed intervention calculations, not measurements or quotes.

Close-up screenshots show the planting skin following the retained curved roof and upright decorative plants. Before hides planting without replacing the building; After restores it. Technical drawing mode retains planting color, and switching back to shaded view works. No browser console error/warning was captured in this pass. Saved views: `/private/tmp/greening-curved-roof-selection.png` and `/private/tmp/greening-curved-roof-after.png`. This test acknowledgement does not establish engineering suitability; the published Vercel site is unchanged.


## Simplified Inspect flow — 2026-10-10

Inspect now has an inline text/microphone entry, one current-location card with collapsed usable-area/reason details, and a fixed Preview planting footer. Full source metadata/licensing moves to Project. One expandable Selected locations list distinguishes pending versus confirmed entries; + Ground area opens advanced placement. Whole-set preview requires a consolidated explicit acknowledgement, then enters Compare directly, retaining the original identity/area/atomic confirmation checks. No new dependency or AI/backend service is introduced.

An in-app-browser pass clicks two separate KIT office roofs on the model and verifies persistent 2-location selection, one Roof R02 card and a 79.4 m² summary. Entering 100 m² above its 39.73 m² estimate disables preview; changing it to 30 m² then Use recommendations preserves that edit and expands to five locations / 289.5 m². Preview opens the shared acknowledgement and review list; explicit synthetic test acknowledgement followed by Confirm & preview opens Compare with all five regions. Light-touch displays 147 m² coverage / HK$151,729 installation and Landscape mix 161 m² / HK$424,053. + Ground area prepares a user-defined 10×6 m rectangle outside the building footprint; one custom acknowledgement opens Compare with six regions. These acknowledgements are for demonstration testing, not professional approval. Microphone recognition remains unverified.

A follow-up browser check verifies Enter/Ask with a roof question changes the recommendation set to three roofs while preserving all five selected regions, and Review all opens the unified list. Selecting its Roof R02 entry displays that one current-location card. Final markup/control-reference checks and the production build pass. Responsive styles retain a scrollable body and fixed footer; separate narrow-screen browser acceptance remains pending.

A browser follow-up found whole-document scrolling during list-to-card navigation. The fix scrolls only the Inspect body and clips root overflow. Review all → Roof R02 now leaves workspace top at 0 and header top at 22 px while the panel scrolls internally. No console warning/error was captured in the final normal-viewport pass.


## Direct planting preview routing — 2026-10-10

This supersedes the automatic Compare routing recorded above. Whole-set confirmation, preview of existing confirmed regions and custom-region preview now close Inspect and display planting on the building. The explicit Compare workspace control opens costs/carbon separately; calculation inputs and source checks are unchanged.

An in-app browser verifies Use recommendations → Preview planting → synthetic whole-set acknowledgement → Confirm & preview leaves every panel closed, with After active and planting visible on the KIT office. Reopening Inspect and previewing the existing set also closes the panel without adding duplicate regions. Opening Compare explicitly still shows five confirmed regions and the same two scenario calculations. No browser warning/error was captured. The production build passes. Screenshot: `/private/tmp/greening-preview-without-comparison.png`. No deployment or merge is performed.
