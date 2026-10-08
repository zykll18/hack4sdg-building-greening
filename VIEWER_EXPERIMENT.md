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
