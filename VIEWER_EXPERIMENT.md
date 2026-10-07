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

## Comparison with official That Open examples

This is an implementation comparison, not an observed visual-quality or performance benchmark. The computer-use browser policy check was unavailable for both the local app and the official demo, so camera interaction, pointer picking, WebGL output, and FPS remain unverified.

| Aspect | Official baseline | This app |
| --- | --- | --- |
| IFC conversion | `IfcLoader` converts IFC to Fragments | Same installed conversion pipeline, with local WASM and bundled worker |
| Core render setup | `SimpleScene`, `SimpleRenderer`, `OrthoPerspectiveCamera` | Same core renderer classes, with a pale background and automatic model fit |
| Selection | Highlighter tutorial retrieves selected attributes with `getItemsData` | Same API, single selection, visible identity/attribute panel |
| Rendering extras | Loader example includes a grid and polygon offsets; Highlighter example uses `PostproductionRenderer` | No grid or postproduction renderer; visual effect has not been measured |
| Repeated imports | Loader example demonstrates one hardcoded sample | Local file input, replacement, progress/error feedback and content-based model version |
| Reuse of converted files | Loader tutorial exports `.frag` for future loading | Fragments export/cache is not implemented yet |

References: [official IFC loader tutorial](https://docs.thatopen.com/Tutorials/Components/Core/IfcLoader), [official Highlighter source](https://github.com/ThatOpen/engine_components/blob/main/packages/front/src/fragments/Highlighter/example.ts).

## Browser review still required

Open the app, click **Load building sample**, then confirm visible roof/walls, orbit and zoom, model fit, highlighted selection, and the left roof slab's name/GlobalId. Compare with the [official loader demo](https://thatopen.github.io/engine_components/examples/IfcLoader/) and [official Highlighter demo](https://thatopen.github.io/engine_components/examples/Highlighter/). The official demos use their own hardcoded datasets; a pixel-level comparison requires the same model, camera, viewport, and lighting in both implementations.
